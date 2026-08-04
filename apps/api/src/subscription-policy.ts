import {
  SubscriptionStatus,
  type DatabaseClient,
  type Prisma,
} from '@barber-saas/database';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;

export const SUBSCRIPTION_PLANS = [
  {
    available: true,
    code: 'essential',
    featureFlags: {
      commissions: true,
      inventory: true,
      multiLocation: false,
      publicBooking: true,
      reports: true,
      team: true,
      wallet: true,
    },
    features: [
      'Una sucursal',
      'Colaboradores ilimitados',
      'Agenda, clientes, servicios y reservas',
      'Página pública y enlace de reservas',
      'Caja, Nava Wallet y comisiones',
      'Permisos por perfil de acceso',
      'Reportes esenciales',
    ],
    limits: { locations: 1, teamMembers: null },
    name: 'Esencial',
    sortOrder: 10,
  },
  {
    available: false,
    code: 'multi',
    featureFlags: {
      commissions: true,
      inventory: true,
      multiLocation: true,
      publicBooking: true,
      reports: true,
      team: true,
      wallet: true,
    },
    features: [
      'Hasta cinco sucursales',
      'Agenda y reportes consolidados',
      'Caja y configuración por sucursal',
      'Permisos con alcance por sucursal',
      'Soporte prioritario',
    ],
    limits: { locations: 5, teamMembers: null },
    name: 'Multi',
    sortOrder: 20,
  },
] as const;

export type PlanFeatureFlags =
  (typeof SUBSCRIPTION_PLANS)[number]['featureFlags'];

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
          name: definition.name,
          sortOrder: definition.sortOrder,
        },
        update: {
          featureFlags: definition.featureFlags,
          features: [...definition.features],
          isActive: true,
          isPublic: definition.available,
          limits: definition.limits,
          name: definition.name,
          sortOrder: definition.sortOrder,
        },
        where: { code: definition.code },
      }),
    );
  }
  const essential = storedPlans.find(({ code }) => code === 'essential');
  if (!essential) throw new Error('El plan Esencial no está disponible.');
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  const graceEndsAt = new Date(trialEndsAt.getTime() + GRACE_DAYS * DAY_MS);
  let subscription = await transaction.subscription.upsert({
    create: {
      currentPeriodEnd: trialEndsAt,
      currentPeriodStart: now,
      graceEndsAt,
      organizationId,
      planId: essential.id,
      status: SubscriptionStatus.TRIAL,
      trialEndsAt,
    },
    update: {},
    where: { organizationId },
  });
  if (
    subscription.status === SubscriptionStatus.TRIAL &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt <= now
  ) {
    subscription = await transaction.subscription.update({
      data: { status: SubscriptionStatus.PAST_DUE },
      where: { id: subscription.id },
    });
  }
  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    subscription.graceEndsAt &&
    subscription.graceEndsAt <= now
  ) {
    subscription = await transaction.subscription.update({
      data: { status: SubscriptionStatus.SUSPENDED },
      where: { id: subscription.id },
    });
  }
  return { plans: storedPlans, subscription };
}

export function planDefinition(code: string) {
  return SUBSCRIPTION_PLANS.find((definition) => definition.code === code);
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
