import {
  AppointmentStatus,
  CashRegisterStatus,
  InvitationStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  SubscriptionStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
  type OrganizationPermission,
} from '@barber-saas/permissions';
import {
  acceptTeamInvitationSchema,
  assignProfessionalServiceSchema,
  createScheduleBlockSchema,
  createServiceCategorySchema,
  createServiceSchema,
  createTeamInvitationSchema,
  replaceWeeklySchedulesSchema,
  updateServiceSchema,
  updateTeamMemberSchema,
} from '@barber-saas/validation';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ApiConfig } from './config';
import { ApiError, isUniqueConstraintError } from './errors';
import type { InvitationMailer, PlatformAccessMailer } from './recovery-mailer';
import {
  createOpaqueToken,
  createVerificationCode,
  hashOpaqueToken,
} from './security';
import {
  ensureOrganizationSubscription,
  planDefinition,
  SUBSCRIPTION_PLANS,
} from './subscription-policy';

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const teamRecordParamsSchema = z.object({ id: z.uuid() });
const subscriptionSimulationSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
const createLocationSchema = z.object({
  city: z.string().trim().max(120).optional(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(24),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  timezone: z.string().trim().min(3).max(80),
});
const platformOrganizationParamsSchema = z.object({ id: z.uuid() });
const platformOrganizationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z
    .enum(['all', 'trial', 'active', 'past_due', 'suspended', 'cancelled'])
    .default('all'),
});
const platformOrganizationActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('suspend'),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal('reactivate'),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal('change_plan'),
    planCode: z.string().trim().min(1).max(40),
    reason: z.string().trim().min(10).max(500),
  }),
]);
const platformSupportSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
const platformOrganizationFilterSchema = z.object({
  organizationId: z.uuid().optional(),
});
const platformAccessCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/u),
});
const PLATFORM_ACCESS_CODE_DURATION_MS = 5 * 60 * 1000;
const PLATFORM_ACCESS_MAX_FAILED_ATTEMPTS = 5;
const SUBSCRIPTION_CONTROLLED_PREFIXES = [
  '/v1/appointments',
  '/v1/booking-settings',
  '/v1/business-schedule',
  '/v1/cash-register',
  '/v1/clients',
  '/v1/commissions',
  '/v1/inventory',
  '/v1/locations',
  '/v1/reviews',
  '/v1/schedule-blocks',
  '/v1/schedules',
  '/v1/service-categories',
  '/v1/services',
  '/v1/team',
] as const;

interface AuthenticatedIdentity {
  readonly session: {
    readonly id: string;
  };
  readonly user: {
    readonly email: string;
    readonly fullName: string;
    readonly id: string;
  };
}

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<AuthenticatedIdentity>;

function configuredPlatformEmails(config: ApiConfig) {
  return new Set(
    config.PLATFORM_ADMIN_EMAILS.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function requirePlatformOperator(
  database: DatabaseClient,
  authenticate: Authenticate,
  request: FastifyRequest,
  config: ApiConfig,
) {
  const identity = await authenticate(database, request);
  const { user } = identity;
  if (!configuredPlatformEmails(config).has(user.email.trim().toLowerCase())) {
    throw new ApiError(
      403,
      'PLATFORM_ADMIN_REQUIRED',
      'Esta sección está reservada para operadores de plataforma.',
    );
  }
  return identity;
}

async function requirePlatformAdmin(
  database: DatabaseClient,
  authenticate: Authenticate,
  request: FastifyRequest,
  config: ApiConfig,
) {
  const identity = await requirePlatformOperator(
    database,
    authenticate,
    request,
    config,
  );
  const verifiedAccess = await database.platformAdminAccessChallenge.findFirst({
    where: {
      sessionId: identity.session.id,
      userId: identity.user.id,
      verifiedAt: { not: null },
    },
  });
  if (!verifiedAccess) {
    throw new ApiError(
      403,
      'PLATFORM_ACCESS_CODE_REQUIRED',
      'Confirma el código enviado a tu correo para acceder al panel.',
    );
  }
  return identity.user;
}

function notificationDeliveryFailures(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const delivery = (value as { delivery?: unknown }).delivery;
  if (!delivery || typeof delivery !== 'object') return [];
  return Object.entries(delivery as Record<string, unknown>).flatMap(
    ([channel, attempt]) => {
      if (!attempt || typeof attempt !== 'object') return [];
      const record = attempt as { attempts?: unknown; state?: unknown };
      return record.state === 'failed'
        ? [
            {
              attempts:
                typeof record.attempts === 'number' ? record.attempts : 0,
              channel,
            },
          ]
        : [];
    },
  );
}

function maskedEmail(email: string) {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

function permissionRole(role: MembershipRole): PermissionRole {
  return role.toLowerCase() as PermissionRole;
}

async function requireMembership(
  database: DatabaseClient,
  userId: string,
  permission?: OrganizationPermission,
) {
  const membership = await database.membership.findFirst({
    include: { memberLocations: true },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (!membership) {
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Tu cuenta no pertenece a una barbería activa.',
    );
  }
  if (
    permission &&
    !hasPermission(permissionRole(membership.role), permission)
  ) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para realizar esta acción.',
    );
  }
  return membership;
}

async function requireLocation(
  database: DatabaseClient,
  organizationId: string,
  locationId: string,
) {
  const location = await database.location.findFirst({
    where: { id: locationId, isActive: true, organizationId },
  });
  if (!location) {
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'La sucursal no existe.');
  }
  return location;
}

async function requireProfessional(
  database: DatabaseClient,
  organizationId: string,
  membershipId: string,
) {
  const professional = await database.membership.findFirst({
    include: { user: true },
    where: {
      id: membershipId,
      organizationId,
      role: MembershipRole.BARBER,
      status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
    },
  });
  if (!professional) {
    throw new ApiError(
      404,
      'PROFESSIONAL_NOT_FOUND',
      'El profesional no existe o no está activo.',
    );
  }
  return professional;
}

function assertNoScheduleOverlaps(
  schedules: ReadonlyArray<{
    endMinute: number;
    startMinute: number;
    weekday: number;
  }>,
) {
  const ordered = [...schedules].sort(
    (left, right) =>
      left.weekday - right.weekday || left.startMinute - right.startMinute,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous &&
      current &&
      previous.weekday === current.weekday &&
      previous.endMinute > current.startMinute
    ) {
      throw new ApiError(
        400,
        'SCHEDULE_OVERLAP',
        'Los intervalos del horario no pueden superponerse.',
      );
    }
  }
}

function registerPlatformRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  config: ApiConfig,
  platformAccessMailer: PlatformAccessMailer | null,
) {
  app.post('/v1/platform/access-code', async (request) => {
    const identity = await requirePlatformOperator(
      database,
      authenticate,
      request,
      config,
    );
    if (!platformAccessMailer) {
      throw new ApiError(
        503,
        'PLATFORM_ACCESS_DELIVERY_UNAVAILABLE',
        'El envío de códigos de acceso no está disponible.',
      );
    }
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + PLATFORM_ACCESS_CODE_DURATION_MS,
    );
    const code = createVerificationCode();
    await database.$transaction(async (transaction) => {
      await transaction.platformAdminAccessChallenge.updateMany({
        data: { usedAt: now },
        where: {
          sessionId: identity.session.id,
          usedAt: null,
          verifiedAt: null,
        },
      });
      await transaction.platformAdminAccessChallenge.create({
        data: {
          codeHash: hashOpaqueToken(code),
          expiresAt,
          sessionId: identity.session.id,
          userId: identity.user.id,
        },
      });
    });
    await platformAccessMailer.send({ code, email: identity.user.email });
    return {
      expiresAt: expiresAt.toISOString(),
      message: 'Enviamos un código de acceso a tu correo registrado.',
    };
  });

  app.post('/v1/platform/verify-access-code', async (request) => {
    const identity = await requirePlatformOperator(
      database,
      authenticate,
      request,
      config,
    );
    const { code } = platformAccessCodeSchema.parse(request.body);
    const now = new Date();
    await database.$transaction(async (transaction) => {
      const challenge =
        await transaction.platformAdminAccessChallenge.findFirst({
          orderBy: { createdAt: 'desc' },
          where: { sessionId: identity.session.id, userId: identity.user.id },
        });
      if (!challenge) {
        throw new ApiError(
          400,
          'PLATFORM_ACCESS_CODE_REQUIRED',
          'Solicita un código antes de continuar.',
        );
      }
      if (challenge.usedAt) {
        throw new ApiError(
          400,
          'PLATFORM_ACCESS_CODE_USED',
          'Ese código ya no puede utilizarse. Solicita uno nuevo.',
        );
      }
      if (challenge.expiresAt <= now) {
        await transaction.platformAdminAccessChallenge.update({
          data: { usedAt: now },
          where: { id: challenge.id },
        });
        throw new ApiError(
          400,
          'PLATFORM_ACCESS_CODE_EXPIRED',
          'El código venció después de 5 minutos. Solicita uno nuevo.',
        );
      }
      if (challenge.codeHash !== hashOpaqueToken(code)) {
        const failedAttempts = challenge.failedAttempts + 1;
        await transaction.platformAdminAccessChallenge.update({
          data: {
            failedAttempts,
            ...(failedAttempts >= PLATFORM_ACCESS_MAX_FAILED_ATTEMPTS
              ? { usedAt: now }
              : {}),
          },
          where: { id: challenge.id },
        });
        if (failedAttempts >= PLATFORM_ACCESS_MAX_FAILED_ATTEMPTS) {
          throw new ApiError(
            429,
            'PLATFORM_ACCESS_CODE_RATE_LIMITED',
            'Demasiados intentos. Solicita un nuevo código.',
          );
        }
        throw new ApiError(
          400,
          'INVALID_PLATFORM_ACCESS_CODE',
          'El código no es válido.',
        );
      }
      await transaction.platformAdminAccessChallenge.update({
        data: { usedAt: now, verifiedAt: now },
        where: { id: challenge.id },
      });
    });
    return {
      operator: {
        email: identity.user.email,
        fullName: identity.user.fullName,
        id: identity.user.id,
      },
    };
  });

  app.get('/v1/platform/session', async (request) => {
    const user = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    return {
      operator: { email: user.email, fullName: user.fullName, id: user.id },
    };
  });

  app.get('/v1/platform/overview', async (request) => {
    await requirePlatformAdmin(database, authenticate, request, config);
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [
      organizations,
      subscriptionsByStatus,
      trialsEndingSoon,
      withService,
      withAppointment,
      withCompletedAppointment,
      notificationRows,
    ] = await Promise.all([
      database.organization.count({ where: { deletedAt: null } }),
      database.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      database.subscription.count({
        where: {
          status: SubscriptionStatus.TRIAL,
          trialEndsAt: { gt: now, lte: nextWeek },
        },
      }),
      database.organization.count({
        where: { deletedAt: null, services: { some: { isActive: true } } },
      }),
      database.organization.count({
        where: { appointments: { some: {} }, deletedAt: null },
      }),
      database.organization.count({
        where: {
          appointments: { some: { status: AppointmentStatus.COMPLETED } },
          deletedAt: null,
        },
      }),
      database.appNotification.findMany({
        orderBy: { createdAt: 'desc' },
        select: { data: true },
        take: 500,
      }),
    ]);
    return {
      activation: {
        completedFirstAppointment: withCompletedAppointment,
        createdFirstAppointment: withAppointment,
        createdService: withService,
        organizations,
      },
      notificationFailures: notificationRows.reduce(
        (total, row) => total + notificationDeliveryFailures(row.data).length,
        0,
      ),
      subscriptions: Object.fromEntries(
        subscriptionsByStatus.map((entry) => [
          entry.status.toLowerCase(),
          entry._count._all,
        ]),
      ),
      trialsEndingSoon,
    };
  });

  app.get('/v1/platform/organizations', async (request) => {
    await requirePlatformAdmin(database, authenticate, request, config);
    const query = platformOrganizationListSchema.parse(request.query);
    const subscriptionStatus =
      query.status === 'all'
        ? undefined
        : (query.status.toUpperCase() as SubscriptionStatus);
    const where = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                slug: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
      ...(subscriptionStatus
        ? { subscription: { is: { status: subscriptionStatus } } }
        : {}),
    };
    const [total, organizations] = await Promise.all([
      database.organization.count({ where }),
      database.organization.findMany({
        include: {
          _count: {
            select: {
              appointments: true,
              locations: true,
              memberships: true,
              services: true,
            },
          },
          memberships: {
            include: {
              user: { select: { email: true, fullName: true } },
            },
            take: 1,
            where: { role: MembershipRole.OWNER },
          },
          subscription: { include: { plan: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    return {
      organizations: organizations.map((organization) => ({
        counts: organization._count,
        createdAt: organization.createdAt.toISOString(),
        id: organization.id,
        name: organization.name,
        owner: organization.memberships[0]
          ? {
              email: maskedEmail(organization.memberships[0].user.email),
              fullName: organization.memberships[0].user.fullName,
            }
          : null,
        plan: organization.subscription?.plan.code ?? null,
        slug: organization.slug,
        status:
          organization.subscription?.status.toLowerCase() ??
          organization.status.toLowerCase(),
        trialEndsAt:
          organization.subscription?.trialEndsAt?.toISOString() ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/v1/platform/notification-errors', async (request) => {
    await requirePlatformAdmin(database, authenticate, request, config);
    const query = platformOrganizationFilterSchema.parse(request.query);
    const notifications = await database.appNotification.findMany({
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      ...(query.organizationId
        ? { where: { organizationId: query.organizationId } }
        : {}),
    });
    return {
      errors: notifications
        .flatMap((notification) =>
          notificationDeliveryFailures(notification.data).map((failure) => ({
            ...failure,
            createdAt: notification.createdAt.toISOString(),
            id: `${notification.id}:${failure.channel}`,
            notificationId: notification.id,
            organization: notification.organization,
            title: notification.title,
          })),
        )
        .slice(0, 100),
    };
  });

  app.get('/v1/platform/audit', async (request) => {
    await requirePlatformAdmin(database, authenticate, request, config);
    const query = platformOrganizationFilterSchema.parse(request.query);
    const logs = await database.auditLog.findMany({
      include: {
        actor: { select: { email: true, fullName: true } },
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        action: { startsWith: 'platform.' },
        ...(query.organizationId
          ? { organizationId: query.organizationId }
          : {}),
      },
    });
    return {
      logs: logs.map((log) => ({
        action: log.action,
        actor: log.actor
          ? { email: log.actor.email, fullName: log.actor.fullName }
          : null,
        createdAt: log.createdAt.toISOString(),
        id: log.id,
        organization: log.organization.name,
        reason:
          log.metadata && typeof log.metadata === 'object'
            ? ((log.metadata as { reason?: unknown }).reason ?? null)
            : null,
      })),
    };
  });

  app.patch('/v1/platform/organizations/:id', async (request) => {
    const user = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    const { id } = platformOrganizationParamsSchema.parse(request.params);
    const input = platformOrganizationActionSchema.parse(request.body);
    return database.$transaction(async (transaction) => {
      const organization = await transaction.organization.findFirst({
        where: { deletedAt: null, id },
      });
      if (!organization)
        throw new ApiError(
          404,
          'ORGANIZATION_NOT_FOUND',
          'La organización no existe.',
        );
      const { subscription } = await ensureOrganizationSubscription(
        transaction,
        organization.id,
      );
      const before = {
        organizationStatus: organization.status,
        planId: subscription.planId,
        subscriptionStatus: subscription.status,
      };
      let updated = subscription;
      if (input.action === 'suspend') {
        updated = await transaction.subscription.update({
          data: { status: SubscriptionStatus.SUSPENDED },
          where: { id: subscription.id },
        });
        await transaction.organization.update({
          data: { status: OrganizationStatus.SUSPENDED },
          where: { id: organization.id },
        });
      } else if (input.action === 'reactivate') {
        const periodStart = new Date();
        updated = await transaction.subscription.update({
          data: {
            currentPeriodEnd: new Date(
              periodStart.getTime() + 30 * 24 * 60 * 60 * 1000,
            ),
            currentPeriodStart: periodStart,
            graceEndsAt: null,
            status: SubscriptionStatus.ACTIVE,
            trialEndsAt: null,
          },
          where: { id: subscription.id },
        });
        await transaction.organization.update({
          data: { status: OrganizationStatus.ACTIVE },
          where: { id: organization.id },
        });
      } else {
        const plan = await transaction.plan.findFirst({
          where: { code: input.planCode, isActive: true },
        });
        if (!plan)
          throw new ApiError(404, 'PLAN_NOT_FOUND', 'El plan no existe.');
        updated = await transaction.subscription.update({
          data: { planId: plan.id },
          where: { id: subscription.id },
        });
      }
      const organizationStatus =
        input.action === 'suspend'
          ? OrganizationStatus.SUSPENDED
          : input.action === 'reactivate'
            ? OrganizationStatus.ACTIVE
            : organization.status;
      await transaction.auditLog.create({
        data: {
          action: `platform.organization.${input.action}`,
          actorUserId: user.id,
          afterData: {
            organizationStatus,
            planId: updated.planId,
            subscriptionStatus: updated.status,
          },
          beforeData: before,
          entityId: organization.id,
          entityType: 'organization',
          metadata: { reason: input.reason, source: 'platform_admin' },
          organizationId: organization.id,
        },
      });
      return {
        organization: {
          id: organization.id,
          planId: updated.planId,
          status: updated.status.toLowerCase(),
        },
      };
    });
  });

  app.post('/v1/platform/organizations/:id/support', async (request) => {
    const user = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    const { id } = platformOrganizationParamsSchema.parse(request.params);
    const input = platformSupportSchema.parse(request.body);
    const organization = await database.organization.findFirst({
      include: {
        memberships: {
          include: { user: { select: { email: true, fullName: true } } },
          take: 1,
          where: { role: MembershipRole.OWNER },
        },
        subscription: { include: { plan: true } },
      },
      where: { deletedAt: null, id },
    });
    if (!organization)
      throw new ApiError(
        404,
        'ORGANIZATION_NOT_FOUND',
        'La organización no existe.',
      );
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [locations, members, services, appointments, openCash, rows] =
      await Promise.all([
        database.location.count({
          where: { isActive: true, organizationId: organization.id },
        }),
        database.membership.count({
          where: {
            organizationId: organization.id,
            status: MembershipStatus.ACTIVE,
          },
        }),
        database.service.count({
          where: { isActive: true, organizationId: organization.id },
        }),
        database.appointment.count({
          where: {
            createdAt: { gte: thirtyDaysAgo },
            organizationId: organization.id,
          },
        }),
        database.cashRegisterSession.count({
          where: {
            organizationId: organization.id,
            status: CashRegisterStatus.OPEN,
          },
        }),
        database.appNotification.findMany({
          orderBy: { createdAt: 'desc' },
          select: { data: true },
          take: 200,
          where: { organizationId: organization.id },
        }),
      ]);
    await database.auditLog.create({
      data: {
        action: 'platform.organization.support_accessed',
        actorUserId: user.id,
        entityId: organization.id,
        entityType: 'organization',
        metadata: {
          reason: input.reason,
          scope: 'operational_diagnostics',
          source: 'platform_admin',
        },
        organizationId: organization.id,
      },
    });
    const owner = organization.memberships[0]?.user;
    return {
      diagnostics: {
        counts: {
          activeMembers: members,
          activeServices: services,
          locations,
          notificationFailures: rows.reduce(
            (total, row) =>
              total + notificationDeliveryFailures(row.data).length,
            0,
          ),
          openCashRegisters: openCash,
          recentAppointments: appointments,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          plan: organization.subscription?.plan.code ?? null,
          status:
            organization.subscription?.status.toLowerCase() ??
            organization.status.toLowerCase(),
        },
        owner: owner
          ? { email: maskedEmail(owner.email), fullName: owner.fullName }
          : null,
      },
      notice:
        'Acceso registrado. No se creó una sesión del negocio ni se suplantó a ningún usuario.',
    };
  });
}

export function registerOperationsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  invitationMailer: InvitationMailer | null,
  config: ApiConfig,
  platformAccessMailer: PlatformAccessMailer | null,
) {
  registerPlatformRoutes(
    app,
    database,
    authenticate,
    config,
    platformAccessMailer,
  );
  app.addHook('preHandler', async (request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const path = request.url.split('?')[0] ?? request.url;
    if (path === '/v1/cash-register/close') return;
    if (
      !SUBSCRIPTION_CONTROLLED_PREFIXES.some((prefix) =>
        path.startsWith(prefix),
      )
    )
      return;
    const { user } = await authenticate(database, request);
    const membership = await database.membership.findFirst({
      where: { status: MembershipStatus.ACTIVE, userId: user.id },
    });
    if (!membership) return;
    const { subscription } = await database.$transaction((transaction) =>
      ensureOrganizationSubscription(transaction, membership.organizationId),
    );
    if (
      subscription.status === SubscriptionStatus.SUSPENDED ||
      subscription.status === SubscriptionStatus.CANCELLED
    )
      throw new ApiError(
        423,
        'SUBSCRIPTION_READ_ONLY',
        'Tu suscripción está en modo de solo lectura. Reactívala para realizar cambios.',
      );
  });

  app.get('/v1/subscription', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    const now = new Date();
    const { plans, subscription } = await database.$transaction((transaction) =>
      ensureOrganizationSubscription(transaction, current.organizationId, now),
    );
    const [locations, teamMembers] = await Promise.all([
      database.location.count({
        where: { isActive: true, organizationId: current.organizationId },
      }),
      database.membership.count({
        where: {
          organizationId: current.organizationId,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ]);
    const currentPlan = plans.find(({ id }) => id === subscription.planId);
    if (!currentPlan)
      throw new Error('La suscripción no tiene un plan válido.');
    return {
      current: {
        canManage: current.role === MembershipRole.OWNER,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        featureFlags:
          planDefinition(currentPlan.code)?.featureFlags ??
          SUBSCRIPTION_PLANS[0].featureFlags,
        graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
        planCode: currentPlan.code,
        readOnly:
          subscription.status === SubscriptionStatus.CANCELLED ||
          subscription.status === SubscriptionStatus.SUSPENDED,
        status: subscription.status.toLowerCase(),
        simulationAvailable: config.APP_ENV !== 'production',
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      },
      plans: plans.map((plan) => {
        const definition = SUBSCRIPTION_PLANS.find(
          ({ code }) => code === plan.code,
        );
        return {
          available: definition?.available ?? false,
          code: plan.code,
          currencyCode: plan.currencyCode,
          featureFlags:
            planDefinition(plan.code)?.featureFlags ??
            SUBSCRIPTION_PLANS[0].featureFlags,
          features: plan.features,
          limits: plan.limits,
          monthlyPriceCents: plan.monthlyPriceCents,
          name: plan.name,
        };
      }),
      usage: { locations, teamMembers },
    };
  });

  app.post('/v1/subscription/simulate', async (request) => {
    if (config.APP_ENV === 'production')
      throw new ApiError(
        404,
        'SIMULATION_NOT_AVAILABLE',
        'La simulación de suscripción no está disponible.',
      );
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    if (current.role !== MembershipRole.OWNER)
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo el propietario puede simular el estado de la suscripción.',
      );
    const input = subscriptionSimulationSchema.parse(request.body);
    const result = await database.$transaction(async (transaction) => {
      const { subscription } = await ensureOrganizationSubscription(
        transaction,
        current.organizationId,
      );
      const status =
        input.status === 'active'
          ? SubscriptionStatus.ACTIVE
          : SubscriptionStatus.SUSPENDED;
      const updated = await transaction.subscription.update({
        data: {
          ...(status === SubscriptionStatus.ACTIVE
            ? {
                currentPeriodEnd: new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000,
                ),
                currentPeriodStart: new Date(),
              }
            : {}),
          status,
        },
        where: { id: subscription.id },
      });
      await transaction.auditLog.create({
        data: {
          action:
            status === SubscriptionStatus.ACTIVE
              ? 'subscription.reactivated_simulation'
              : 'subscription.suspended_simulation',
          actorUserId: user.id,
          afterData: { status: updated.status },
          beforeData: { status: subscription.status },
          entityId: subscription.id,
          entityType: 'subscription',
          organizationId: current.organizationId,
        },
      });
      return updated;
    });
    return {
      current: {
        readOnly:
          result.status === SubscriptionStatus.SUSPENDED ||
          result.status === SubscriptionStatus.CANCELLED,
        status: result.status.toLowerCase(),
      },
    };
  });

  app.post('/v1/locations', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    if (current.role !== MembershipRole.OWNER)
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo el propietario puede agregar sucursales.',
      );
    const input = createLocationSchema.parse(request.body);
    try {
      const location = await database.$transaction(async (transaction) => {
        const { plans, subscription } = await ensureOrganizationSubscription(
          transaction,
          current.organizationId,
        );
        const plan = plans.find(({ id }) => id === subscription.planId);
        const definition = plan ? planDefinition(plan.code) : null;
        const maximumLocations = definition?.limits.locations ?? 1;
        const usedLocations = await transaction.location.count({
          where: {
            isActive: true,
            organizationId: current.organizationId,
          },
        });
        if (usedLocations >= maximumLocations)
          throw new ApiError(
            409,
            'PLAN_LIMIT_REACHED',
            `El plan ${definition?.name ?? 'actual'} permite ${maximumLocations} sucursal${maximumLocations === 1 ? '' : 'es'}.`,
          );
        const created = await transaction.location.create({
          data: {
            city: input.city || null,
            countryCode: input.countryCode,
            currencyCode: input.currencyCode,
            name: input.name,
            organizationId: current.organizationId,
            phone: input.phone,
            slug: input.slug,
            timezone: input.timezone,
            whatsappPhone: input.phone,
          },
        });
        await transaction.memberLocation.upsert({
          create: { locationId: created.id, membershipId: current.id },
          update: {},
          where: {
            membershipId_locationId: {
              locationId: created.id,
              membershipId: current.id,
            },
          },
        });
        await transaction.businessWeeklySchedule.createMany({
          data: Array.from({ length: 7 }, (_, weekday) => ({
            endMinute: 1080,
            isOpen: true,
            locationId: created.id,
            organizationId: current.organizationId,
            startMinute: 540,
            weekday,
          })),
        });
        await transaction.auditLog.create({
          data: {
            action: 'location.created',
            actorUserId: user.id,
            afterData: {
              planCode: plan?.code,
              usedLocations: usedLocations + 1,
            },
            entityId: created.id,
            entityType: 'location',
            locationId: created.id,
            organizationId: current.organizationId,
          },
        });
        return created;
      });
      return reply.code(201).send({ location });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApiError(
          409,
          'LOCATION_ALREADY_EXISTS',
          'Ya existe una sucursal con ese enlace.',
        );
      throw error;
    }
  });

  app.get('/v1/team', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    const canReadTeam = hasPermission(
      permissionRole(current.role),
      'membership.read',
    );
    const canManageTeam = hasPermission(
      permissionRole(current.role),
      'membership.manage',
    );
    const [members, pendingInvitations, commissionRules] = await Promise.all([
      database.membership.findMany({
        include: {
          memberLocations: { include: { location: true } },
          user: true,
        },
        orderBy: { createdAt: 'asc' },
        where: {
          organizationId: current.organizationId,
          status: MembershipStatus.ACTIVE,
          ...(canReadTeam ? {} : { id: current.id }),
        },
      }),
      canManageTeam
        ? database.teamInvitation.findMany({
            orderBy: { createdAt: 'desc' },
            where: {
              expiresAt: { gt: new Date() },
              organizationId: current.organizationId,
              status: InvitationStatus.PENDING,
            },
          })
        : Promise.resolve([]),
      database.commissionRule.findMany({
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        where: {
          isActive: true,
          organizationId: current.organizationId,
          serviceId: null,
          type: 'SERVICE_PERCENTAGE',
        },
      }),
    ]);
    const commissionByMembership = new Map<string, number>();
    for (const rule of commissionRules) {
      if (!commissionByMembership.has(rule.professionalMembershipId)) {
        commissionByMembership.set(rule.professionalMembershipId, rule.value);
      }
    }
    return {
      members: members.map((member) => ({
        commissionPercentage: commissionByMembership.get(member.id) ?? null,
        id: member.id,
        locations: member.memberLocations.map(({ location }) => ({
          id: location.id,
          name: location.name,
        })),
        role: member.role.toLowerCase(),
        status: member.status.toLowerCase(),
        user: {
          email: member.user.email,
          fullName: member.user.fullName,
          id: member.user.id,
        },
      })),
      pendingInvitations: pendingInvitations.map((invitation) => ({
        activationStatus: 'pending_acceptance' as const,
        commissionPercentage: invitation.commissionPercentage,
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        role: invitation.role.toLowerCase(),
      })),
    };
  });

  app.patch('/v1/team/members/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const input = updateTeamMemberSchema.parse(request.body);
    const member = await database.membership.findFirst({
      include: { user: true },
      where: {
        id,
        organizationId: current.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new ApiError(
        404,
        'TEAM_MEMBER_NOT_FOUND',
        'El colaborador no existe o ya no está activo.',
      );
    }
    if (member.role === MembershipRole.OWNER || member.id === current.id) {
      throw new ApiError(
        403,
        'TEAM_MEMBER_PROTECTED',
        'No puedes modificar al propietario ni tu propia membresía desde esta pantalla.',
      );
    }
    const role = input.role.toUpperCase() as MembershipRole;
    const updated = await database.$transaction(async (transaction) => {
      const now = new Date();
      const updatedMembership = await transaction.membership.update({
        data: { role },
        where: { id: member.id },
      });
      const updatedUser = await transaction.user.update({
        data: { fullName: input.fullName.trim() },
        where: { id: member.userId },
      });
      const activeRules = await transaction.commissionRule.findMany({
        where: {
          isActive: true,
          organizationId: current.organizationId,
          professionalMembershipId: member.id,
          serviceId: null,
          type: 'SERVICE_PERCENTAGE',
        },
      });
      const commissionPercentage =
        role === MembershipRole.BARBER
          ? (input.commissionPercentage ?? null)
          : null;
      const unchangedRule =
        activeRules.length === 1 &&
        activeRules[0]?.value === commissionPercentage;
      if (!unchangedRule && activeRules.length > 0) {
        await transaction.commissionRule.updateMany({
          data: { effectiveTo: now, isActive: false },
          where: { id: { in: activeRules.map(({ id: ruleId }) => ruleId) } },
        });
      }
      if (commissionPercentage !== null && !unchangedRule) {
        await transaction.commissionRule.create({
          data: {
            effectiveFrom: now,
            organizationId: current.organizationId,
            professionalMembershipId: member.id,
            type: 'SERVICE_PERCENTAGE',
            value: commissionPercentage,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'team.member.updated',
          actorUserId: user.id,
          afterData: {
            commissionPercentage,
            fullName: updatedUser.fullName,
            role: input.role,
          },
          beforeData: {
            fullName: member.user.fullName,
            role: member.role.toLowerCase(),
          },
          entityId: member.id,
          entityType: 'membership',
          organizationId: current.organizationId,
        },
      });
      return { membership: updatedMembership, user: updatedUser };
    });
    return {
      member: {
        commissionPercentage:
          role === MembershipRole.BARBER
            ? (input.commissionPercentage ?? null)
            : null,
        id: updated.membership.id,
        role: updated.membership.role.toLowerCase(),
        status: updated.membership.status.toLowerCase(),
        user: {
          email: updated.user.email,
          fullName: updated.user.fullName,
          id: updated.user.id,
        },
      },
    };
  });

  app.delete('/v1/team/members/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const member = await database.membership.findFirst({
      include: { user: true },
      where: {
        id,
        organizationId: current.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new ApiError(
        404,
        'TEAM_MEMBER_NOT_FOUND',
        'El colaborador no existe o ya no está activo.',
      );
    }
    if (member.role === MembershipRole.OWNER || member.id === current.id) {
      throw new ApiError(
        403,
        'TEAM_MEMBER_PROTECTED',
        'No puedes eliminar al propietario ni tu propia membresía.',
      );
    }
    await database.$transaction(async (transaction) => {
      await transaction.membership.update({
        data: { status: MembershipStatus.SUSPENDED },
        where: { id: member.id },
      });
      await transaction.commissionRule.updateMany({
        data: { effectiveTo: new Date(), isActive: false },
        where: {
          isActive: true,
          organizationId: current.organizationId,
          professionalMembershipId: member.id,
        },
      });
      await transaction.teamInvitation.updateMany({
        data: { status: InvitationStatus.REVOKED },
        where: {
          email: member.user.email,
          organizationId: current.organizationId,
          status: InvitationStatus.PENDING,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'team.member.suspended',
          actorUserId: user.id,
          beforeData: {
            email: member.user.email,
            role: member.role.toLowerCase(),
            status: member.status.toLowerCase(),
          },
          entityId: member.id,
          entityType: 'membership',
          organizationId: current.organizationId,
        },
      });
    });
    return reply.code(204).send();
  });

  app.delete('/v1/team/invitations/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const invitation = await database.teamInvitation.findFirst({
      where: {
        id,
        organizationId: current.organizationId,
        status: InvitationStatus.PENDING,
      },
    });
    if (!invitation) {
      throw new ApiError(
        404,
        'TEAM_INVITATION_NOT_FOUND',
        'La invitación no existe o ya no está pendiente.',
      );
    }
    await database.$transaction(async (transaction) => {
      await transaction.teamInvitation.update({
        data: { status: InvitationStatus.REVOKED },
        where: { id: invitation.id },
      });
      const invitedMembership = await transaction.membership.findFirst({
        where: {
          organizationId: current.organizationId,
          status: MembershipStatus.INVITED,
          user: { email: invitation.email },
        },
      });
      if (invitedMembership) {
        await transaction.membership.update({
          data: { status: MembershipStatus.SUSPENDED },
          where: { id: invitedMembership.id },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'team.invitation.revoked',
          actorUserId: user.id,
          beforeData: {
            email: invitation.email,
            role: invitation.role.toLowerCase(),
          },
          entityId: invitation.id,
          entityType: 'team_invitation',
          locationId: invitation.locationId,
          organizationId: current.organizationId,
        },
      });
    });
    return reply.code(204).send();
  });

  app.post('/v1/team/invitations', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const input = createTeamInvitationSchema.parse(request.body);
    if (!invitationMailer) {
      throw new ApiError(
        503,
        'INVITATION_EMAIL_NOT_CONFIGURED',
        'Configura el servicio SMTP antes de invitar integrantes.',
      );
    }
    const [location, organization] = await Promise.all([
      requireLocation(database, current.organizationId, input.locationId),
      database.organization.findUniqueOrThrow({
        where: { id: current.organizationId },
      }),
    ]);
    const token = createOpaqueToken();
    const normalizedEmail = input.email.trim().toLowerCase();
    const role = input.role.toUpperCase() as MembershipRole;
    const { invitation, membership } = await database.$transaction(
      async (transaction) => {
        let invitedUser = await transaction.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (!invitedUser) {
          invitedUser = await transaction.user.create({
            data: {
              email: normalizedEmail,
              fullName: input.fullName.trim(),
              passwordHash: null,
            },
          });
        }
        const existingMembership = await transaction.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: current.organizationId,
              userId: invitedUser.id,
            },
          },
        });
        if (existingMembership?.status === MembershipStatus.ACTIVE) {
          throw new ApiError(
            409,
            'TEAM_MEMBER_ALREADY_ACTIVE',
            'Este correo ya pertenece al equipo.',
          );
        }
        const invitedMembership = await transaction.membership.upsert({
          create: {
            organizationId: current.organizationId,
            role,
            status: MembershipStatus.INVITED,
            userId: invitedUser.id,
          },
          update: { role, status: MembershipStatus.INVITED },
          where: {
            organizationId_userId: {
              organizationId: current.organizationId,
              userId: invitedUser.id,
            },
          },
        });
        await transaction.memberLocation.upsert({
          create: {
            locationId: location.id,
            membershipId: invitedMembership.id,
          },
          update: {},
          where: {
            membershipId_locationId: {
              locationId: location.id,
              membershipId: invitedMembership.id,
            },
          },
        });
        await transaction.teamInvitation.updateMany({
          data: { status: InvitationStatus.REVOKED },
          where: {
            email: normalizedEmail,
            organizationId: current.organizationId,
            status: InvitationStatus.PENDING,
          },
        });
        const createdInvitation = await transaction.teamInvitation.create({
          data: {
            commissionPercentage: input.commissionPercentage ?? null,
            email: normalizedEmail,
            expiresAt: new Date(Date.now() + INVITATION_DURATION_MS),
            inviterUserId: user.id,
            locationId: location.id,
            organizationId: current.organizationId,
            role,
            tokenHash: hashOpaqueToken(token),
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'team.invitation.created',
            actorUserId: user.id,
            afterData: {
              email: createdInvitation.email,
              membershipId: invitedMembership.id,
              role: input.role,
            },
            entityId: createdInvitation.id,
            entityType: 'team_invitation',
            locationId: createdInvitation.locationId,
            organizationId: current.organizationId,
          },
        });
        return {
          invitation: createdInvitation,
          membership: invitedMembership,
        };
      },
    );
    const separator = config.MOBILE_INVITATION_URL.includes('?') ? '&' : '?';
    const invitationUrl = `${config.MOBILE_INVITATION_URL}${separator}token=${encodeURIComponent(token)}`;
    try {
      await invitationMailer.send({
        email: invitation.email,
        invitationUrl,
        invitedBy: user.fullName,
        organizationName: organization.name,
      });
    } catch (error) {
      await database.teamInvitation.update({
        data: { status: InvitationStatus.REVOKED },
        where: { id: invitation.id },
      });
      throw error;
    }
    return reply.code(201).send({
      invitation: {
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        status: invitation.status.toLowerCase(),
      },
      member: {
        id: membership.id,
        status: membership.status.toLowerCase(),
      },
    });
  });

  app.post('/v1/team/invitations/accept', async (request) => {
    const { user } = await authenticate(database, request);
    const acceptingUser = await database.user.findUnique({
      select: { emailVerifiedAt: true },
      where: { id: user.id },
    });
    if (!acceptingUser?.emailVerifiedAt) {
      throw new ApiError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verifica tu correo antes de aceptar una invitación.',
      );
    }
    const input = acceptTeamInvitationSchema.parse(request.body);
    const now = new Date();
    const invitation = await database.teamInvitation.findFirst({
      where: {
        email: user.email.toLowerCase(),
        expiresAt: { gt: now },
        status: InvitationStatus.PENDING,
        tokenHash: hashOpaqueToken(input.token),
      },
    });
    if (!invitation) {
      throw new ApiError(
        400,
        'INVALID_INVITATION',
        'La invitación no es válida o ya venció.',
      );
    }
    const membershipInAnotherOrganization = await database.membership.findFirst(
      {
        where: {
          organizationId: { not: invitation.organizationId },
          status: MembershipStatus.ACTIVE,
          userId: user.id,
        },
      },
    );
    if (membershipInAnotherOrganization) {
      throw new ApiError(
        409,
        'MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED',
        'Esta versión permite operar una sola barbería por cuenta.',
      );
    }
    const membership = await database.$transaction(async (transaction) => {
      const claimedInvitation = await transaction.teamInvitation.updateMany({
        data: { acceptedAt: now, status: InvitationStatus.ACCEPTED },
        where: {
          expiresAt: { gt: now },
          id: invitation.id,
          status: InvitationStatus.PENDING,
        },
      });
      if (claimedInvitation.count !== 1) {
        throw new ApiError(
          400,
          'INVALID_INVITATION',
          'La invitación no es válida, ya fue utilizada o venció.',
        );
      }
      const acceptedMembership = await transaction.membership.upsert({
        create: {
          organizationId: invitation.organizationId,
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
          userId: user.id,
        },
        update: { role: invitation.role, status: MembershipStatus.ACTIVE },
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
      });
      await transaction.memberLocation.upsert({
        create: {
          locationId: invitation.locationId,
          membershipId: acceptedMembership.id,
        },
        update: {},
        where: {
          membershipId_locationId: {
            locationId: invitation.locationId,
            membershipId: acceptedMembership.id,
          },
        },
      });
      if (
        invitation.role === MembershipRole.BARBER &&
        invitation.commissionPercentage !== null
      ) {
        await transaction.commissionRule.create({
          data: {
            effectiveFrom: new Date(),
            organizationId: invitation.organizationId,
            professionalMembershipId: acceptedMembership.id,
            type: 'SERVICE_PERCENTAGE',
            value: invitation.commissionPercentage,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'team.invitation.accepted',
          actorUserId: user.id,
          afterData: {
            membershipId: acceptedMembership.id,
            role: invitation.role,
          },
          entityId: acceptedMembership.id,
          entityType: 'membership',
          locationId: invitation.locationId,
          organizationId: invitation.organizationId,
        },
      });
      return acceptedMembership;
    });
    return {
      membership: { id: membership.id, role: membership.role.toLowerCase() },
    };
  });

  app.get('/v1/services', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id, 'service.read');
    const [categories, services] = await Promise.all([
      database.serviceCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        where: { isActive: true, organizationId: current.organizationId },
      }),
      database.service.findMany({
        include: { professionalServices: true },
        orderBy: { name: 'asc' },
        where: { isActive: true, organizationId: current.organizationId },
      }),
    ]);
    return {
      categories,
      services: services.map((service) => ({
        assignments: service.professionalServices.map((assignment) => ({
          locationId: assignment.locationId,
          membershipId: assignment.membershipId,
        })),
        categoryId: service.categoryId,
        description: service.description,
        durationMinutes: service.durationMinutes,
        id: service.id,
        name: service.name,
        onlineBooking: service.onlineBooking,
        priceCents: service.priceCents,
      })),
    };
  });

  app.post('/v1/service-categories', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const input = createServiceCategorySchema.parse(request.body);
    const category = await database.serviceCategory.create({
      data: { ...input, organizationId: current.organizationId },
    });
    await database.auditLog.create({
      data: {
        action: 'service_category.created',
        actorUserId: user.id,
        afterData: input,
        entityId: category.id,
        entityType: 'service_category',
        organizationId: current.organizationId,
      },
    });
    return reply.code(201).send({ category });
  });

  app.post('/v1/services', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const input = createServiceSchema.parse(request.body);
    if (input.categoryId) {
      const category = await database.serviceCategory.findFirst({
        where: { id: input.categoryId, organizationId: current.organizationId },
      });
      if (!category)
        throw new ApiError(
          404,
          'CATEGORY_NOT_FOUND',
          'La categoría no existe.',
        );
    }
    const existing = await database.service.findUnique({
      where: {
        organizationId_name: {
          name: input.name,
          organizationId: current.organizationId,
        },
      },
    });
    if (existing?.isActive) {
      throw new ApiError(
        409,
        'SERVICE_NAME_ALREADY_EXISTS',
        'Ya existe un servicio activo con ese nombre.',
      );
    }
    const service = await database.$transaction(async (transaction) => {
      const record = existing
        ? await transaction.service.update({
            data: {
              categoryId: input.categoryId ?? null,
              description: input.description ?? null,
              durationMinutes: input.durationMinutes,
              isActive: true,
              onlineBooking: input.onlineBooking,
              priceCents: input.priceCents,
            },
            where: { id: existing.id },
          })
        : await transaction.service.create({
            data: {
              categoryId: input.categoryId ?? null,
              description: input.description ?? null,
              durationMinutes: input.durationMinutes,
              name: input.name,
              onlineBooking: input.onlineBooking,
              organizationId: current.organizationId,
              priceCents: input.priceCents,
            },
          });
      await transaction.auditLog.create({
        data: {
          action: existing ? 'service.reactivated' : 'service.created',
          actorUserId: user.id,
          afterData: input,
          ...(existing
            ? {
                beforeData: {
                  isActive: existing.isActive,
                  name: existing.name,
                  onlineBooking: existing.onlineBooking,
                },
              }
            : {}),
          entityId: record.id,
          entityType: 'service',
          organizationId: current.organizationId,
        },
      });
      return record;
    });
    return reply.code(201).send({ service });
  });

  app.patch('/v1/services/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const input = updateServiceSchema.parse(request.body);
    const service = await database.service.findFirst({
      where: { id, isActive: true, organizationId: current.organizationId },
    });
    if (!service) {
      throw new ApiError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe.');
    }
    if (input.categoryId) {
      const category = await database.serviceCategory.findFirst({
        where: {
          id: input.categoryId,
          isActive: true,
          organizationId: current.organizationId,
        },
      });
      if (!category) {
        throw new ApiError(
          404,
          'CATEGORY_NOT_FOUND',
          'La categoría no existe.',
        );
      }
    }
    const duplicate = await database.service.findFirst({
      where: {
        id: { not: service.id },
        name: input.name,
        organizationId: current.organizationId,
      },
    });
    if (duplicate) {
      throw new ApiError(
        409,
        'SERVICE_NAME_ALREADY_EXISTS',
        'Ya existe otro servicio con ese nombre.',
      );
    }
    const updated = await database.$transaction(async (transaction) => {
      const record = await transaction.service.update({
        data: {
          categoryId: input.categoryId ?? null,
          description: input.description ?? null,
          durationMinutes: input.durationMinutes,
          name: input.name,
          onlineBooking: input.onlineBooking,
          priceCents: input.priceCents,
        },
        where: { id: service.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'service.updated',
          actorUserId: user.id,
          afterData: input,
          beforeData: {
            categoryId: service.categoryId,
            description: service.description,
            durationMinutes: service.durationMinutes,
            name: service.name,
            onlineBooking: service.onlineBooking,
            priceCents: service.priceCents,
          },
          entityId: service.id,
          entityType: 'service',
          organizationId: current.organizationId,
        },
      });
      return record;
    });
    return { service: updated };
  });

  app.delete('/v1/services/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const { id } = teamRecordParamsSchema.parse(request.params);
    const service = await database.service.findFirst({
      where: { id, isActive: true, organizationId: current.organizationId },
    });
    if (!service) {
      throw new ApiError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe.');
    }
    await database.$transaction(async (transaction) => {
      await transaction.professionalService.deleteMany({
        where: { serviceId: service.id },
      });
      await transaction.service.update({
        data: { isActive: false, onlineBooking: false },
        where: { id: service.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'service.archived',
          actorUserId: user.id,
          beforeData: {
            isActive: service.isActive,
            name: service.name,
            onlineBooking: service.onlineBooking,
          },
          entityId: service.id,
          entityType: 'service',
          organizationId: current.organizationId,
        },
      });
    });
    return reply.code(204).send();
  });

  app.post('/v1/services/assignments', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'service.manage',
    );
    const input = assignProfessionalServiceSchema.parse(request.body);
    await requireLocation(database, current.organizationId, input.locationId);
    await requireProfessional(
      database,
      current.organizationId,
      input.membershipId,
    );
    const service = await database.service.findFirst({
      where: {
        id: input.serviceId,
        isActive: true,
        organizationId: current.organizationId,
      },
    });
    if (!service)
      throw new ApiError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe.');
    const memberLocation = await database.memberLocation.findUnique({
      where: {
        membershipId_locationId: {
          locationId: input.locationId,
          membershipId: input.membershipId,
        },
      },
    });
    if (!memberLocation)
      throw new ApiError(
        400,
        'PROFESSIONAL_LOCATION_REQUIRED',
        'El profesional no pertenece a la sucursal.',
      );
    const assignment = await database.professionalService.upsert({
      create: {
        customDurationMinutes: input.customDurationMinutes ?? null,
        customPriceCents: input.customPriceCents ?? null,
        locationId: input.locationId,
        membershipId: input.membershipId,
        serviceId: input.serviceId,
      },
      update: {
        customDurationMinutes: input.customDurationMinutes ?? null,
        customPriceCents: input.customPriceCents ?? null,
      },
      where: {
        membershipId_serviceId_locationId: {
          locationId: input.locationId,
          membershipId: input.membershipId,
          serviceId: input.serviceId,
        },
      },
    });
    await database.auditLog.create({
      data: {
        action: 'professional_service.assigned',
        actorUserId: user.id,
        afterData: input,
        entityId: input.serviceId,
        entityType: 'professional_service',
        locationId: input.locationId,
        organizationId: current.organizationId,
      },
    });
    return reply.code(201).send({ assignment });
  });

  app.get('/v1/schedules', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id, 'schedule.read');
    const ownOnly = current.role === MembershipRole.BARBER;
    const [schedules, blocks] = await Promise.all([
      database.weeklySchedule.findMany({
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        where: {
          membership: { organizationId: current.organizationId },
          ...(ownOnly ? { membershipId: current.id } : {}),
        },
      }),
      database.scheduleBlock.findMany({
        orderBy: { startsAt: 'asc' },
        where: {
          endsAt: { gt: new Date() },
          organizationId: current.organizationId,
          ...(ownOnly ? { membershipId: current.id } : {}),
        },
      }),
    ]);
    return { blocks, schedules };
  });

  app.put('/v1/schedules', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'schedule.manage',
    );
    const input = replaceWeeklySchedulesSchema.parse(request.body);
    assertNoScheduleOverlaps(input.schedules);
    await requireLocation(database, current.organizationId, input.locationId);
    await requireProfessional(
      database,
      current.organizationId,
      input.membershipId,
    );
    const memberLocation = await database.memberLocation.findUnique({
      where: {
        membershipId_locationId: {
          locationId: input.locationId,
          membershipId: input.membershipId,
        },
      },
    });
    if (!memberLocation)
      throw new ApiError(
        400,
        'PROFESSIONAL_LOCATION_REQUIRED',
        'El profesional no pertenece a la sucursal.',
      );
    await database.$transaction(async (transaction) => {
      await transaction.weeklySchedule.deleteMany({
        where: {
          locationId: input.locationId,
          membershipId: input.membershipId,
        },
      });
      if (input.schedules.length > 0) {
        await transaction.weeklySchedule.createMany({
          data: input.schedules.map((schedule) => ({
            ...schedule,
            locationId: input.locationId,
            membershipId: input.membershipId,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'weekly_schedule.replaced',
          actorUserId: user.id,
          afterData: input.schedules,
          entityId: input.membershipId,
          entityType: 'weekly_schedule',
          locationId: input.locationId,
          organizationId: current.organizationId,
        },
      });
    });
    return { schedules: input.schedules };
  });

  app.post('/v1/schedule-blocks', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'schedule.manage',
    );
    const input = createScheduleBlockSchema.parse(request.body);
    await requireLocation(database, current.organizationId, input.locationId);
    await requireProfessional(
      database,
      current.organizationId,
      input.membershipId,
    );
    const block = await database.scheduleBlock.create({
      data: {
        endsAt: new Date(input.endsAt),
        locationId: input.locationId,
        membershipId: input.membershipId,
        organizationId: current.organizationId,
        reason: input.reason ?? null,
        startsAt: new Date(input.startsAt),
      },
    });
    await database.auditLog.create({
      data: {
        action: 'schedule_block.created',
        actorUserId: user.id,
        afterData: input,
        entityId: block.id,
        entityType: 'schedule_block',
        locationId: input.locationId,
        organizationId: current.organizationId,
      },
    });
    return reply.code(201).send({ block });
  });
}
