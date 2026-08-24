import {
  SriEnvironment,
  SriInvoiceStatus,
  SubscriptionPaymentStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import { randomInt, randomUUID } from 'node:crypto';

import type { ApiConfig } from './config';
import { generateSriAccessKey, SRI_INVOICE_DOCUMENT_TYPE } from './sri-core';
import { buildSriInvoiceXml } from './sri-core';
import { SriClient } from './sri-client';
import { buildSriRidePdf } from './sri-ride';
import { signSriInvoiceXml } from './sri-signer';

type Transaction = Parameters<DatabaseClient['$transaction']>[0] extends (
  transaction: infer Value,
) => unknown
  ? Value
  : never;

interface SriIssuingConfiguration {
  readonly accountingRequired: 'SI' | 'NO';
  readonly emissionPointCode: string;
  readonly environment: SriEnvironment;
  readonly establishmentCode: string;
  readonly issuerLegalName: string;
  readonly issuerMainAddress: string;
  readonly issuerRuc: string;
  readonly issuerTradeName: string | null;
  readonly paymentMethodCode: string;
  readonly taxCode: string;
  readonly taxBasisPoints: number;
  readonly taxPercentageCode: string;
  readonly taxRegime: ApiConfig['SRI_TAX_REGIME'];
}

function isDigits(value: string | undefined, length: number) {
  return Boolean(value && new RegExp(`^\\d{${length}}$`, 'u').test(value));
}

export function sriIssuingConfiguration(
  config: ApiConfig,
): SriIssuingConfiguration | null {
  if (
    !isDigits(config.SRI_ISSUER_RUC, 13) ||
    !isDigits(config.SRI_ESTABLISHMENT_CODE, 3) ||
    !isDigits(config.SRI_EMISSION_POINT_CODE, 3) ||
    !isDigits(config.SRI_PAYMENT_METHOD_CODE, 2) ||
    !config.SRI_ISSUER_LEGAL_NAME ||
    !config.SRI_MAIN_ADDRESS ||
    !config.SRI_TAX_CODE ||
    config.SRI_TAX_BASIS_POINTS === undefined ||
    !config.SRI_TAX_PERCENTAGE_CODE ||
    !config.SRI_ACCOUNTING_REQUIRED
  )
    return null;
  return {
    accountingRequired: config.SRI_ACCOUNTING_REQUIRED,
    emissionPointCode: config.SRI_EMISSION_POINT_CODE!,
    environment:
      config.SRI_ENV === 'production'
        ? SriEnvironment.PRODUCTION
        : SriEnvironment.TEST,
    establishmentCode: config.SRI_ESTABLISHMENT_CODE!,
    issuerLegalName: config.SRI_ISSUER_LEGAL_NAME!,
    issuerMainAddress: config.SRI_MAIN_ADDRESS!,
    issuerRuc: config.SRI_ISSUER_RUC!,
    issuerTradeName: config.SRI_ISSUER_TRADE_NAME ?? null,
    paymentMethodCode: config.SRI_PAYMENT_METHOD_CODE!,
    taxCode: config.SRI_TAX_CODE!,
    taxBasisPoints: config.SRI_TAX_BASIS_POINTS,
    taxPercentageCode: config.SRI_TAX_PERCENTAGE_CODE!,
    taxRegime: config.SRI_TAX_REGIME,
  };
}

async function reserveSriSequential(
  transaction: Transaction,
  configuration: SriIssuingConfiguration,
) {
  const rows = await transaction.$queryRaw<
    readonly { readonly lastSequential: number }[]
  >`
    INSERT INTO "sri_document_sequences" (
      "id", "document_type", "establishment_code", "emission_point_code",
      "last_sequential", "created_at", "updated_at"
    ) VALUES (
      ${randomUUID()}::uuid, ${SRI_INVOICE_DOCUMENT_TYPE},
      ${configuration.establishmentCode}, ${configuration.emissionPointCode},
      1, NOW(), NOW()
    )
    ON CONFLICT ("document_type", "establishment_code", "emission_point_code")
    DO UPDATE SET
      "last_sequential" = "sri_document_sequences"."last_sequential" + 1,
      "updated_at" = NOW()
    RETURNING "last_sequential" AS "lastSequential"
  `;
  const sequential = rows[0]?.lastSequential;
  if (!sequential || sequential > 999_999_999)
    throw new Error('El secuencial fiscal SRI se agotó.');
  return sequential;
}

/**
 * Crea exactamente un comprobante fiscal por pago aplicado. Está deliberadamente
 * desacoplada de activar el plan: un problema SRI nunca revierte el pago válido.
 */
export async function enqueueSriInvoiceForPayment(
  database: DatabaseClient,
  config: ApiConfig,
  paymentAttemptId: string,
) {
  const configuration = sriIssuingConfiguration(config);
  if (!configuration) return { created: false, reason: 'SRI_NOT_CONFIGURED' };
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`sri:${paymentAttemptId}`}))
    `;
    const existing = await transaction.sriInvoice.findUnique({
      where: { subscriptionPaymentAttemptId: paymentAttemptId },
    });
    if (existing) return { created: false, reason: 'ALREADY_EXISTS' };
    const payment = await transaction.subscriptionPaymentAttempt.findUnique({
      include: {
        invoice: true,
        organization: { include: { billingProfile: true } },
      },
      where: { id: paymentAttemptId },
    });
    if (!payment || payment.status !== SubscriptionPaymentStatus.APPLIED)
      return { created: false, reason: 'PAYMENT_NOT_APPLIED' };
    const buyer = payment.organization.billingProfile;
    if (!buyer) return { created: false, reason: 'BILLING_PROFILE_REQUIRED' };
    if (payment.invoice.taxBasisPoints !== configuration.taxBasisPoints)
      return { created: false, reason: 'TAX_CONFIGURATION_MISMATCH' };

    const sequential = await reserveSriSequential(transaction, configuration);
    const issuedAt = payment.appliedAt ?? new Date();
    const accessKey = generateSriAccessKey({
      date: issuedAt,
      documentType: SRI_INVOICE_DOCUMENT_TYPE,
      environment:
        configuration.environment === SriEnvironment.PRODUCTION
          ? 'production'
          : 'test',
      establishmentCode: configuration.establishmentCode,
      emissionPointCode: configuration.emissionPointCode,
      numericCode: String(randomInt(100_000_000)).padStart(8, '0'),
      ruc: configuration.issuerRuc,
      sequential,
    });
    const created = await transaction.sriInvoice.create({
      data: {
        accessKey,
        buyerAddress: buyer.address,
        buyerEmail: buyer.email,
        buyerIdentification: buyer.identification,
        buyerIdentificationType: buyer.identificationType,
        buyerName: buyer.legalName,
        buyerPhone: buyer.phone,
        description: `Suscripción Nava ${payment.invoice.planName}`,
        documentType: SRI_INVOICE_DOCUMENT_TYPE,
        emissionPointCode: configuration.emissionPointCode,
        environment: configuration.environment,
        establishmentCode: configuration.establishmentCode,
        issuedAt,
        organizationId: payment.organizationId,
        paymentMethodCode: configuration.paymentMethodCode,
        paymentReference: payment.providerTransactionId,
        planCode: payment.invoice.planCode,
        sequential,
        status: SriInvoiceStatus.PENDING,
        subscriptionInvoiceId: payment.invoiceId,
        subscriptionPaymentAttemptId: payment.id,
        subtotalCents: payment.invoice.subtotalCents,
        taxBasisPoints: payment.invoice.taxBasisPoints,
        taxCents: payment.invoice.taxCents,
        taxCode: configuration.taxCode,
        taxPercentageCode: configuration.taxPercentageCode,
        totalCents: payment.invoice.totalCents,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: 'sri.invoice_queued',
        afterData: {
          accessKey,
          paymentAttemptId: payment.id,
          sequential,
        },
        entityId: created.id,
        entityType: 'sri_invoice',
        organizationId: payment.organizationId,
      },
    });
    return { created: true, invoiceId: created.id, reason: null };
  });
}

/** Recobra pagos ya aplicados tras una caída, sin depender de memoria o Redis. */
export async function enqueuePendingSriInvoices(
  database: DatabaseClient,
  config: ApiConfig,
  limit = 50,
) {
  const payments = await database.subscriptionPaymentAttempt.findMany({
    select: { id: true },
    take: limit,
    where: {
      sriInvoice: null,
      status: SubscriptionPaymentStatus.APPLIED,
    },
  });
  const results = await Promise.all(
    payments.map(({ id }) => enqueueSriInvoiceForPayment(database, config, id)),
  );
  return results.filter(({ created }) => created).length;
}

function sriErrors(
  messages: readonly {
    readonly code: string | null;
    readonly detail: string | null;
    readonly message: string | null;
    readonly type: string | null;
  }[],
) {
  return {
    code: messages[0]?.code ?? null,
    message: messages.length ? JSON.stringify(messages) : null,
  };
}

function nextSriAttempt(config: ApiConfig, attemptCount: number) {
  const multiplier = 2 ** Math.min(attemptCount, 6);
  return new Date(
    Date.now() + config.SRI_AUTHORIZATION_DELAY_SECONDS * 1000 * multiplier,
  );
}

async function processSriInvoice(
  database: DatabaseClient,
  config: ApiConfig,
  invoiceId: string,
) {
  const configuration = sriIssuingConfiguration(config);
  if (
    config.SRI_EMISSION_ENABLED !== 'true' ||
    !configuration ||
    !config.SRI_CERTIFICATE_PATH ||
    !config.SRI_CERTIFICATE_PASSWORD
  )
    return;
  const invoice = await database.sriInvoice.findUnique({
    where: { id: invoiceId },
  });
  if (
    !invoice ||
    invoice.status === SriInvoiceStatus.AUTHORIZED ||
    invoice.status === SriInvoiceStatus.NOT_AUTHORIZED
  )
    return;
  try {
    if (invoice.status === SriInvoiceStatus.PENDING) {
      const xml = buildSriInvoiceXml({
        accessKey: invoice.accessKey,
        buyer: {
          address: invoice.buyerAddress,
          identification: invoice.buyerIdentification,
          identificationType: invoice.buyerIdentificationType,
          name: invoice.buyerName,
        },
        description: invoice.description,
        environment:
          invoice.environment === SriEnvironment.PRODUCTION
            ? 'production'
            : 'test',
        invoiceDate: invoice.issuedAt,
        issuer: {
          accountingRequired: configuration.accountingRequired,
          emissionPointCode: invoice.emissionPointCode,
          establishmentCode: invoice.establishmentCode,
          legalName: configuration.issuerLegalName,
          mainAddress: configuration.issuerMainAddress,
          ruc: configuration.issuerRuc,
          taxRegime: configuration.taxRegime,
          tradeName: configuration.issuerTradeName,
        },
        paymentMethodCode: invoice.paymentMethodCode,
        sequential: invoice.sequential,
        subtotalCents: invoice.subtotalCents,
        tax: {
          cents: invoice.taxCents,
          code: invoice.taxCode,
          percentageCode: invoice.taxPercentageCode,
          rateBasisPoints: invoice.taxBasisPoints,
        },
        totalCents: invoice.totalCents,
      });
      await database.sriInvoice.update({
        data: { status: SriInvoiceStatus.GENERATED, unsignedXml: xml },
        where: { id: invoice.id },
      });
      return;
    }
    if (invoice.status === SriInvoiceStatus.GENERATED && invoice.unsignedXml) {
      const signedXml = await signSriInvoiceXml({
        certificatePassword: config.SRI_CERTIFICATE_PASSWORD,
        certificatePath: config.SRI_CERTIFICATE_PATH,
        xml: invoice.unsignedXml,
      });
      await database.sriInvoice.update({
        data: { signedXml, status: SriInvoiceStatus.SIGNED },
        where: { id: invoice.id },
      });
      return;
    }
    const client = new SriClient(
      invoice.environment === SriEnvironment.PRODUCTION ? 'production' : 'test',
    );
    if (invoice.status === SriInvoiceStatus.SIGNED && invoice.signedXml) {
      const reception = await client.receive(invoice.signedXml);
      if (reception.status === 'DEVUELTA') {
        const errors = sriErrors(reception.messages);
        await database.sriInvoice.update({
          data: {
            sriErrorCode: errors.code,
            sriErrorMessage: errors.message,
            status: SriInvoiceStatus.ERROR,
          },
          where: { id: invoice.id },
        });
        return;
      }
      await database.sriInvoice.update({
        data: {
          nextAttemptAt: nextSriAttempt(config, invoice.attemptCount),
          status: SriInvoiceStatus.RECEIVED,
        },
        where: { id: invoice.id },
      });
      return;
    }
    if (
      invoice.status !== SriInvoiceStatus.RECEIVED &&
      invoice.status !== SriInvoiceStatus.PROCESSING
    )
      return;
    const authorization = await client.authorize(invoice.accessKey);
    if (authorization.status === 'PPR') {
      await database.sriInvoice.update({
        data: {
          attemptCount: { increment: 1 },
          nextAttemptAt: nextSriAttempt(config, invoice.attemptCount),
          status: SriInvoiceStatus.PROCESSING,
        },
        where: { id: invoice.id },
      });
      return;
    }
    const errors = sriErrors(authorization.messages);
    if (authorization.status === 'NAT') {
      await database.sriInvoice.update({
        data: {
          authorizationDate: authorization.authorizationDate,
          authorizationNumber: authorization.authorizationNumber,
          sriErrorCode: errors.code,
          sriErrorMessage: errors.message,
          status: SriInvoiceStatus.NOT_AUTHORIZED,
        },
        where: { id: invoice.id },
      });
      return;
    }
    const authorizedAt = authorization.authorizationDate ?? new Date();
    const authorizedXml = authorization.authorizedXml ?? invoice.signedXml;
    const ridePdf = buildSriRidePdf({
      accessKey: invoice.accessKey,
      authorizationDate: authorizedAt,
      authorizationNumber:
        authorization.authorizationNumber ?? invoice.accessKey,
      buyer: {
        identification: invoice.buyerIdentification,
        name: invoice.buyerName,
      },
      description: invoice.description,
      issuer: {
        legalName: configuration.issuerLegalName,
        ruc: configuration.issuerRuc,
        taxRegime: configuration.taxRegime,
      },
      issuedAt: invoice.issuedAt,
      sequential: invoice.sequential,
      subtotalCents: invoice.subtotalCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
    });
    await database.sriInvoice.update({
      data: {
        authorizationDate: authorizedAt,
        authorizationNumber:
          authorization.authorizationNumber ?? invoice.accessKey,
        authorizedAt,
        authorizedXml,
        ridePdf,
        sriErrorCode: errors.code,
        sriErrorMessage: errors.message,
        status: SriInvoiceStatus.AUTHORIZED,
      },
      where: { id: invoice.id },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 4000)
        : 'Error técnico SRI.';
    await database.sriInvoice.update({
      data: {
        attemptCount: { increment: 1 },
        nextAttemptAt: nextSriAttempt(config, invoice.attemptCount),
        sriErrorCode: 'TECHNICAL_ERROR',
        sriErrorMessage: message,
        status: SriInvoiceStatus.ERROR,
      },
      where: { id: invoice.id },
    });
  }
}

export async function processSriInvoiceQueue(
  database: DatabaseClient,
  config: ApiConfig,
  limit = 25,
) {
  if (config.SRI_EMISSION_ENABLED !== 'true') return 0;
  const invoices = await database.sriInvoice.findMany({
    select: { id: true },
    take: limit,
    where: {
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      status: {
        in: [
          SriInvoiceStatus.PENDING,
          SriInvoiceStatus.GENERATED,
          SriInvoiceStatus.SIGNED,
          SriInvoiceStatus.RECEIVED,
          SriInvoiceStatus.PROCESSING,
          SriInvoiceStatus.ERROR,
        ],
      },
    },
  });
  for (const invoice of invoices)
    await processSriInvoice(database, config, invoice.id);
  return invoices.length;
}
