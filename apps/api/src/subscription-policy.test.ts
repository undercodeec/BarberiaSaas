import {
  PlatformOverrideKind,
  SubscriptionStatus,
} from '@barber-saas/database';
import { describe, expect, it, vi } from 'vitest';

import {
  assertCanCreateClients,
  assertCanCreateTeamMember,
  ensureOrganizationSubscription,
  getEntitlements,
  GRACE_DAYS,
  TRIAL_DAYS,
  planDefinition,
  SUBSCRIPTION_PLANS,
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

function subscriptionTransaction(initial: StoredSubscription, clientCount = 0) {
  let current = { ...initial };
  const plans = SUBSCRIPTION_PLANS.map((definition) => ({
    ...definition,
    id: `plan-${definition.code}`,
  }));
  const findOverrides = vi.fn(async (): Promise<unknown[]> => []);
  const update = vi.fn(
    async ({ data }: { data: Partial<StoredSubscription> }) => {
      current = { ...current, ...data, updatedAt: new Date() };
      return current;
    },
  );
  const transaction = {
    plan: {
      createMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => plans),
      findUnique: vi.fn(async () => null),
    },
    appointment: { count: vi.fn(async () => 0) },
    client: { count: vi.fn(async () => clientCount) },
    location: { count: vi.fn(async () => 1) },
    membership: { count: vi.fn(async () => 12) },
    platformFeatureOverride: {
      findMany: findOverrides,
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
    findOverrides,
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
  it('configura exactamente 10 días de prueba', () => {
    expect(TRIAL_DAYS).toBe(10);
  });

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

    expect(result.subscription.status).toBe(SubscriptionStatus.FREE);
    expect(result.subscription.planId).toBe('plan-free');
    expect(context.update).toHaveBeenCalledTimes(2);
    expect(context.current().status).toBe(SubscriptionStatus.FREE);
  });

  it('convierte una prueba vencida directamente en Nava Free', async () => {
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
    expect(result.subscription.graceEndsAt).toBeNull();
  });

  it('convierte una prueba cuya gracia terminó en Nava Free', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const trialEndsAt = new Date(now.getTime() - (GRACE_DAYS + 1) * DAY_MS);
    const original = storedSubscription({
      currentPeriodEnd: trialEndsAt,
      currentPeriodStart: new Date(trialEndsAt.getTime() - TRIAL_DAYS * DAY_MS),
      graceEndsAt: new Date(trialEndsAt.getTime() + GRACE_DAYS * DAY_MS),
      status: SubscriptionStatus.PAST_DUE,
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

  it('define los planes Esencial, Local y Multi con sus limites y precios', () => {
    const free = planDefinition('free');
    const essential = planDefinition('essential');
    const local = planDefinition('local');
    const multi = planDefinition('multi');

    expect(free).toMatchObject({
      featureFlags: { fullReports: false, inventory: false },
      limits: {
        clients: 100,
        locations: 1,
        rolling30DayBookings: 25,
        teamMembers: 1,
      },
      name: 'Nava Free',
    });
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
      fullReports: true,
      inventory: true,
      team: false,
    });
    expect(local).toMatchObject({
      limits: {
        clients: null,
        locations: 3,
        rolling30DayBookings: null,
        teamMembers: 12,
      },
      monthlyPriceCents: 2983,
      name: 'Nava Local',
    });
    expect(local?.featureFlags).toMatchObject({
      commissions: true,
      fullReports: true,
      inventory: true,
      multiLocation: true,
      team: true,
    });
    expect(multi).toMatchObject({
      limits: {
        clients: null,
        locations: 6,
        rolling30DayBookings: null,
        teamMembers: 40,
      },
      monthlyPriceCents: 4883,
      name: 'Nava Multi',
    });
    expect(multi?.featureFlags).toMatchObject({ multiLocation: true });
  });

  it('aplica excepciones temporales activas a los entitlements reales', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const original = storedSubscription({ planId: 'plan-free' });
    const context = subscriptionTransaction(original);
    context.findOverrides.mockResolvedValue([
      {
        booleanValue: true,
        createdAt: now,
        expiresAt: new Date(now.getTime() + DAY_MS),
        id: 'override-feature',
        integerValue: null,
        key: 'inventory',
        kind: PlatformOverrideKind.FEATURE,
        organizationId: original.organizationId,
        reason: 'Piloto controlado de inventario',
        revokedAt: null,
      },
      {
        booleanValue: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + DAY_MS),
        id: 'override-limit',
        integerValue: 250,
        key: 'clients',
        kind: PlatformOverrideKind.LIMIT,
        organizationId: original.organizationId,
        reason: 'Ampliación temporal de clientes',
        revokedAt: null,
      },
    ]);

    const result = await getEntitlements(
      context.transaction,
      original.organizationId,
      now,
    );

    expect(result.featureFlags.inventory).toBe(true);
    expect(result.limits.clients).toBe(250);
    expect(result.activeOverrides).toHaveLength(2);
  });

  it('rechaza el profesional decimotercero de Nava Local con un límite global', async () => {
    const original = storedSubscription();
    const context = subscriptionTransaction(original);

    await expect(
      assertCanCreateTeamMember(context.transaction, original.organizationId),
    ).rejects.toMatchObject({
      code: 'PLAN_PROFESSIONAL_LIMIT_REACHED',
      message:
        'Alcanzaste el límite de 12 profesionales activos de Nava Local. El límite es total para toda la organización, independientemente de sus sucursales.',
      statusCode: 409,
    });
  });

  it('devuelve solo la capacidad de clientes restante para un lote', async () => {
    const original = storedSubscription({ planId: 'plan-free' });
    const context = subscriptionTransaction(original, 98);

    await expect(
      assertCanCreateClients(context.transaction, original.organizationId, 5),
    ).resolves.toBe(2);
  });
});
