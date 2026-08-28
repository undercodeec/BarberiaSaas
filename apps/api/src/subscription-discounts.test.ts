import { describe, expect, it } from 'vitest';

import {
  calculatePercentageDiscountCents,
  normalizeSubscriptionDiscountCode,
  resolveOrganizationDiscount,
} from './subscription-discounts';

const now = new Date('2026-08-28T12:00:00.000Z');

function transactionForDiscount(input: {
  readonly activeGrants?: unknown[];
  readonly coupon?: unknown;
  readonly historicalGrant?: unknown;
  readonly activeReservation?: unknown;
}) {
  const createdReservations: Array<Record<string, unknown>> = [];
  return {
    createdReservations,
    transaction: {
      subscriptionDiscountCoupon: {
        findUnique: async () => input.coupon ?? null,
      },
      subscriptionDiscountGrant: {
        findFirst: async () => input.historicalGrant ?? null,
        findMany: async () => input.activeGrants ?? [],
      },
      subscriptionDiscountReservation: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const reservation = { id: 'reservation-1', ...data };
          createdReservations.push(reservation);
          return reservation;
        },
        findFirst: async () => input.activeReservation ?? null,
      },
    },
  };
}

function coupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coupon-1',
    isActive: true,
    kind: 'TEMPORARY',
    normalizedCode: 'VERANO-25',
    percentageBasisPoints: 2500,
    startsAt: null,
    endsAt: new Date('2026-12-31T23:59:59.000Z'),
    plans: [],
    ...overrides,
  };
}

describe('dominio de descuentos de suscripción', () => {
  it('normaliza códigos y calcula descuentos porcentuales redondeados', () => {
    expect(normalizeSubscriptionDiscountCode('  verano-25 ')).toBe(
      'VERANO-25',
    );
    expect(normalizeSubscriptionDiscountCode('   ')).toBeNull();
    expect(calculatePercentageDiscountCents(1993, 2500)).toBe(498);
    expect(calculatePercentageDiscountCents(1993, 2500)).toBeLessThan(1993);
  });

  it.each([0, 10_000, 10_001])(
    'rechaza porcentajes fuera de 1..99: %i',
    (value) => {
      expect(() => calculatePercentageDiscountCents(1993, value)).toThrow();
    },
  );

  it('selecciona automáticamente una concesión activa aplicable', async () => {
    const activeGrant = {
      couponId: 'coupon-1',
      expiresAtSnapshot: null,
      id: 'grant-1',
      kindSnapshot: 'LIFETIME_CONTINUITY',
      normalizedCodeSnapshot: 'CONTINUIDAD-20',
      percentageBasisPointsSnapshot: 2000,
      coupon: coupon({ kind: 'LIFETIME_CONTINUITY' }),
    };
    const context = transactionForDiscount({ activeGrants: [activeGrant] });

    await expect(
      resolveOrganizationDiscount(context.transaction as never, {
        now,
        organizationId: 'organization-1',
        planId: 'plan-1',
        submittedCode: undefined,
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      couponCode: 'CONTINUIDAD-20',
      couponId: 'coupon-1',
      grantId: 'grant-1',
      isNewRedemption: false,
      kind: 'LIFETIME_CONTINUITY',
      percentageBasisPoints: 2000,
      reservationId: null,
    });
    expect(context.createdReservations).toEqual([]);
  });

  it('reserva un código válido solo para un canje nuevo', async () => {
    const context = transactionForDiscount({ coupon: coupon() });

    await expect(
      resolveOrganizationDiscount(context.transaction as never, {
        now,
        organizationId: 'organization-1',
        planId: 'plan-1',
        submittedCode: ' verano-25 ',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      couponCode: 'VERANO-25',
      couponId: 'coupon-1',
      grantId: null,
      isNewRedemption: true,
      kind: 'TEMPORARY',
      percentageBasisPoints: 2500,
      reservationId: 'reservation-1',
    });
    expect(context.createdReservations).toHaveLength(1);
    expect(context.createdReservations[0]).toMatchObject({
      couponId: 'coupon-1',
      organizationId: 'organization-1',
    });
  });

  it('rechaza un segundo beneficio para evitar acumulación', async () => {
    const activeGrant = {
      couponId: 'coupon-1',
      expiresAtSnapshot: null,
      id: 'grant-1',
      kindSnapshot: 'LIFETIME_CONTINUITY',
      normalizedCodeSnapshot: 'CONTINUIDAD-20',
      percentageBasisPointsSnapshot: 2000,
      coupon: coupon({ kind: 'LIFETIME_CONTINUITY' }),
    };
    const context = transactionForDiscount({ activeGrants: [activeGrant] });

    await expect(
      resolveOrganizationDiscount(context.transaction as never, {
        now,
        organizationId: 'organization-1',
        planId: 'plan-1',
        submittedCode: 'VERANO-25',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({
      code: 'DISCOUNT_BENEFIT_ALREADY_ASSIGNED',
    });
  });

  it('rechaza un código fuera del plan y un canje histórico', async () => {
    const ineligible = transactionForDiscount({
      coupon: coupon({ plans: [{ planId: 'another-plan' }] }),
    });
    await expect(
      resolveOrganizationDiscount(ineligible.transaction as never, {
        now,
        organizationId: 'organization-1',
        planId: 'plan-1',
        submittedCode: 'VERANO-25',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'DISCOUNT_CODE_NOT_APPLICABLE' });

    const redeemed = transactionForDiscount({
      coupon: coupon(),
      historicalGrant: { id: 'grant-older' },
    });
    await expect(
      resolveOrganizationDiscount(redeemed.transaction as never, {
        now,
        organizationId: 'organization-1',
        planId: 'plan-1',
        submittedCode: 'VERANO-25',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'DISCOUNT_CODE_ALREADY_REDEEMED' });
  });
});
