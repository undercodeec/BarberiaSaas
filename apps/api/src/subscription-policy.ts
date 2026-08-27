import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PlatformOverrideKind,
  SubscriptionStatus,
  type DatabaseClient,
  type Prisma,
} from '@barber-saas/database';

import { ApiError } from './errors';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_BOOKING_WINDOW_DAYS = 30;
export const TRIAL_DAYS = 10;
export const GRACE_DAYS = 3;
export const FREE_BOOKING_GRACE = 5;

export interface PlanLimits {
  readonly clients: number | null;
  readonly locations: number;
  readonly rolling30DayBookings: number | null;
  readonly teamMembers: number | null;
}

export interface PlanFeatureFlags {
  readonly commissions: boolean;
  readonly fullReports: boolean;
  readonly inventory: boolean;
  readonly multiLocation: boolean;
  readonly publicBooking: boolean;
  readonly reports: boolean;
  readonly team: boolean;
  readonly wallet: boolean;
}

export const SUBSCRIPTION_PLANS = [
  {
    available: true,
    code: 'free',
    featureFlags: {
      commissions: false,
      fullReports: false,
      inventory: false,
      multiLocation: false,
      publicBooking: true,
      reports: true,
      team: false,
      wallet: true,
    },
    features: [
      '1 profesional',
      '1 sucursal',
      '25 reservas en los ultimos 30 dias',
      '100 clientes activos',
      'Agenda y reservas publicas',
      'Caja y reportes basicos',
    ],
    limits: {
      clients: 100,
      locations: 1,
      rolling30DayBookings: 25,
      teamMembers: 1,
    },
    monthlyPriceCents: 0,
    name: 'Nava Free',
    sortOrder: 10,
  },
  {
    available: true,
    code: 'essential',
    featureFlags: {
      commissions: false,
      fullReports: true,
      inventory: true,
      multiLocation: false,
      publicBooking: true,
      reports: true,
      team: false,
      wallet: true,
    },
    features: [
      '1 profesional activo y 1 sucursal',
      'Reservas y clientes ilimitados',
      'Agenda y reservas publicas',
      'Servicios e historial de clientes',
      'Caja operativa, inventario y reportes completos',
    ],
    limits: {
      clients: null,
      locations: 1,
      rolling30DayBookings: null,
      teamMembers: 1,
    },
    monthlyPriceCents: 983,
    name: 'Nava Esencial',
    sortOrder: 20,
  },
  {
    available: true,
    code: 'local',
    featureFlags: {
      commissions: true,
      fullReports: true,
      inventory: true,
      multiLocation: true,
      publicBooking: true,
      reports: true,
      team: true,
      wallet: true,
    },
    features: [
      'Hasta 3 sucursales',
      'Hasta 12 profesionales en total para toda la organizacion',
      'Reservas y clientes ilimitados',
      'Caja, POS y comisiones',
      'Inventario, reportes completos, roles y permisos',
      '0% de comision por reservas directas',
    ],
    limits: {
      clients: null,
      locations: 3,
      rolling30DayBookings: null,
      teamMembers: 12,
    },
    monthlyPriceCents: 2983,
    name: 'Nava Local',
    sortOrder: 30,
  },
  {
    available: true,
    code: 'multi',
    featureFlags: {
      commissions: true,
      fullReports: true,
      inventory: true,
      multiLocation: true,
      publicBooking: true,
      reports: true,
      team: true,
      wallet: true,
    },
    features: [
      'Hasta 6 sucursales',
      'Hasta 40 profesionales en total para toda la organizacion',
      'Reservas y clientes ilimitados',
      'Caja, POS, comisiones e inventario por sucursal',
      'Reportes completos, roles y permisos',
      '0% de comision por reservas directas',
    ],
    limits: {
      clients: null,
      locations: 6,
      rolling30DayBookings: null,
      teamMembers: 40,
    },
    monthlyPriceCents: 4883,
    name: 'Nava Multi',
    sortOrder: 40,
  },
] as const;

function nullableLimit(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function parsePlanLimits(value: Prisma.JsonValue): PlanLimits {
  const limits =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    clients: nullableLimit(limits.clients),
    locations: nullableLimit(limits.locations) ?? 1,
    rolling30DayBookings: nullableLimit(limits.rolling30DayBookings),
    teamMembers: nullableLimit(limits.teamMembers),
  };
}

export function parsePlanFeatureFlags(
  value: Prisma.JsonValue,
): PlanFeatureFlags {
  const flags =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    commissions: flags.commissions === true,
    fullReports: flags.fullReports === true,
    inventory: flags.inventory === true,
    multiLocation: flags.multiLocation === true,
    publicBooking: flags.publicBooking !== false,
    reports: flags.reports === true,
    team: flags.team === true,
    wallet: flags.wallet === true,
  };
}

export async function ensureOrganizationSubscription(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  now = new Date(),
) {
  const storedPlans = [];
  for (const definition of SUBSCRIPTION_PLANS) {
    storedPlans.push(
      await transaction.plan.upsert({
        create: {
          code: definition.code,
          featureFlags: definition.featureFlags,
          features: [...definition.features],
          isPublic: definition.available,
          limits: definition.limits,
          monthlyPriceCents: definition.monthlyPriceCents,
          name: definition.name,
          sortOrder: definition.sortOrder,
        },
        update: {
          featureFlags: definition.featureFlags,
          features: [...definition.features],
          isActive: true,
          isPublic: definition.available,
          limits: definition.limits,
          monthlyPriceCents: definition.monthlyPriceCents,
          name: definition.name,
          sortOrder: definition.sortOrder,
        },
        where: { code: definition.code },
      }),
    );
  }

  const free = storedPlans.find(({ code }) => code === 'free');
  const essential = storedPlans.find(({ code }) => code === 'essential');
  const local = storedPlans.find(({ code }) => code === 'local');
  if (!free || !essential || !local)
    throw new Error('Los planes de Nava no estan disponibles.');

  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  let subscription = await transaction.subscription.upsert({
    create: {
      currentPeriodEnd: trialEndsAt,
      currentPeriodStart: now,
      graceEndsAt: null,
      organizationId,
      planId: local.id,
      status: SubscriptionStatus.TRIAL,
      trialEndsAt,
    },
    update: {},
    where: { organizationId },
  });

  if (!storedPlans.some(({ id }) => id === subscription.planId)) {
    const legacyPlan = await transaction.plan.findUnique({
      where: { id: subscription.planId },
    });
    if (legacyPlan?.code === 'solo' || legacyPlan?.code === 'multi') {
      const replacementPlan = legacyPlan.code === 'solo' ? essential : local;
      subscription = await transaction.subscription.update({
        data: { planId: replacementPlan.id },
        where: { id: subscription.id },
      });
    }
  }

  const legacyTrialEnd = new Date(
    subscription.currentPeriodStart.getTime() + 7 * DAY_MS,
  );
  const configuredTrialEnd = new Date(
    subscription.currentPeriodStart.getTime() + TRIAL_DAYS * DAY_MS,
  );
  if (
    subscription.status === SubscriptionStatus.TRIAL &&
    subscription.trialEndsAt?.getTime() === legacyTrialEnd.getTime() &&
    subscription.currentPeriodEnd.getTime() === legacyTrialEnd.getTime() &&
    subscription.trialEndsAt > now
  ) {
    subscription = await transaction.subscription.update({
      data: {
        currentPeriodEnd: configuredTrialEnd,
        graceEndsAt: null,
        trialEndsAt: configuredTrialEnd,
      },
      where: { id: subscription.id },
    });
  }

  if (
    subscription.status === SubscriptionStatus.TRIAL &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt <= now
  ) {
    subscription = await transaction.subscription.update({
      data: {
        graceEndsAt: null,
        planId: free.id,
        status: SubscriptionStatus.FREE,
        trialEndsAt: null,
      },
      where: { id: subscription.id },
    });
    await transaction.organization.update({
      data: { status: OrganizationStatus.ACTIVE },
      where: { id: organizationId },
    });
  }

  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd <= now
  ) {
    const configuredGraceEnd = subscription.graceEndsAt;
    const graceEndsAt =
      configuredGraceEnd && configuredGraceEnd > subscription.currentPeriodEnd
        ? configuredGraceEnd
        : new Date(
            subscription.currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS,
          );
    subscription = await transaction.subscription.update({
      data: {
        graceEndsAt,
        status: SubscriptionStatus.PAST_DUE,
        trialEndsAt: null,
      },
      where: { id: subscription.id },
    });
  }

  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    (!subscription.graceEndsAt ||
      subscription.graceEndsAt <= subscription.currentPeriodEnd)
  ) {
    subscription = await transaction.subscription.update({
      data: {
        graceEndsAt: new Date(
          subscription.currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS,
        ),
      },
      where: { id: subscription.id },
    });
  }

  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    subscription.graceEndsAt &&
    subscription.graceEndsAt <= now
  ) {
    if (subscription.trialEndsAt) {
      subscription = await transaction.subscription.update({
        data: {
          graceEndsAt: null,
          planId: free.id,
          status: SubscriptionStatus.FREE,
          trialEndsAt: null,
        },
        where: { id: subscription.id },
      });
      await transaction.organization.update({
        data: { status: OrganizationStatus.ACTIVE },
        where: { id: organizationId },
      });
    } else {
      subscription = await transaction.subscription.update({
        data: {
          graceEndsAt: null,
          ...(subscription.founderPriceEligible
            ? {
                founderPriceEligible: false,
                founderPriceLostAt: now,
                founderPriceLossReason: 'payment_continuity_interrupted',
              }
            : {}),
          planId: free.id,
          status: SubscriptionStatus.FREE,
          trialEndsAt: null,
        },
        where: { id: subscription.id },
      });
      await transaction.organization.update({
        data: { status: OrganizationStatus.ACTIVE },
        where: { id: organizationId },
      });
    }
  }

  return { plans: storedPlans, subscription };
}

/** Applies expiry rules even when the organization has no active session. */
export async function reconcileSubscriptionLifecycle(
  database: DatabaseClient,
  now = new Date(),
) {
  const candidates = await database.subscription.findMany({
    select: { organizationId: true },
    where: {
      OR: [
        { status: SubscriptionStatus.TRIAL, trialEndsAt: { lte: now } },
        { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { lte: now } },
        { status: SubscriptionStatus.PAST_DUE, graceEndsAt: { lte: now } },
      ],
    },
  });
  for (const { organizationId } of candidates) {
    await database.$transaction((transaction) =>
      ensureOrganizationSubscription(transaction, organizationId, now),
    );
  }
  return candidates.length;
}

export function planDefinition(code: string) {
  return SUBSCRIPTION_PLANS.find((definition) => definition.code === code);
}

export async function getEntitlements(
  database: Prisma.TransactionClient,
  organizationId: string,
  now = new Date(),
) {
  const { plans, subscription } = await ensureOrganizationSubscription(
    database,
    organizationId,
    now,
  );
  const plan = plans.find(({ id }) => id === subscription.planId);
  if (!plan) throw new Error('La suscripcion no tiene un plan valido.');
  const overrides = await database.platformFeatureOverride.findMany({
    orderBy: { createdAt: 'desc' },
    where: {
      expiresAt: { gt: now },
      organizationId,
      revokedAt: null,
    },
  });
  const featureFlags = {
    ...parsePlanFeatureFlags(plan.featureFlags),
  } as { -readonly [Key in keyof PlanFeatureFlags]: PlanFeatureFlags[Key] };
  const limits = {
    ...parsePlanLimits(plan.limits),
  } as { -readonly [Key in keyof PlanLimits]: PlanLimits[Key] };
  const appliedKeys = new Set<string>();
  const appliedOverrideIds = new Set<string>();
  for (const override of overrides) {
    if (appliedKeys.has(override.key)) continue;
    if (
      override.kind === PlatformOverrideKind.FEATURE &&
      override.key in featureFlags &&
      override.booleanValue !== null
    ) {
      featureFlags[override.key as keyof PlanFeatureFlags] =
        override.booleanValue;
      appliedKeys.add(override.key);
      appliedOverrideIds.add(override.id);
    }
    if (override.kind === PlatformOverrideKind.LIMIT) {
      if (override.key === 'locations' && override.integerValue !== null) {
        limits.locations = override.integerValue;
        appliedKeys.add(override.key);
        appliedOverrideIds.add(override.id);
      } else if (override.key === 'clients') {
        limits.clients = override.integerValue;
        appliedKeys.add(override.key);
        appliedOverrideIds.add(override.id);
      } else if (override.key === 'rolling30DayBookings') {
        limits.rolling30DayBookings = override.integerValue;
        appliedKeys.add(override.key);
        appliedOverrideIds.add(override.id);
      } else if (override.key === 'teamMembers') {
        limits.teamMembers = override.integerValue;
        appliedKeys.add(override.key);
        appliedOverrideIds.add(override.id);
      }
    }
  }
  return {
    activeOverrides: overrides.filter(({ id }) => appliedOverrideIds.has(id)),
    featureFlags,
    limits,
    plan,
    subscription,
  };
}

export async function getSubscriptionUsage(
  database: Prisma.TransactionClient,
  organizationId: string,
  now = new Date(),
) {
  const entitlements = await getEntitlements(database, organizationId, now);
  const bookingWindowStartsAt = new Date(
    now.getTime() - ROLLING_BOOKING_WINDOW_DAYS * DAY_MS,
  );
  const [clients, locations, rolling30DayBookings, teamMembers] =
    await Promise.all([
      database.client.count({
        where: { deletedAt: null, organizationId },
      }),
      database.location.count({
        where: { isActive: true, organizationId },
      }),
      database.appointment.count({
        where: { createdAt: { gte: bookingWindowStartsAt }, organizationId },
      }),
      database.membership.count({
        where: { organizationId, status: MembershipStatus.ACTIVE },
      }),
    ]);
  const baseBookingLimit = entitlements.limits.rolling30DayBookings;
  const effectiveBookingLimit =
    baseBookingLimit === null
      ? null
      : baseBookingLimit +
        (entitlements.subscription.freeBookingGraceUsed
          ? FREE_BOOKING_GRACE
          : 0);
  return {
    ...entitlements,
    usage: { clients, locations, rolling30DayBookings, teamMembers },
    bookingWindowStartsAt,
    effectiveBookingLimit,
    grace: {
      available:
        entitlements.plan.code === 'free' &&
        !entitlements.subscription.freeBookingGraceUsed &&
        baseBookingLimit !== null &&
        rolling30DayBookings >= baseBookingLimit,
      bookings: FREE_BOOKING_GRACE,
      used: entitlements.subscription.freeBookingGraceUsed,
    },
  };
}

export async function getAllowedProfessionalIds(
  database: Prisma.TransactionClient,
  organizationId: string,
) {
  const result = await getSubscriptionUsage(database, organizationId);
  const limit = result.limits.teamMembers;
  if (limit === null) return null;
  const memberships = await database.membership.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: limit,
    where: {
      organizationId,
      role: { in: [MembershipRole.OWNER, MembershipRole.BARBER] },
      status: MembershipStatus.ACTIVE,
    },
  });
  return memberships.map(({ id }) => id);
}

export async function assertCanUseProfessional(
  database: Prisma.TransactionClient,
  organizationId: string,
  professionalMembershipId: string,
) {
  const allowedIds = await getAllowedProfessionalIds(database, organizationId);
  if (allowedIds === null || allowedIds.includes(professionalMembershipId))
    return;
  throw new ApiError(
    409,
    'PLAN_PROFESSIONAL_NOT_AVAILABLE',
    'Este profesional queda en modo historico con el plan actual. Selecciona el profesional incluido o actualiza a Nava Local.',
  );
}

export async function assertCanCreateBooking(
  database: Prisma.TransactionClient,
  organizationId: string,
  audience: 'owner' | 'public' = 'owner',
) {
  const result = await getSubscriptionUsage(database, organizationId);
  if (
    result.effectiveBookingLimit !== null &&
    result.usage.rolling30DayBookings >= result.effectiveBookingLimit
  ) {
    throw new ApiError(
      409,
      audience === 'public'
        ? 'PUBLIC_BOOKING_LIMIT_REACHED'
        : 'PLAN_BOOKING_LIMIT_REACHED',
      audience === 'public'
        ? 'Las reservas online de este negocio estan temporalmente pausadas. Puedes contactar directamente con el negocio.'
        : result.grace.available
          ? 'Alcanzaste las 25 reservas de Nava Free. Activa tus 5 reservas de cortesia para continuar.'
          : 'Alcanzaste el limite de reservas de Nava Free. Actualiza tu plan para crear nuevas reservas.',
    );
  }
  return result;
}

export async function assertCanCreateClient(
  database: Prisma.TransactionClient,
  organizationId: string,
) {
  const result = await getSubscriptionUsage(database, organizationId);
  if (
    result.limits.clients !== null &&
    result.usage.clients >= result.limits.clients
  ) {
    throw new ApiError(
      409,
      'PLAN_CLIENT_LIMIT_REACHED',
      'Alcanzaste el limite de clientes de Nava Free. Tus clientes existentes siguen disponibles; actualiza tu plan para registrar uno nuevo.',
    );
  }
  return result;
}

export async function assertCanCreateTeamMember(
  database: Prisma.TransactionClient,
  organizationId: string,
) {
  const result = await getSubscriptionUsage(database, organizationId);
  if (
    result.limits.teamMembers !== null &&
    result.usage.teamMembers >= result.limits.teamMembers
  ) {
    throw new ApiError(
      409,
      'PLAN_PROFESSIONAL_LIMIT_REACHED',
      result.limits.teamMembers === 1
        ? 'Nava Free y Nava Esencial permiten un profesional activo. Actualiza a Nava Local para trabajar con un equipo.'
        : `Alcanzaste el límite de ${result.limits.teamMembers} profesionales activos de ${result.plan.name}. El límite es total para toda la organización, independientemente de sus sucursales.`,
    );
  }
  return result;
}

export async function recordBookingMilestone(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  const bookings = await transaction.appointment.count({
    where: { organizationId },
  });
  if (![5, 10, 20, 25].includes(bookings)) return;
  await transaction.auditLog.create({
    data: {
      action: `organization.reached_${bookings}_bookings`,
      afterData: { bookings },
      entityId: organizationId,
      entityType: 'organization',
      organizationId,
    },
  });
}

export async function grantFirstBookingGrace(
  database: DatabaseClient,
  organizationId: string,
) {
  await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) SELECT 1 AS locked FROM lock`;
    const result = await getSubscriptionUsage(transaction, organizationId);
    const baseLimit = result.limits.rolling30DayBookings;
    if (result.plan.code !== 'free' || baseLimit === null) {
      throw new ApiError(
        409,
        'BOOKING_GRACE_NOT_APPLICABLE',
        'La cortesia de reservas solo esta disponible en Nava Free.',
      );
    }
    if (result.subscription.freeBookingGraceUsed) {
      throw new ApiError(
        409,
        'BOOKING_GRACE_ALREADY_USED',
        'Esta organizacion ya utilizo sus reservas de cortesia.',
      );
    }
    if (result.usage.rolling30DayBookings < baseLimit) {
      throw new ApiError(
        409,
        'BOOKING_GRACE_NOT_READY',
        'La cortesia estara disponible cuando alcances el limite incluido.',
      );
    }
    await transaction.subscription.update({
      data: { freeBookingGraceUsed: true },
      where: { id: result.subscription.id },
    });
    await transaction.auditLog.create({
      data: {
        action: 'organization.used_free_booking_grace',
        afterData: { bookings: FREE_BOOKING_GRACE },
        entityId: result.subscription.id,
        entityType: 'subscription',
        organizationId,
      },
    });
  });
  return getSubscriptionUsage(database, organizationId);
}

export async function organizationSubscriptionIsReadOnly(
  database: DatabaseClient,
  organizationId: string,
) {
  const { subscription } = await database.$transaction((transaction) =>
    ensureOrganizationSubscription(transaction, organizationId),
  );
  return (
    subscription.status === SubscriptionStatus.SUSPENDED ||
    subscription.status === SubscriptionStatus.CANCELLED
  );
}
