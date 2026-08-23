import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PaymentProviderEventSource,
  PaymentProviderValidationStatus,
  PlatformPaymentConfigurationStatus,
  SubscriptionChangeKind,
  SubscriptionInvoiceStatus,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  type DatabaseClient,
  type Prisma,
} from '@barber-saas/database';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ApiConfig } from './config';
import { ApiError } from './errors';
import { requestPayphoneLink } from './payphone-payments';
import { decryptPlatformPaymentCredential } from './security';
import { ensureOrganizationSubscription } from './subscription-policy';

const CHECKOUT_EXPIRATION_MS = 24 * 60 * 60 * 1000;
const BILLING_PERIOD_DAYS = 30;
export const FOUNDER_LOCAL_PRICE_CENTS = 1993;

const checkoutSchema = z.object({
  discountCode: z.string().trim().min(1).max(80).optional(),
  planCode: z.string().trim().min(1).max(40),
});
const paymentParamsSchema = z.object({ id: z.uuid() });

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

export interface PlatformPaymentProvider {
  createLink(input: {
    readonly amountCents: number;
    readonly currencyCode: string;
    readonly internalReference: string;
    readonly planName: string;
    readonly storeId: string;
  }): Promise<{
    readonly paymentUrl: string;
    readonly providerPayload?: Prisma.InputJsonValue;
  }>;
}

export interface VerifiedPlatformPayment {
  readonly amountCents: number;
  readonly currencyCode: string;
  readonly internalReference: string;
  readonly payload: unknown;
  readonly providerTransactionId: string;
  readonly status: 'approved' | 'rejected';
  readonly storeId: string;
  readonly verifiedAt?: Date;
}

function normalizePromotionCode(value: string | undefined | null) {
  return value?.trim().toUpperCase() || null;
}

type FounderPromotionError =
  | 'DISCOUNT_CODE_INVALID'
  | 'DISCOUNT_CODE_NOT_APPLICABLE'
  | 'FOUNDER_PRICE_CONTINUITY_LOST';

export function resolveFounderPromotion(input: {
  readonly configuredCode: string | undefined;
  readonly founderPriceEligible: boolean;
  readonly founderPriceLostAt: Date | null;
  readonly planCode: string;
  readonly submittedCode: string | undefined;
}): {
  readonly applied: boolean;
  readonly error: FounderPromotionError | null;
  readonly promotionCode: string | null;
} {
  const submittedCode = normalizePromotionCode(input.submittedCode);
  if (input.planCode !== 'local') {
    return {
      applied: false,
      error: submittedCode ? 'DISCOUNT_CODE_NOT_APPLICABLE' : null,
      promotionCode: null,
    };
  }
  if (input.founderPriceEligible)
    return { applied: true, error: null, promotionCode: null };
  if (!submittedCode)
    return { applied: false, error: null, promotionCode: null };
  if (submittedCode !== normalizePromotionCode(input.configuredCode))
    return {
      applied: false,
      error: 'DISCOUNT_CODE_INVALID',
      promotionCode: null,
    };
  if (input.founderPriceLostAt)
    return {
      applied: false,
      error: 'FOUNDER_PRICE_CONTINUITY_LOST',
      promotionCode: null,
    };
  return { applied: true, error: null, promotionCode: submittedCode };
}

export function inclusiveTaxBreakdown(
  finalPriceCents: number,
  taxBasisPoints: number,
) {
  const taxCents = Math.round(
    (finalPriceCents * taxBasisPoints) / (10_000 + taxBasisPoints),
  );
  return { subtotalCents: finalPriceCents - taxCents, taxCents };
}

const SAFE_PROVIDER_PAYLOAD_KEYS = new Map(
  [
    'amount',
    'authorizationcode',
    'clienttransactionid',
    'currency',
    'messagecode',
    'reference',
    'statuscode',
    'storeid',
    'transactionid',
    'transactionstatus',
  ].map((key) => [key, key]),
);

export function sanitizePlatformProviderPayload(
  value: unknown,
): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    const safeKey = SAFE_PROVIDER_PAYLOAD_KEYS.get(key.toLowerCase());
    if (!safeKey) continue;
    if (
      typeof fieldValue === 'string' ||
      typeof fieldValue === 'number' ||
      typeof fieldValue === 'boolean'
    ) {
      sanitized[safeKey] = fieldValue;
    }
  }
  return sanitized;
}

function jsonSnapshot(
  value: Prisma.JsonValue,
  fallback: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
  return value === null ? fallback : value;
}

export function platformPaymentEventHash(
  payment: Pick<
    VerifiedPlatformPayment,
    'internalReference' | 'providerTransactionId' | 'status'
  >,
) {
  return createHash('sha256')
    .update(
      [
        'payphone',
        payment.providerTransactionId,
        payment.internalReference,
        payment.status,
      ].join(':'),
    )
    .digest('hex');
}

export function addBillingDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function internalReference() {
  return `N${randomBytes(7).toString('hex')}`;
}

function idempotencyKey(request: FastifyRequest) {
  const value = request.headers['idempotency-key'];
  if (
    typeof value !== 'string' ||
    value.trim().length < 8 ||
    value.length > 200
  )
    throw new ApiError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Incluye una clave Idempotency-Key válida para iniciar el pago.',
    );
  return createHash('sha256').update(value.trim()).digest('hex');
}

async function activeMemberships(database: DatabaseClient, userId: string) {
  return database.membership.findMany({
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
}

async function ownerScope(database: DatabaseClient, userId: string) {
  const memberships = await activeMemberships(database, userId);
  if (memberships.length === 0)
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Completa el onboarding y crea tu negocio antes de contratar un plan.',
    );
  if (memberships.length > 1)
    throw new ApiError(
      409,
      'ORGANIZATION_SELECTION_REQUIRED',
      'Selecciona una sola organización antes de iniciar el checkout.',
    );
  const membership = memberships[0]!;
  if (membership.role !== MembershipRole.OWNER)
    throw new ApiError(
      403,
      'SUBSCRIPTION_OWNER_REQUIRED',
      'Solo el propietario puede contratar o renovar el plan.',
    );
  return membership;
}

function publicAttempt(attempt: {
  amountCents: number;
  currencyCode: string;
  expiresAt: Date;
  id: string;
  invoice: {
    id: string;
    planCode: string;
    planName: string;
    periodEndsAt: Date | null;
    periodStartsAt: Date | null;
    status: SubscriptionInvoiceStatus;
  };
  paymentUrl: string | null;
  status: SubscriptionPaymentStatus;
}) {
  return {
    amountCents: attempt.amountCents,
    currencyCode: attempt.currencyCode,
    expiresAt: attempt.expiresAt.toISOString(),
    id: attempt.id,
    invoice: {
      id: attempt.invoice.id,
      periodEndsAt: attempt.invoice.periodEndsAt?.toISOString() ?? null,
      periodStartsAt: attempt.invoice.periodStartsAt?.toISOString() ?? null,
      planCode: attempt.invoice.planCode,
      planName: attempt.invoice.planName,
      status: attempt.invoice.status.toLowerCase(),
    },
    paymentUrl: attempt.paymentUrl,
    status: attempt.status.toLowerCase(),
  };
}

function defaultProvider(
  config: ApiConfig,
  configuration: { encryptedToken: string },
): PlatformPaymentProvider {
  return {
    async createLink(input) {
      if (!config.PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY)
        throw new ApiError(
          503,
          'PLATFORM_PAYMENT_ENCRYPTION_NOT_CONFIGURED',
          'El checkout todavía no está configurado.',
        );
      const token = decryptPlatformPaymentCredential({
        encodedKey: config.PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY,
        encryptedSecret: configuration.encryptedToken,
      });
      return {
        paymentUrl: await requestPayphoneLink({
          amountCents: input.amountCents,
          clientTransactionId: input.internalReference,
          expireInHours: 24,
          reference: `Suscripción ${input.planName}`.slice(0, 100),
          storeId: input.storeId,
          token,
        }),
      };
    },
  };
}

export async function applyVerifiedPlatformPayment(
  database: DatabaseClient,
  payment: VerifiedPlatformPayment,
) {
  const eventHash = platformPaymentEventHash(payment);
  const now = payment.verifiedAt ?? new Date();
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${payment.internalReference}))
    `;
    const duplicate = await transaction.paymentProviderEvent.findUnique({
      where: { providerEventHash: eventHash },
    });
    if (duplicate) {
      const attempt = duplicate.subscriptionPaymentAttemptId
        ? await transaction.subscriptionPaymentAttempt.findUnique({
            where: { id: duplicate.subscriptionPaymentAttemptId },
          })
        : null;
      return {
        applied: attempt?.status === SubscriptionPaymentStatus.APPLIED,
        duplicate: true,
        reason: duplicate.validationErrorCode,
      };
    }

    const attempt = await transaction.subscriptionPaymentAttempt.findUnique({
      include: { invoice: { include: { plan: true } } },
      where: { internalReference: payment.internalReference },
    });
    if (!attempt)
      return {
        applied: false,
        duplicate: false,
        reason: 'ATTEMPT_NOT_FOUND',
      };

    const payload = sanitizePlatformProviderPayload(payment.payload);
    const event = await transaction.paymentProviderEvent.create({
      data: {
        internalReference: payment.internalReference,
        organizationId: attempt.organizationId,
        payload,
        providerEventHash: eventHash,
        providerTransactionId: payment.providerTransactionId,
        source: PaymentProviderEventSource.RECONCILIATION,
        subscriptionPaymentAttemptId: attempt.id,
      },
    });
    if (attempt.status === SubscriptionPaymentStatus.APPLIED) {
      await transaction.paymentProviderEvent.update({
        data: {
          processedAt: now,
          validationStatus: PaymentProviderValidationStatus.IGNORED,
        },
        where: { id: event.id },
      });
      return { applied: true, duplicate: true, reason: null };
    }

    const mismatch =
      attempt.amountCents !== payment.amountCents
        ? 'AMOUNT_MISMATCH'
        : attempt.currencyCode !== payment.currencyCode
          ? 'CURRENCY_MISMATCH'
          : attempt.storeId !== payment.storeId
            ? 'STORE_MISMATCH'
            : null;
    if (mismatch) {
      await transaction.paymentProviderEvent.update({
        data: {
          processedAt: now,
          validationErrorCode: mismatch,
          validationStatus: PaymentProviderValidationStatus.INVALID,
        },
        where: { id: event.id },
      });
      return { applied: false, duplicate: false, reason: mismatch };
    }
    if (payment.status === 'rejected') {
      await transaction.subscriptionPaymentAttempt.update({
        data: {
          lastErrorCode: 'PROVIDER_REJECTED',
          providerPayload: payload,
          providerTransactionId: payment.providerTransactionId,
          status: SubscriptionPaymentStatus.REJECTED,
        },
        where: { id: attempt.id },
      });
      await transaction.paymentProviderEvent.update({
        data: {
          processedAt: now,
          validationStatus: PaymentProviderValidationStatus.VERIFIED,
        },
        where: { id: event.id },
      });
      return { applied: false, duplicate: false, reason: 'PROVIDER_REJECTED' };
    }

    const conflictingProviderTransaction =
      await transaction.subscriptionPaymentAttempt.findFirst({
        where: {
          id: { not: attempt.id },
          providerTransactionId: payment.providerTransactionId,
        },
      });
    if (conflictingProviderTransaction) {
      await transaction.paymentProviderEvent.update({
        data: {
          processedAt: now,
          validationErrorCode: 'PROVIDER_TRANSACTION_ALREADY_USED',
          validationStatus: PaymentProviderValidationStatus.INVALID,
        },
        where: { id: event.id },
      });
      return {
        applied: false,
        duplicate: false,
        reason: 'PROVIDER_TRANSACTION_ALREADY_USED',
      };
    }

    const { subscription } = await ensureOrganizationSubscription(
      transaction,
      attempt.organizationId,
      now,
    );
    const previousPlan = await transaction.plan.findUniqueOrThrow({
      where: { id: subscription.planId },
    });
    const renewsCurrentPeriod =
      previousPlan.id === attempt.invoice.planId &&
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > now;
    const periodStartsAt = renewsCurrentPeriod
      ? subscription.currentPeriodEnd
      : now;
    const periodEndsAt = addBillingDays(
      periodStartsAt,
      attempt.invoice.billingPeriodDays,
    );
    const kind = renewsCurrentPeriod
      ? SubscriptionChangeKind.RENEWED
      : subscription.status === SubscriptionStatus.TRIAL ||
          subscription.status === SubscriptionStatus.FREE
        ? SubscriptionChangeKind.ACTIVATED
        : previousPlan.id !== attempt.invoice.planId
          ? SubscriptionChangeKind.PLAN_CHANGED
          : SubscriptionChangeKind.STATUS_CHANGED;

    await transaction.subscription.update({
      data: {
        currentPeriodEnd: periodEndsAt,
        currentPeriodStart: periodStartsAt,
        graceEndsAt: null,
        planId: attempt.invoice.planId,
        renewalReminderSentAt: null,
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        ...(attempt.invoice.founderPriceApplied
          ? {
              founderPriceEligible: true,
              founderPriceLostAt: null,
              founderPriceLossReason: null,
              founderPriceStartedAt: subscription.founderPriceStartedAt ?? now,
            }
          : {}),
      },
      where: { id: subscription.id },
    });
    await transaction.organization.update({
      data: { status: OrganizationStatus.ACTIVE },
      where: { id: attempt.organizationId },
    });
    await transaction.subscriptionInvoice.update({
      data: {
        paidAt: now,
        periodEndsAt,
        periodStartsAt,
        status: SubscriptionInvoiceStatus.PAID,
      },
      where: { id: attempt.invoice.id },
    });
    await transaction.subscriptionPaymentAttempt.update({
      data: {
        appliedAt: now,
        approvedAt: now,
        providerPayload: payload,
        providerTransactionId: payment.providerTransactionId,
        status: SubscriptionPaymentStatus.APPLIED,
      },
      where: { id: attempt.id },
    });
    await transaction.paymentProviderEvent.update({
      data: {
        processedAt: now,
        validationStatus: PaymentProviderValidationStatus.VERIFIED,
      },
      where: { id: event.id },
    });
    await transaction.subscriptionChange.create({
      data: {
        fromPlanCode: previousPlan.code,
        fromStatus: subscription.status,
        invoiceId: attempt.invoice.id,
        kind,
        newPeriodEnd: periodEndsAt,
        newPeriodStart: periodStartsAt,
        organizationId: attempt.organizationId,
        previousPeriodEnd: subscription.currentPeriodEnd,
        reason: 'Pago de suscripción verificado con PayPhone.',
        subscriptionId: subscription.id,
        subscriptionPaymentAttemptId: attempt.id,
        toPlanCode: attempt.invoice.planCode,
        toStatus: SubscriptionStatus.ACTIVE,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: 'subscription.payment_applied',
        afterData: {
          amountCents: attempt.amountCents,
          invoiceId: attempt.invoice.id,
          paymentAttemptId: attempt.id,
          planCode: attempt.invoice.planCode,
          providerTransactionId: payment.providerTransactionId,
        },
        entityId: attempt.id,
        entityType: 'subscription_payment_attempt',
        organizationId: attempt.organizationId,
      },
    });
    return { applied: true, duplicate: false, reason: null };
  });
}

export async function expireStaleSubscriptionPayments(
  database: DatabaseClient,
  now = new Date(),
) {
  return database.$transaction(async (transaction) => {
    const stale = await transaction.subscriptionPaymentAttempt.findMany({
      select: { id: true, invoiceId: true, organizationId: true },
      where: {
        expiresAt: { lte: now },
        status: {
          in: [
            SubscriptionPaymentStatus.CREATED,
            SubscriptionPaymentStatus.LINK_CREATED,
            SubscriptionPaymentStatus.PENDING_PROVIDER,
          ],
        },
      },
    });
    if (stale.length === 0) return 0;
    const attemptIds = stale.map(({ id }) => id);
    const invoiceIds = [...new Set(stale.map(({ invoiceId }) => invoiceId))];
    await transaction.subscriptionPaymentAttempt.updateMany({
      data: { status: SubscriptionPaymentStatus.EXPIRED },
      where: { id: { in: attemptIds } },
    });
    await transaction.subscriptionInvoice.updateMany({
      data: { status: SubscriptionInvoiceStatus.EXPIRED },
      where: {
        id: { in: invoiceIds },
        status: {
          in: [
            SubscriptionInvoiceStatus.OPEN,
            SubscriptionInvoiceStatus.PENDING,
          ],
        },
      },
    });
    return stale.length;
  });
}

export function registerSubscriptionPaymentRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  config: ApiConfig,
  providerOverride?: PlatformPaymentProvider,
) {
  app.get('/v1/subscription/plans', async () => {
    const plans = await database.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      where: { isActive: true, isPublic: true },
    });
    return {
      plans: plans.map((plan) => ({
        code: plan.code,
        currencyCode: plan.currencyCode,
        features: plan.features,
        monthlyPriceCents: plan.monthlyPriceCents,
        name: plan.name,
      })),
    };
  });

  app.get('/v1/subscription/session', async (request) => {
    const { user } = await authenticate(database, request);
    const memberships = await activeMemberships(database, user.id);
    const membership = memberships.length === 1 ? memberships[0]! : null;
    return {
      canCheckout: Boolean(
        membership?.role === MembershipRole.OWNER &&
        config.PLATFORM_PAYMENTS_ENABLED === 'true',
      ),
      checkoutEnabled: config.PLATFORM_PAYMENTS_ENABLED === 'true',
      organization: membership
        ? { id: membership.organization.id, name: membership.organization.name }
        : null,
      reason:
        memberships.length === 0
          ? 'onboarding_required'
          : memberships.length > 1
            ? 'organization_selection_required'
            : membership?.role !== MembershipRole.OWNER
              ? 'owner_required'
              : config.PLATFORM_PAYMENTS_ENABLED !== 'true'
                ? 'checkout_disabled'
                : null,
      role: membership?.role.toLowerCase() ?? null,
    };
  });

  app.post('/v1/subscription/checkout', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const membership = await ownerScope(database, user.id);
    const input = checkoutSchema.parse(request.body);
    const keyHash = idempotencyKey(request);
    const existing = await database.subscriptionPaymentAttempt.findUnique({
      include: { invoice: true },
      where: {
        organizationId_idempotencyKeyHash: {
          idempotencyKeyHash: keyHash,
          organizationId: membership.organizationId,
        },
      },
    });
    if (existing) {
      if (existing.invoice.planCode !== input.planCode)
        throw new ApiError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'La clave de idempotencia ya fue usada para otro plan.',
        );
      return publicAttempt(existing);
    }
    if (config.PLATFORM_PAYMENTS_ENABLED !== 'true')
      throw new ApiError(
        503,
        'SUBSCRIPTION_CHECKOUT_DISABLED',
        'El checkout se habilitará después de completar la validación con PayPhone.',
      );
    const configuration =
      await database.platformPaymentConfiguration.findUnique({
        where: { provider: 'payphone' },
      });
    if (
      !configuration?.isEnabled ||
      configuration.status !== PlatformPaymentConfigurationStatus.READY ||
      !configuration.webhookAuthorizedAt
    )
      throw new ApiError(
        503,
        'PLATFORM_PAYMENT_PROVIDER_NOT_READY',
        'PayPhone todavía no está habilitado para cobrar suscripciones.',
      );

    const created = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`${membership.organizationId}:${keyHash}`}))
      `;
      const repeated = await transaction.subscriptionPaymentAttempt.findUnique({
        include: { invoice: true },
        where: {
          organizationId_idempotencyKeyHash: {
            idempotencyKeyHash: keyHash,
            organizationId: membership.organizationId,
          },
        },
      });
      if (repeated) return { attempt: repeated, created: false };
      const { subscription } = await ensureOrganizationSubscription(
        transaction,
        membership.organizationId,
      );
      const plan = await transaction.plan.findFirst({
        where: {
          code: input.planCode,
          isActive: true,
          isPublic: true,
          monthlyPriceCents: { gt: 0 },
        },
      });
      if (!plan)
        throw new ApiError(
          404,
          'SUBSCRIPTION_PLAN_NOT_AVAILABLE',
          'El plan seleccionado no está disponible para compra.',
        );
      const founderPromotion = resolveFounderPromotion({
        configuredCode: config.PLATFORM_FOUNDER_PROMOTION_CODE,
        founderPriceEligible: subscription.founderPriceEligible,
        founderPriceLostAt: subscription.founderPriceLostAt,
        planCode: plan.code,
        submittedCode: input.discountCode,
      });
      if (founderPromotion.error) {
        const messages = {
          DISCOUNT_CODE_INVALID: 'El código de descuento no es válido.',
          DISCOUNT_CODE_NOT_APPLICABLE:
            'El código de descuento no aplica al plan seleccionado.',
          FOUNDER_PRICE_CONTINUITY_LOST:
            'El precio fundador se perdió al interrumpir la suscripción.',
        } as const;
        throw new ApiError(
          409,
          founderPromotion.error,
          messages[founderPromotion.error],
        );
      }
      if (
        subscription.status === SubscriptionStatus.ACTIVE &&
        subscription.currentPeriodEnd > new Date() &&
        subscription.planId !== plan.id
      )
        throw new ApiError(
          409,
          'PLAN_CHANGE_POLICY_PENDING',
          'Los cambios entre planes activos se habilitarán al aprobar la política comercial.',
        );
      const finalPriceCents = founderPromotion.applied
        ? FOUNDER_LOCAL_PRICE_CENTS
        : plan.monthlyPriceCents!;
      const taxBasisPoints = config.PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS!;
      const { subtotalCents, taxCents } = inclusiveTaxBreakdown(
        finalPriceCents,
        taxBasisPoints,
      );
      const totalCents = finalPriceCents;
      const expiresAt = new Date(Date.now() + CHECKOUT_EXPIRATION_MS);
      const invoice = await transaction.subscriptionInvoice.create({
        data: {
          billingPeriodDays: BILLING_PERIOD_DAYS,
          billingPeriodMonths: 1,
          commercialTermsVersion: config.PLATFORM_SUBSCRIPTION_TERMS_VERSION!,
          currencyCode: plan.currencyCode,
          dueAt: expiresAt,
          featureFlagsSnapshot: jsonSnapshot(plan.featureFlags, {}),
          featuresSnapshot: jsonSnapshot(plan.features, []),
          limitsSnapshot: jsonSnapshot(plan.limits, {}),
          organizationId: membership.organizationId,
          planCode: plan.code,
          planId: plan.id,
          planName: plan.name,
          promotionCode: founderPromotion.promotionCode,
          promotionDiscountCents: founderPromotion.applied
            ? plan.monthlyPriceCents! - FOUNDER_LOCAL_PRICE_CENTS
            : 0,
          requestedByUserId: user.id,
          subtotalCents,
          taxBasisPoints,
          taxCents,
          totalCents,
          founderPriceApplied: founderPromotion.applied,
        },
      });
      const attempt = await transaction.subscriptionPaymentAttempt.create({
        data: {
          amountCents: totalCents,
          currencyCode: plan.currencyCode,
          expiresAt,
          idempotencyKeyHash: keyHash,
          initiatedByUserId: user.id,
          internalReference: internalReference(),
          invoiceId: invoice.id,
          organizationId: membership.organizationId,
          storeId: configuration.storeId,
        },
        include: { invoice: true },
      });
      await transaction.auditLog.create({
        data: {
          action: 'subscription.checkout_created',
          actorUserId: user.id,
          afterData: {
            amountCents: totalCents,
            currencyCode: plan.currencyCode,
            invoiceId: invoice.id,
            planCode: plan.code,
            taxBasisPoints,
          },
          entityId: attempt.id,
          entityType: 'subscription_payment_attempt',
          organizationId: membership.organizationId,
        },
      });
      return { attempt, created: true };
    });
    if (!created.created) return publicAttempt(created.attempt);

    const provider = providerOverride ?? defaultProvider(config, configuration);
    try {
      const link = await provider.createLink({
        amountCents: created.attempt.amountCents,
        currencyCode: created.attempt.currencyCode,
        internalReference: created.attempt.internalReference,
        planName: created.attempt.invoice.planName,
        storeId: created.attempt.storeId,
      });
      const attempt = await database.$transaction(async (transaction) => {
        const updated = await transaction.subscriptionPaymentAttempt.update({
          data: {
            paymentUrl: link.paymentUrl,
            ...(link.providerPayload === undefined
              ? {}
              : { providerPayload: link.providerPayload }),
            status: SubscriptionPaymentStatus.PENDING_PROVIDER,
          },
          where: { id: created.attempt.id },
        });
        await transaction.subscriptionInvoice.update({
          data: { status: SubscriptionInvoiceStatus.PENDING },
          where: { id: created.attempt.invoiceId },
        });
        return transaction.subscriptionPaymentAttempt.findUniqueOrThrow({
          include: { invoice: true },
          where: { id: updated.id },
        });
      });
      return reply.code(201).send(publicAttempt(attempt));
    } catch (error) {
      await database.$transaction([
        database.subscriptionPaymentAttempt.update({
          data: {
            lastErrorCode:
              error instanceof ApiError ? error.code : 'PROVIDER_UNAVAILABLE',
            status: SubscriptionPaymentStatus.FAILED,
          },
          where: { id: created.attempt.id },
        }),
        database.subscriptionInvoice.update({
          data: { status: SubscriptionInvoiceStatus.VOID },
          where: { id: created.attempt.invoiceId },
        }),
      ]);
      throw error;
    }
  });

  app.get('/v1/subscription/payments/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await ownerScope(database, user.id);
    const { id } = paymentParamsSchema.parse(request.params);
    await expireStaleSubscriptionPayments(database);
    const attempt = await database.subscriptionPaymentAttempt.findFirst({
      include: { invoice: true },
      where: { id, organizationId: membership.organizationId },
    });
    if (!attempt)
      throw new ApiError(
        404,
        'SUBSCRIPTION_PAYMENT_NOT_FOUND',
        'El intento de pago no existe.',
      );
    return publicAttempt(attempt);
  });
}
