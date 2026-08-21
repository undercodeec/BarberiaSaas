import {
  AppointmentPaymentStatus,
  AppointmentStatus,
  CashRegisterStatus,
  CashMovementType,
  MembershipRole,
  MembershipStatus,
  OnlinePaymentStatus,
  PaymentMethod,
  PayphoneConnectionStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import { randomBytes } from 'node:crypto';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
} from '@barber-saas/permissions';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ApiConfig } from './config';
import { reconcileAppointmentCommissions } from './commissions';
import { ApiError } from './errors';
import { payphoneEncryptionKey } from './payphone';
import { decryptPaymentCredential } from './security';

const PAYPHONE_LINKS_URL = 'https://pay.payphonetodoesposible.com/api/Links';
const PAYMENT_LINK_DURATION_MS = 60 * 60 * 1000;
const appointmentParamsSchema = z.object({ appointmentId: z.uuid() });
const manualConfirmationSchema = z.object({
  confirmed: z.literal(true),
  note: z.string().trim().max(500).optional(),
  providerReference: z.string().trim().min(1).max(80),
});

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

function clientTransactionId() {
  return `N${randomBytes(9)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/gu, '')}`.slice(0, 15);
}

export async function requestPayphoneLink({
  amountCents,
  clientTransactionId: transactionId,
  expireInHours = 1,
  reference = 'Reserva Nava',
  storeId,
  token,
}: {
  readonly amountCents: number;
  readonly clientTransactionId: string;
  readonly expireInHours?: number;
  readonly reference?: string;
  readonly storeId: string;
  readonly token: string;
}) {
  let response: Response;
  try {
    response = await fetch(PAYPHONE_LINKS_URL, {
      body: JSON.stringify({
        amount: amountCents,
        amountWithoutTax: amountCents,
        clientTransactionId: transactionId,
        currency: 'USD',
        expireIn: expireInHours,
        isAmountEditable: false,
        oneTime: true,
        reference,
        storeId,
      }),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(
      502,
      'PAYPHONE_UNAVAILABLE',
      'No fue posible crear el enlace de pago.',
    );
  }
  const paymentUrl = (await response.text()).replace(/^"|"$/gu, '').trim();
  if (!response.ok)
    throw new ApiError(
      502,
      'PAYPHONE_LINK_REJECTED',
      'PayPhone rechazó la solicitud de pago.',
    );
  try {
    if (new URL(paymentUrl).protocol !== 'https:') throw new Error('not https');
  } catch {
    throw new ApiError(
      502,
      'PAYPHONE_INVALID_LINK',
      'PayPhone devolvió un enlace de pago no válido.',
    );
  }
  return paymentUrl;
}

export async function createPayphonePaymentLink(
  database: DatabaseClient,
  config: ApiConfig,
  appointmentId: string,
) {
  const appointment = await database.appointment.findUnique({
    include: { services: { select: { priceCents: true } } },
    where: { id: appointmentId },
  });
  if (!appointment)
    throw new ApiError(
      404,
      'PUBLIC_BOOKING_NOT_FOUND',
      'La reserva no existe.',
    );
  if (
    appointment.status === AppointmentStatus.CANCELLED ||
    appointment.status === AppointmentStatus.EXPIRED
  )
    throw new ApiError(
      409,
      'PAYPHONE_BOOKING_UNAVAILABLE',
      'Esta reserva ya no puede recibir pagos.',
    );
  if (appointment.paymentStatus === AppointmentPaymentStatus.PAID)
    return { paymentUrl: null, status: 'confirmed_manually' as const };

  const payphone = await database.payphoneConfiguration.findUnique({
    where: { organizationId: appointment.organizationId },
  });
  if (
    !payphone ||
    !payphone.isEnabled ||
    payphone.connectionStatus !== PayphoneConnectionStatus.CONNECTED
  )
    throw new ApiError(
      409,
      'PAYPHONE_NOT_AVAILABLE',
      'Este negocio no tiene PayPhone activo.',
    );
  if (appointment.services.length === 0)
    throw new ApiError(
      409,
      'PAYPHONE_AMOUNT_INVALID',
      'La reserva no tiene servicios para cobrar.',
    );

  const now = new Date();
  await database.paymentAttempt.updateMany({
    data: { status: OnlinePaymentStatus.EXPIRED },
    where: {
      appointmentId,
      expiresAt: { lte: now },
      status: OnlinePaymentStatus.PENDING,
    },
  });
  const current = await database.paymentAttempt.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      appointmentId,
      expiresAt: { gt: now },
      paymentUrl: { not: null },
      status: OnlinePaymentStatus.PENDING,
    },
  });
  if (current?.paymentUrl)
    return {
      expiresAt: current.expiresAt.toISOString(),
      paymentUrl: current.paymentUrl,
      status: 'pending_verification' as const,
    };

  const amountCents = appointment.services.reduce(
    (total, service) => total + service.priceCents,
    0,
  );
  if (amountCents < 1)
    throw new ApiError(
      409,
      'PAYPHONE_AMOUNT_INVALID',
      'El monto de la reserva no es válido para PayPhone.',
    );
  const attempt = await database.paymentAttempt.create({
    data: {
      amountCents,
      appointmentId,
      clientTransactionId: clientTransactionId(),
      currencyCode: 'USD',
      expiresAt: new Date(now.getTime() + PAYMENT_LINK_DURATION_MS),
      locationId: appointment.locationId,
      organizationId: appointment.organizationId,
      storeId: payphone.storeId,
    },
  });
  try {
    const token = decryptPaymentCredential({
      encodedKey: payphoneEncryptionKey(config),
      encryptedSecret: payphone.encryptedToken,
      organizationId: appointment.organizationId,
    });
    const paymentUrl = await requestPayphoneLink({
      amountCents,
      clientTransactionId: attempt.clientTransactionId,
      storeId: payphone.storeId,
      token,
    });
    const updated = await database.paymentAttempt.update({
      data: { paymentUrl },
      where: { id: attempt.id },
    });
    return {
      expiresAt: updated.expiresAt.toISOString(),
      paymentUrl,
      status: 'pending_verification' as const,
    };
  } catch (error) {
    await database.paymentAttempt.update({
      data: { status: OnlinePaymentStatus.FAILED },
      where: { id: attempt.id },
    });
    throw error;
  }
}

async function requirePaymentManager(database: DatabaseClient, userId: string) {
  const membership = await database.membership.findFirst({
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (!membership)
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Tu cuenta no pertenece a un negocio activo.',
    );
  if (
    !hasPermission(
      membership.role.toLowerCase() as PermissionRole,
      'appointment.manage',
    )
  )
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para registrar cobros de citas.',
    );
  return membership;
}

function assertProfessionalScope(
  membership: { id: string; role: MembershipRole },
  professionalMembershipId: string,
) {
  if (
    membership.role === MembershipRole.BARBER &&
    membership.id !== professionalMembershipId
  )
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Solo puedes registrar cobros de tus propias citas.',
    );
}

function publicManualConfirmation(attempt: {
  amountCents: number;
  clientTransactionId: string;
  currencyCode: string;
  expiresAt: Date;
  id: string;
  manualConfirmationNote: string | null;
  manuallyConfirmedAt: Date | null;
  manuallyConfirmedBy: { fullName: string } | null;
  providerTransactionId: string | null;
  status: OnlinePaymentStatus;
}) {
  return {
    amountCents: attempt.amountCents,
    confirmedAt: attempt.manuallyConfirmedAt?.toISOString() ?? null,
    confirmedByName: attempt.manuallyConfirmedBy?.fullName ?? null,
    currencyCode: attempt.currencyCode,
    expiresAt: attempt.expiresAt.toISOString(),
    id: attempt.id,
    note: attempt.manualConfirmationNote,
    reference: attempt.providerTransactionId,
    status:
      attempt.status === OnlinePaymentStatus.APPROVED &&
      attempt.manuallyConfirmedAt
        ? 'confirmed_manually'
        : attempt.status === OnlinePaymentStatus.EXPIRED
          ? 'expired'
          : 'pending_verification',
    transactionReference: attempt.clientTransactionId,
  };
}

async function paymentContext(
  database: DatabaseClient,
  userId: string,
  appointmentId: string,
) {
  const membership = await requirePaymentManager(database, userId);
  const appointment = await database.appointment.findFirst({
    include: {
      paymentAttempts: {
        include: { manuallyConfirmedBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      },
      services: { orderBy: { sortOrder: 'asc' } },
    },
    where: { id: appointmentId, organizationId: membership.organizationId },
  });
  if (!appointment)
    throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'La cita no existe.');
  assertProfessionalScope(membership, appointment.professionalMembershipId);
  return { appointment, membership };
}

export function registerPayphonePaymentRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get(
    '/v1/appointments/:appointmentId/payphone/manual-confirmation',
    async (request) => {
      const { user } = await authenticate(database, request);
      const { appointmentId } = appointmentParamsSchema.parse(request.params);
      const { appointment, membership } = await paymentContext(
        database,
        user.id,
        appointmentId,
      );
      const configuration = await database.payphoneConfiguration.findUnique({
        where: { organizationId: membership.organizationId },
      });
      const activeConfiguration = Boolean(
        configuration?.isEnabled &&
        configuration.connectionStatus === PayphoneConnectionStatus.CONNECTED,
      );
      const now = new Date();
      const manual = appointment.paymentAttempts.find(
        (attempt) => attempt.manuallyConfirmedAt,
      );
      const pending = appointment.paymentAttempts.find(
        (attempt) =>
          attempt.status === OnlinePaymentStatus.PENDING &&
          attempt.expiresAt > now &&
          Boolean(attempt.paymentUrl),
      );
      const latest =
        manual ?? pending ?? appointment.paymentAttempts[0] ?? null;
      const totalCents = appointment.services.reduce(
        (total, service) => total + service.priceCents,
        0,
      );
      return {
        activeConfiguration,
        appointment: {
          clientName: appointment.clientName,
          startsAt: appointment.startsAt.toISOString(),
          totalCents,
        },
        eligible: Boolean(
          activeConfiguration &&
          appointment.paymentStatus === AppointmentPaymentStatus.PENDING &&
          pending,
        ),
        paymentStatus: appointment.paymentStatus.toLowerCase(),
        attempt: latest ? publicManualConfirmation(latest) : null,
      };
    },
  );

  app.post(
    '/v1/appointments/:appointmentId/payphone/manual-confirmation',
    async (request) => {
      const { user } = await authenticate(database, request);
      const { appointmentId } = appointmentParamsSchema.parse(request.params);
      const input = manualConfirmationSchema.parse(request.body);
      const initial = await paymentContext(database, user.id, appointmentId);
      const now = new Date();
      const result = await database.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${appointmentId}))
        `;
        const appointment = await transaction.appointment.findFirst({
          include: { services: { orderBy: { sortOrder: 'asc' } } },
          where: {
            id: appointmentId,
            organizationId: initial.membership.organizationId,
          },
        });
        if (!appointment)
          throw new ApiError(
            404,
            'APPOINTMENT_NOT_FOUND',
            'La cita no existe.',
          );
        assertProfessionalScope(
          initial.membership,
          appointment.professionalMembershipId,
        );
        const previousManual = await transaction.paymentAttempt.findFirst({
          include: { manuallyConfirmedBy: { select: { fullName: true } } },
          orderBy: { manuallyConfirmedAt: 'desc' },
          where: { appointmentId, manuallyConfirmedAt: { not: null } },
        });
        if (appointment.paymentStatus === AppointmentPaymentStatus.PAID) {
          if (previousManual)
            return { confirmedAttempt: previousManual, idempotent: true };
          throw new ApiError(
            409,
            'APPOINTMENT_PAID_BY_ANOTHER_METHOD',
            'La cita ya fue cobrada mediante otro método.',
          );
        }
        const configuration =
          await transaction.payphoneConfiguration.findUnique({
            where: { organizationId: appointment.organizationId },
          });
        if (
          !configuration?.isEnabled ||
          configuration.connectionStatus !== PayphoneConnectionStatus.CONNECTED
        )
          throw new ApiError(
            409,
            'PAYPHONE_NOT_AVAILABLE',
            'PayPhone debe estar activo para registrar este cobro.',
          );
        await transaction.paymentAttempt.updateMany({
          data: { status: OnlinePaymentStatus.EXPIRED },
          where: {
            appointmentId,
            expiresAt: { lte: now },
            status: OnlinePaymentStatus.PENDING,
          },
        });
        const attempt = await transaction.paymentAttempt.findFirst({
          orderBy: { createdAt: 'desc' },
          where: {
            appointmentId,
            expiresAt: { gt: now },
            paymentUrl: { not: null },
            status: OnlinePaymentStatus.PENDING,
          },
        });
        if (!attempt)
          throw new ApiError(
            409,
            'PAYPHONE_PENDING_ATTEMPT_REQUIRED',
            'No existe un enlace PayPhone vigente pendiente de verificación.',
          );
        const duplicateReference = await transaction.paymentAttempt.findFirst({
          where: {
            id: { not: attempt.id },
            providerTransactionId: input.providerReference,
          },
        });
        if (duplicateReference)
          throw new ApiError(
            409,
            'PAYPHONE_REFERENCE_ALREADY_USED',
            'La referencia de PayPhone ya fue registrada en otro cobro.',
          );
        const session = await transaction.cashRegisterSession.findFirst({
          where: {
            organizationId: appointment.organizationId,
            status: CashRegisterStatus.OPEN,
          },
        });
        if (!session)
          throw new ApiError(
            409,
            'CASH_REGISTER_CLOSED',
            'Abre una caja antes de registrar el cobro PayPhone.',
          );
        const confirmedAttempt = await transaction.paymentAttempt.update({
          data: {
            approvedAt: now,
            manualConfirmationNote: input.note ?? null,
            manuallyConfirmedAt: now,
            manuallyConfirmedByUserId: user.id,
            providerTransactionId: input.providerReference,
            status: OnlinePaymentStatus.APPROVED,
          },
          include: { manuallyConfirmedBy: { select: { fullName: true } } },
          where: { id: attempt.id },
        });
        await transaction.appointment.update({
          data: {
            paymentStatus: AppointmentPaymentStatus.PAID,
            updatedByUserId: user.id,
          },
          where: { id: appointment.id },
        });
        const movement = await transaction.cashMovement.create({
          data: {
            amountCents: attempt.amountCents,
            appointmentId: appointment.id,
            cashRegisterSessionId: session.id,
            createdByUserId: user.id,
            description: 'Cobro PayPhone confirmado manualmente',
            paymentMethod: PaymentMethod.CARD,
            type: CashMovementType.SALE,
          },
        });
        await reconcileAppointmentCommissions(transaction, appointment.id);
        await transaction.auditLog.create({
          data: {
            action: 'payphone.payment_confirmed_manually',
            actorUserId: user.id,
            afterData: {
              amountCents: attempt.amountCents,
              confirmationSource: 'manual',
              paymentAttemptId: attempt.id,
              providerReference: input.providerReference,
            },
            entityId: attempt.id,
            entityType: 'payment_attempt',
            locationId: appointment.locationId,
            organizationId: appointment.organizationId,
          },
        });
        return { confirmedAttempt, idempotent: false, movement };
      });
      return {
        attempt: publicManualConfirmation(result.confirmedAttempt),
        idempotent: result.idempotent,
        movementId: 'movement' in result ? result.movement.id : null,
      };
    },
  );
}
