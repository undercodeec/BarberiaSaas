import {
  MembershipRole,
  MembershipStatus,
  SriInvoiceStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ApiError } from './errors';
import type { ApiConfig } from './config';
import { sendSriInvoiceEmail } from './sri-mailer';

const billingProfileSchema = z.object({
  address: z.string().trim().min(1).max(300).nullable().optional(),
  email: z.email().max(100),
  identification: z.string().trim().min(1).max(20),
  identificationType: z.enum(['04', '05', '06', '07', '08']),
  legalName: z.string().trim().min(1).max(300),
  phone: z.string().trim().min(7).max(24).nullable().optional(),
});
const invoiceParamsSchema = z.object({ id: z.uuid() });

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

async function ownerOrganizationId(database: DatabaseClient, userId: string) {
  const memberships = await database.membership.findMany({
    select: { organizationId: true, role: true },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (memberships.length !== 1)
    throw new ApiError(
      409,
      'ORGANIZATION_SELECTION_REQUIRED',
      'Selecciona una sola organización para administrar su facturación.',
    );
  const membership = memberships[0]!;
  if (membership.role !== MembershipRole.OWNER)
    throw new ApiError(
      403,
      'SUBSCRIPTION_OWNER_REQUIRED',
      'Solo el propietario puede administrar datos y comprobantes de facturación.',
    );
  return membership.organizationId;
}

function publicInvoice(invoice: {
  accessKey: string;
  authorizationNumber: string | null;
  deliveryStatus: string;
  id: string;
  issuedAt: Date;
  planCode: string;
  sequential: number;
  status: string;
  totalCents: number;
}) {
  return {
    accessKey: invoice.accessKey,
    authorizationNumber: invoice.authorizationNumber,
    deliveryStatus: invoice.deliveryStatus.toLowerCase(),
    id: invoice.id,
    issuedAt: invoice.issuedAt.toISOString(),
    number: String(invoice.sequential).padStart(9, '0'),
    planCode: invoice.planCode,
    status: invoice.status.toLowerCase(),
    totalCents: invoice.totalCents,
  };
}

export function registerSriBillingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  config: ApiConfig,
) {
  app.get('/v1/subscription/billing-profile', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const profile = await database.organizationBillingProfile.findUnique({
      where: { organizationId },
    });
    return profile
      ? {
          address: profile.address,
          email: profile.email,
          identification: profile.identification,
          identificationType: profile.identificationType,
          legalName: profile.legalName,
          phone: profile.phone,
        }
      : null;
  });

  app.put('/v1/subscription/billing-profile', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const input = billingProfileSchema.parse(request.body);
    if (
      input.identificationType === '07' &&
      input.identification !== '9999999999999'
    )
      throw new ApiError(
        400,
        'SRI_FINAL_CONSUMER_IDENTIFICATION_REQUIRED',
        'La identificación de consumidor final debe ser 9999999999999.',
      );
    const profileData = {
      ...input,
      address: input.address ?? null,
      phone: input.phone ?? null,
    };
    const profile = await database.organizationBillingProfile.upsert({
      create: { organizationId, ...profileData },
      update: profileData,
      where: { organizationId },
    });
    await database.auditLog.create({
      data: {
        action: 'sri.billing_profile_updated',
        actorUserId: user.id,
        entityId: profile.id,
        entityType: 'organization_billing_profile',
        organizationId,
      },
    });
    return { updatedAt: profile.updatedAt.toISOString() };
  });

  app.get('/v1/subscription/invoices', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const invoices = await database.sriInvoice.findMany({
      orderBy: { issuedAt: 'desc' },
      select: {
        accessKey: true,
        authorizationNumber: true,
        deliveryStatus: true,
        id: true,
        issuedAt: true,
        planCode: true,
        sequential: true,
        status: true,
        totalCents: true,
      },
      where: { organizationId },
    });
    return { invoices: invoices.map(publicInvoice) };
  });

  app.get('/v1/subscription/invoices/:id/xml', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const { id } = invoiceParamsSchema.parse(request.params);
    const invoice = await database.sriInvoice.findFirst({
      where: { id, organizationId, status: SriInvoiceStatus.AUTHORIZED },
    });
    if (!invoice?.authorizedXml)
      throw new ApiError(
        404,
        'SRI_INVOICE_NOT_AVAILABLE',
        'El XML autorizado no está disponible.',
      );
    return reply
      .header(
        'Content-Disposition',
        `attachment; filename="${invoice.accessKey}.xml"`,
      )
      .type('application/xml; charset=utf-8')
      .send(invoice.authorizedXml);
  });

  app.get('/v1/subscription/invoices/:id/ride', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const { id } = invoiceParamsSchema.parse(request.params);
    const invoice = await database.sriInvoice.findFirst({
      where: { id, organizationId, status: SriInvoiceStatus.AUTHORIZED },
    });
    if (!invoice?.ridePdf)
      throw new ApiError(
        404,
        'SRI_RIDE_NOT_AVAILABLE',
        'El RIDE autorizado no está disponible.',
      );
    return reply
      .header(
        'Content-Disposition',
        `attachment; filename="RIDE-${invoice.accessKey}.pdf"`,
      )
      .type('application/pdf')
      .send(invoice.ridePdf);
  });

  app.post('/v1/subscription/invoices/:id/resend', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const { id } = invoiceParamsSchema.parse(request.params);
    const invoice = await database.sriInvoice.findFirst({
      select: { id: true },
      where: { id, organizationId, status: SriInvoiceStatus.AUTHORIZED },
    });
    if (!invoice)
      throw new ApiError(
        404,
        'SRI_INVOICE_NOT_AVAILABLE',
        'La factura autorizada no existe.',
      );
    const sent = await sendSriInvoiceEmail(database, config, invoice.id);
    if (!sent)
      throw new ApiError(
        503,
        'SRI_INVOICE_EMAIL_FAILED',
        'No fue posible reenviar la factura.',
      );
    await database.auditLog.create({
      data: {
        action: 'sri.invoice_resent',
        actorUserId: user.id,
        entityId: invoice.id,
        entityType: 'sri_invoice',
        organizationId,
      },
    });
    return { sent: true };
  });
}
