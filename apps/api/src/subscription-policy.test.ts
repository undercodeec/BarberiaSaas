import { SubscriptionStatus } from '@barber-saas/database';
import { describe, expect, it, vi } from 'vitest';

import {
  ensureOrganizationSubscription,
  GRACE_DAYS,
  TRIAL_DAYS,
  planDefinition,
} from './subscription-policy';

const DAY_MS = 24 * 60 * 60 * 1000;

interface StoredSubscription {
  createdAt: Date;
  currentPeriodEnd: Date;
  currentPeriodStart: Date;
  graceEndsAt: Date | null;
  freeBookingGraceUsed: boolean;
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  updatedAt: Date;
}

function subscriptionTransaction(initial: StoredSubscription) {
  let current = { ...initial };
  const update = vi.fn(
    async ({ data }: { data: Partial<StoredSubscription> }) => {
      current = { ...current, ...data, updatedAt: new Date() };
      return current;
    },
  );
  const transaction = {
    plan: {
      upsert: vi.fn(async ({ where }: { where: { code: string } }) => ({
        code: where.code,
        id: `plan-${where.code}`,
      })),
      findUnique: vi.fn(async () => null),
    },
    organization: {
      update: vi.fn(async () => ({})),
    },
    subscription: {
      update,
      upsert: vi.fn(async () => current),
    },
  };
  return {
    current: () => current,
    transaction: transaction as never,
    update,
  };
}

function storedSubscription(
  overrides: Partial<StoredSubscription> = {},
): StoredSubscription {
  const now = new Date('2026-08-10T12:00:00.000Z');
  return {
    createdAt: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS),
    currentPeriodStart: now,
    graceEndsAt: null,
    id: 'subscription-1',
    freeBookingGraceUsed: false,
    organizationId: 'organization-1',
    planId: 'plan-local',
    status: SubscriptionStatus.ACTIVE,
    trialEndsAt: null,
    updatedAt: now,
    ...overrides,
  };
}

describe('política de suscripciones', () => {
  it('mantiene las fechas originales al consultar repetidamente una prueba', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const periodStart = new Date(now.getTime() - DAY_MS);
    const trialEndsAt = new Date(periodStart.getTime() + TRIAL_DAYS * DAY_MS);
    const original = storedSubscription({
      currentPeriodEnd: trialEndsAt,
      currentPeriodStart: periodStart,
      graceEndsAt: new Date(trialEndsAt.getTime() + GRACE_DAYS * DAY_MS),
      status: SubscriptionStatus.TRIAL,
      trialEndsAt,
    });
    const context = subscriptionTransaction(original);

    const first = await ensureOrganizationSubscription(
      context.transaction,
      original.organizationId,
      now,
    );
    const second = await ensureOrganizationSubscription(
      context.transaction,
      original.organizationId,
      new Date(now.getTime() + 60_000),
    );

    expect(first.subscription.currentPeriodStart).toEqual(periodStart);
    expect(second.subscription.trialEndsAt).toEqual(trialEndsAt);
    expect(context.update).not.toHaveBeenCalled();
  });

  it('pasa un plan activo vencido a gracia sin bloquear lecturas', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const periodEnd = new Date(now.getTime() - 2 * DAY_MS);
    const original = storedSubscription({
      currentPeriodEnd: periodEnd,
      graceEndsAt: null,
    });
    const context = subscriptionTransaction(original);

    const result = await ensureOrganizationSubscription(
      context.transaction,
      original.organizationId,
      now,
    );

    expect(result.subscription.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(result.subscription.graceEndsAt).toEqual(
      new Date(periodEnd.getTime() + GRACE_DAYS * DAY_MS),
    );
    expect(result.subscription.trialEndsAt).toBeNull();
  });

  it('suspende de inmediato un plan activo cuyo período de gracia ya terminó', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const original = storedSubscription({
      currentPeriodEnd: new Date(now.getTime() - 8 * DAY_MS),
      graceEndsAt: null,
    });
    const context = subscriptionTransaction(original);

    const result = await ensureOrganizationSubscription(
      context.transaction,
      original.organizationId,
      now,
    );

    expect(result.subscription.status).toBe(SubscriptionStatus.SUSPENDED);
    expect(context.update).toHaveBeenCalledTimes(2);
    expect(context.current().status).toBe(SubscriptionStatus.SUSPENDED);
  });

  it('convierte automaticamente una prueba vencida en Nava Free', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const trialEndsAt = new Date(now.getTime() - DAY_MS);
    const original = storedSubscription({
      currentPeriodEnd: trialEndsAt,
      currentPeriodStart: new Date(trialEndsAt.getTime() - TRIAL_DAYS * DAY_MS),
      status: SubscriptionStatus.TRIAL,
      trialEndsAt,
    });
    const context = subscriptionTransaction(original);

    const result = await ensureOrganizationSubscription(
      context.transaction,
      original.organizationId,
      now,
    );

    expect(result.subscription.status).toBe(SubscriptionStatus.FREE);
    expect(result.subscription.planId).toBe('plan-free');
    expect(result.subscription.trialEndsAt).toBeNull();
  });

  it('define Esencial en USD 9.83 y Local en USD 29.99 con limites distintos', () => {
    const essential = planDefinition('essential');
    const local = planDefinition('local');

    expect(essential).toMatchObject({
      limits: {
        clients: null,
        locations: 1,
        rolling30DayBookings: null,
        teamMembers: 1,
      },
      monthlyPriceCents: 983,
      name: 'Nava Esencial',
    });
    expect(essential?.featureFlags).toMatchObject({
      commissions: false,
      inventory: false,
      team: false,
    });
    expect(local).toMatchObject({
      limits: {
        clients: null,
        locations: 1,
        rolling30DayBookings: null,
        teamMembers: null,
      },
      monthlyPriceCents: 2999,
      name: 'Nava Local',
    });
    expect(local?.featureFlags).toMatchObject({
      commissions: true,
      inventory: true,
      team: true,
    });
  });
});
