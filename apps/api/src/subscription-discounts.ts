import {
  SubscriptionDiscountGrantStatus,
  type Prisma,
} from '@barber-saas/database';

import { ApiError, isUniqueConstraintError } from './errors';

const DEFAULT_RESERVATION_DURATION_MS = 24 * 60 * 60 * 1000;

export interface ResolvedSubscriptionDiscount {
  readonly couponId: string;
  readonly couponCode: string;
  readonly grantId: string | null;
  readonly isNewRedemption: boolean;
  readonly kind: 'TEMPORARY' | 'LIFETIME_CONTINUITY';
  readonly percentageBasisPoints: number;
  readonly reservationId: string | null;
}

export interface ResolveOrganizationDiscountInput {
  readonly now: Date;
  readonly organizationId: string;
  readonly planId: string;
  readonly reservationExpiresAt?: Date;
  readonly submittedCode: string | null | undefined;
  readonly userId: string;
}

function discountError(
  code:
    | 'DISCOUNT_BENEFIT_ALREADY_ASSIGNED'
    | 'DISCOUNT_CODE_ALREADY_REDEEMED'
    | 'DISCOUNT_CODE_INVALID'
    | 'DISCOUNT_CODE_NOT_APPLICABLE',
) {
  const messages = {
    DISCOUNT_BENEFIT_ALREADY_ASSIGNED:
      'La organización ya tiene un beneficio de descuento asignado.',
    DISCOUNT_CODE_ALREADY_REDEEMED:
      'Este código ya fue canjeado por la organización.',
    DISCOUNT_CODE_INVALID: 'El código de descuento no es válido.',
    DISCOUNT_CODE_NOT_APPLICABLE:
      'El código de descuento no aplica al plan seleccionado.',
  } as const;
  return new ApiError(409, code, messages[code]);
}

function couponAppliesToPlan(
  coupon: { readonly plans: ReadonlyArray<{ readonly planId: string }> },
  planId: string,
) {
  return coupon.plans.length === 0 || coupon.plans.some((plan) => plan.planId === planId);
}

export function calculatePercentageDiscountCents(
  fullPriceCents: number,
  percentageBasisPoints: number,
) {
  if (!Number.isInteger(fullPriceCents) || fullPriceCents <= 0)
    throw new Error('El precio debe ser un entero positivo.');
  if (
    !Number.isInteger(percentageBasisPoints) ||
    percentageBasisPoints < 100 ||
    percentageBasisPoints > 9900
  )
    throw new Error('El porcentaje debe estar entre 1 y 99.');
  return Math.round((fullPriceCents * percentageBasisPoints) / 10_000);
}

export function normalizeSubscriptionDiscountCode(
  value: string | null | undefined,
) {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized || null;
}

export async function resolveOrganizationDiscount(
  transaction: Prisma.TransactionClient,
  input: ResolveOrganizationDiscountInput,
): Promise<ResolvedSubscriptionDiscount | null> {
  const activeGrants = await transaction.subscriptionDiscountGrant.findMany({
    include: { coupon: { include: { plans: true } } },
    where: {
      organizationId: input.organizationId,
      status: SubscriptionDiscountGrantStatus.ACTIVE,
      OR: [
        { expiresAtSnapshot: null },
        { expiresAtSnapshot: { gt: input.now } },
      ],
    },
  });
  const applicableGrants = activeGrants.filter((grant) =>
    couponAppliesToPlan(grant.coupon, input.planId),
  );
  const submittedCode = normalizeSubscriptionDiscountCode(input.submittedCode);

  if (applicableGrants.length > 1)
    throw discountError('DISCOUNT_BENEFIT_ALREADY_ASSIGNED');
  if (applicableGrants.length === 1) {
    const grant = applicableGrants[0]!;
    if (
      submittedCode &&
      submittedCode !== grant.normalizedCodeSnapshot
    )
      throw discountError('DISCOUNT_BENEFIT_ALREADY_ASSIGNED');
    return {
      couponCode: grant.normalizedCodeSnapshot,
      couponId: grant.couponId,
      grantId: grant.id,
      isNewRedemption: false,
      kind: grant.kindSnapshot,
      percentageBasisPoints: grant.percentageBasisPointsSnapshot,
      reservationId: null,
    };
  }

  if (!submittedCode) return null;
  if (activeGrants.length > 0)
    throw discountError('DISCOUNT_BENEFIT_ALREADY_ASSIGNED');

  const coupon = await transaction.subscriptionDiscountCoupon.findUnique({
    include: { plans: true },
    where: { normalizedCode: submittedCode },
  });
  if (
    !coupon ||
    !coupon.isActive ||
    (coupon.startsAt && coupon.startsAt > input.now) ||
    (coupon.kind === 'TEMPORARY' && (!coupon.endsAt || coupon.endsAt <= input.now))
  )
    throw discountError('DISCOUNT_CODE_INVALID');
  if (!couponAppliesToPlan(coupon, input.planId))
    throw discountError('DISCOUNT_CODE_NOT_APPLICABLE');

  const historicalGrant = await transaction.subscriptionDiscountGrant.findFirst({
    where: {
      couponId: coupon.id,
      organizationId: input.organizationId,
    },
  });
  if (historicalGrant) throw discountError('DISCOUNT_CODE_ALREADY_REDEEMED');

  const activeReservation =
    await transaction.subscriptionDiscountReservation.findFirst({
      where: {
        organizationId: input.organizationId,
        releasedAt: null,
      },
    });
  if (activeReservation) throw discountError('DISCOUNT_BENEFIT_ALREADY_ASSIGNED');

  try {
    const reservation = await transaction.subscriptionDiscountReservation.create({
      data: {
        couponId: coupon.id,
        expiresAt:
          input.reservationExpiresAt ??
          new Date(input.now.getTime() + DEFAULT_RESERVATION_DURATION_MS),
        organizationId: input.organizationId,
      },
    });
    return {
      couponCode: coupon.normalizedCode,
      couponId: coupon.id,
      grantId: null,
      isNewRedemption: true,
      kind: coupon.kind,
      percentageBasisPoints: coupon.percentageBasisPoints,
      reservationId: reservation.id,
    };
  } catch (error) {
    if (isUniqueConstraintError(error))
      throw discountError('DISCOUNT_BENEFIT_ALREADY_ASSIGNED');
    throw error;
  }
}
