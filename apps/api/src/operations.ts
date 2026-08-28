import {
  AppointmentStatus,
  CashRegisterStatus,
  InvitationStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PlatformAlertStatus,
  PlatformConfigurationStatus,
  PlatformOperatorRole,
  PlatformSupportCaseStatus,
  ProductOrderStatus,
  SubscriptionInvoiceStatus,
  SubscriptionDiscountKind,
  SubscriptionStatus,
  type DatabaseClient,
  type PlatformOverrideKind,
  type PlatformPrivacyRequestStatus,
  type PlatformPrivacyRequestType,
  type SubscriptionPaymentStatus,
  type PlatformSupportCasePriority,
  type SubscriptionPaymentReceiptDeliveryStatus,
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
  signInSchema,
  updateServiceSchema,
  updateMemberOnlineBookingSchema,
  updateTeamMemberSchema,
} from '@barber-saas/validation';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ApiConfig } from './config';
import { ApiError, isUniqueConstraintError } from './errors';
import { resolvePlatformLoginCredentials } from './platform-login-credentials';
import type { InvitationMailer, PlatformAccessMailer } from './recovery-mailer';
import {
  createOpaqueToken,
  createVerificationCode,
  hashOpaqueToken,
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from './security';
import {
  assertCanCreateTeamMember,
  assertCanUseProfessional,
  ensureOrganizationSubscription,
  getEntitlements,
  getAllowedProfessionalIds,
  getSubscriptionUsage,
  grantFirstBookingGrace,
  GRACE_DAYS,
  parsePlanFeatureFlags,
  parsePlanLimits,
  SUBSCRIPTION_PLANS,
} from './subscription-policy';

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const teamRecordParamsSchema = z.object({ id: z.uuid() });
const subscriptionSimulationSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
const createLocationSchema = z.object({
  addressLine: z.string().trim().max(240).optional(),
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
  formattedAddress: z.string().trim().max(300).optional(),
  googlePlaceId: z.string().trim().max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  phone: z.string().trim().min(7).max(24),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  timezone: z.string().trim().min(3).max(80),
});
const updateLocationSchema = createLocationSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Debes modificar al menos un campo.',
  );
const platformOrganizationParamsSchema = z.object({ id: z.uuid() });
const platformUserParamsSchema = z.object({ id: z.uuid() });
const platformMembershipParamsSchema = z.object({ id: z.uuid() });
const platformUserListSchema = z.object({
  from: z.coerce.date().optional(),
  organizationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  role: z
    .enum(['all', 'owner', 'manager', 'receptionist', 'barber'])
    .default('all'),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'suspended', 'deleted']).default('all'),
  to: z.coerce.date().optional(),
  verification: z.enum(['all', 'verified', 'unverified']).default('all'),
});
const platformWelcomeSurveyResponseListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});
const platformUserActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('suspend'),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal('reactivate'),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal('revoke_sessions'),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal('request_password_recovery'),
    reason: z.string().trim().min(10).max(500),
  }),
]);
const platformMembershipActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('change_role'),
    reason: z.string().trim().min(10).max(500),
    role: z.enum(['manager', 'receptionist', 'barber']),
  }),
  z.object({
    action: z.literal('suspend'),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal('reactivate'),
    reason: z.string().trim().min(10).max(500),
  }),
]);
const platformOrganizationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  plan: z.enum(['all', 'free', 'essential', 'local', 'multi']).default('all'),
  search: z.string().trim().max(120).optional(),
  status: z
    .enum([
      'all',
      'trial',
      'free',
      'active',
      'past_due',
      'suspended',
      'cancelled',
    ])
    .default('all'),
  trial: z.enum(['all', 'ending_soon', 'expired']).default('all'),
});
const platformSubscriptionListSchema = z.object({
  invoiceStatus: z
    .enum(['all', 'open', 'pending', 'paid', 'expired', 'void', 'refunded'])
    .default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  paymentStatus: z
    .enum([
      'all',
      'created',
      'link_created',
      'pending_provider',
      'approved',
      'applied',
      'failed',
      'expired',
      'cancelled',
    ])
    .default('all'),
  search: z.string().trim().max(120).optional(),
  status: z
    .enum([
      'all',
      'trial',
      'free',
      'active',
      'past_due',
      'suspended',
      'cancelled',
    ])
    .default('all'),
});
const platformSubscriptionDiscountListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
});
const platformSubscriptionDiscountParamsSchema = z.object({ id: z.uuid() });
const platformSubscriptionDiscountCreateSchema = z
  .object({
    code: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    kind: z.enum(['temporary', 'lifetime_continuity']),
    name: z.string().trim().min(3).max(120),
    percentage: z.number().int().min(1).max(99),
    planIds: z.array(z.uuid()).max(10).default([]),
    reason: z.string().trim().min(10).max(500),
    startsAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'temporary' && !value.endsAt)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los cupones temporales requieren una fecha de finalización.',
        path: ['endsAt'],
      });
    if (value.kind === 'lifetime_continuity' && value.endsAt)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los cupones vitalicios no pueden tener fecha de finalización.',
        path: ['endsAt'],
      });
    if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La fecha inicial debe ser anterior a la fecha final.',
        path: ['endsAt'],
      });
  });
const platformSubscriptionDiscountStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(10).max(500),
});
const platformPaymentReceiptListSchema = z.object({
  deliveryStatus: z.enum(['all', 'pending', 'sent', 'failed']).default('all'),
  from: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  to: z.coerce.date().optional(),
});
const platformPaymentReceiptParamsSchema = z.object({ id: z.uuid() });
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
  z.object({
    action: z.literal('extend_trial'),
    days: z.number().int().min(1).max(90),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal('reduce_trial'),
    days: z.number().int().min(1).max(90),
    reason: z.string().trim().min(10).max(500),
  }),
]);
const platformOrganizationNoteSchema = z.object({
  category: z.enum(['commercial', 'support']).default('commercial'),
  note: z.string().trim().min(5).max(2000),
});
const platformSupportSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
const platformOrganizationFilterSchema = z.object({
  organizationId: z.uuid().optional(),
});
const platformNotificationParamsSchema = z.object({ id: z.uuid() });
const platformNotificationRetrySchema = z.object({
  channel: z.enum(['email', 'push']),
  reason: z.string().trim().min(10).max(500),
});
const platformAccessCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/u),
});
const platformOperatorParamsSchema = z.object({ id: z.uuid() });
const platformOperatorInputSchema = z.object({
  email: z.email(),
  isActive: z.boolean().default(true),
  role: z.enum([
    'super_admin',
    'support',
    'billing',
    'operations',
    'read_only',
  ]),
});
const platformSessionParamsSchema = z.object({ id: z.uuid() });
const platformCaseParamsSchema = z.object({ id: z.uuid() });
const platformCaseListSchema = z.object({
  organizationId: z.uuid().optional(),
  status: z
    .enum(['all', 'open', 'in_progress', 'waiting', 'closed'])
    .default('all'),
});
const platformCaseCreateSchema = z.object({
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().min(10).max(2000),
  organizationId: z.uuid(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  slaDueAt: z.iso.datetime().nullable().optional(),
  title: z.string().trim().min(5).max(160),
});
const platformCaseUpdateSchema = z.object({
  assignedToUserId: z.uuid().nullable().optional(),
  note: z.string().trim().min(3).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  slaDueAt: z.iso.datetime().nullable().optional(),
  status: z.enum(['open', 'in_progress', 'waiting', 'closed']).optional(),
});
const platformAlertListSchema = z.object({
  organizationId: z.uuid().optional(),
  status: z.enum(['all', 'open', 'acknowledged', 'resolved']).default('open'),
});
const platformAlertParamsSchema = z.object({ id: z.uuid() });
const platformAlertActionSchema = z.object({
  note: z.string().trim().min(5).max(500),
  status: z.enum(['acknowledged', 'resolved']),
});
const platformAuditListSchema = z.object({
  action: z.string().trim().max(100).optional(),
  organizationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const platformOperationalListSchema = z.object({
  organizationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const platformAuditExportSchema = z.object({
  from: z.iso.datetime(),
  organizationId: z.uuid().optional(),
  to: z.iso.datetime(),
});
const platformPrivacyParamsSchema = z.object({ id: z.uuid() });
const platformPrivacyListSchema = z.object({
  status: z
    .enum(['all', 'open', 'in_progress', 'completed', 'rejected'])
    .default('all'),
});
const platformPrivacyCreateSchema = z
  .object({
    dueAt: z.iso.datetime().nullable().optional(),
    organizationId: z.uuid().nullable().optional(),
    reason: z.string().trim().min(10).max(1000),
    subjectUserId: z.uuid().nullable().optional(),
    type: z.enum(['data_export', 'deletion']),
  })
  .refine((value) => value.organizationId || value.subjectUserId, {
    message: 'Debes indicar una organización o una persona solicitante.',
  });
const platformPrivacyUpdateSchema = z.object({
  assignedToUserId: z.uuid().nullable().optional(),
  resolutionNote: z.string().trim().min(5).max(1000),
  status: z.enum(['open', 'in_progress', 'completed', 'rejected']),
});
const PLATFORM_FEATURE_KEYS = [
  'commissions',
  'fullReports',
  'inventory',
  'multiLocation',
  'publicBooking',
  'reports',
  'team',
  'wallet',
] as const;
const PLATFORM_LIMIT_KEYS = [
  'clients',
  'locations',
  'rolling30DayBookings',
  'teamMembers',
] as const;
const platformOverrideParamsSchema = z.object({ id: z.uuid() });
const platformOverrideListSchema = z.object({
  organizationId: z.uuid().optional(),
});
const platformOverrideCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    booleanValue: z.boolean(),
    expiresAt: z.iso.datetime(),
    key: z.enum(PLATFORM_FEATURE_KEYS),
    kind: z.literal('feature'),
    organizationId: z.uuid(),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    expiresAt: z.iso.datetime(),
    integerValue: z.number().int().min(0).max(1_000_000).nullable(),
    key: z.enum(PLATFORM_LIMIT_KEYS),
    kind: z.literal('limit'),
    organizationId: z.uuid(),
    reason: z.string().trim().min(10).max(500),
  }),
]);
const platformOverrideRevokeSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
const platformReviewParamsSchema = z.object({ id: z.uuid() });
const platformReviewActionSchema = z.object({
  isVisible: z.boolean(),
  reason: z.string().trim().min(10).max(500),
});
const platformPendingRegistrationParamsSchema = z.object({ id: z.uuid() });
const platformVerificationResendSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
const PLATFORM_CONFIGURATION_KEYS = [
  'alerts.cash_open_hours',
  'exports.retention_days',
  'onboarding.abandoned_hours',
  'support.default_sla_hours',
] as const;
const platformConfigurationParamsSchema = z.object({ id: z.uuid() });
const platformConfigurationCreateSchema = z.discriminatedUnion('key', [
  z.object({
    key: z.literal('alerts.cash_open_hours'),
    reason: z.string().trim().min(10).max(500),
    value: z.object({ hours: z.number().int().min(1).max(720) }),
  }),
  z.object({
    key: z.literal('exports.retention_days'),
    reason: z.string().trim().min(10).max(500),
    value: z.object({ days: z.number().int().min(1).max(90) }),
  }),
  z.object({
    key: z.literal('onboarding.abandoned_hours'),
    reason: z.string().trim().min(10).max(500),
    value: z.object({ hours: z.number().int().min(1).max(2160) }),
  }),
  z.object({
    key: z.literal('support.default_sla_hours'),
    reason: z.string().trim().min(10).max(500),
    value: z.object({ hours: z.number().int().min(1).max(720) }),
  }),
]);
const platformConfigurationActionSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
const PLATFORM_ACCESS_CODE_DURATION_MS = 5 * 60 * 1000;
const PLATFORM_ACCESS_MAX_FAILED_ATTEMPTS = 5;
const PLATFORM_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const MAX_PLATFORM_LOGIN_RATE_LIMIT_BUCKETS = 10_000;
const platformLoginRateLimitBuckets = new Map<
  string,
  { count: number; resetAt: number }
>();
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

function enforcePlatformLoginRateLimit(
  config: ApiConfig,
  request: FastifyRequest,
) {
  const now = Date.now();
  const key = request.ip;
  if (
    !platformLoginRateLimitBuckets.has(key) &&
    platformLoginRateLimitBuckets.size >= MAX_PLATFORM_LOGIN_RATE_LIMIT_BUCKETS
  ) {
    for (const [bucketKey, bucket] of platformLoginRateLimitBuckets) {
      if (bucket.resetAt <= now)
        platformLoginRateLimitBuckets.delete(bucketKey);
    }
    if (
      platformLoginRateLimitBuckets.size >=
      MAX_PLATFORM_LOGIN_RATE_LIMIT_BUCKETS
    ) {
      const oldestKey = platformLoginRateLimitBuckets.keys().next().value as
        string | undefined;
      if (oldestKey) platformLoginRateLimitBuckets.delete(oldestKey);
    }
  }
  const current = platformLoginRateLimitBuckets.get(key);
  const windowMs = config.AUTH_IP_RATE_LIMIT_WINDOW_SECONDS * 1000;
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
  if (!current || current.resetAt <= now)
    platformLoginRateLimitBuckets.set(key, bucket);
  if (bucket.count >= config.PLATFORM_LOGIN_RATE_LIMIT_MAX) {
    throw new ApiError(
      429,
      'PLATFORM_LOGIN_RATE_LIMITED',
      'Has realizado demasiados intentos. Espera unos minutos antes de intentarlo nuevamente.',
    );
  }
  bucket.count += 1;
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

function platformChallengeToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  const match = value?.match(/^Bearer\s+(.+)$/iu);
  if (!match?.[1]) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'La sesión no es válida.');
  }
  return match[1];
}

async function requirePlatformOperator(
  database: DatabaseClient,
  authenticate: Authenticate,
  request: FastifyRequest,
  config: ApiConfig,
) {
  const identity = await authenticate(database, request);
  const { user } = identity;
  const storedOperator = await database.platformOperator.findUnique({
    where: { userId: user.id },
  });
  const bootstrapOperator = configuredPlatformEmails(config).has(
    user.email.trim().toLowerCase(),
  );
  if (storedOperator ? !storedOperator.isActive : !bootstrapOperator) {
    throw new ApiError(
      403,
      'PLATFORM_ADMIN_REQUIRED',
      'Esta sección está reservada para operadores de plataforma.',
    );
  }
  return {
    ...identity,
    role: storedOperator?.role ?? PlatformOperatorRole.SUPER_ADMIN,
  };
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
  return {
    ...identity.user,
    role: identity.role,
    sessionId: identity.session.id,
  };
}

type PlatformPermission =
  | 'export'
  | 'manage_billing'
  | 'manage_operations'
  | 'manage_operators'
  | 'manage_users'
  | 'support'
  | 'view';

const PLATFORM_ROLE_PERMISSIONS: Readonly<
  Record<PlatformOperatorRole, readonly PlatformPermission[]>
> = {
  BILLING: ['manage_billing', 'view'],
  OPERATIONS: ['export', 'manage_operations', 'support', 'view'],
  READ_ONLY: ['view'],
  SUPER_ADMIN: [
    'manage_billing',
    'export',
    'manage_operations',
    'manage_operators',
    'manage_users',
    'support',
    'view',
  ],
  SUPPORT: ['export', 'support', 'view'],
};

function requirePlatformPermission(
  role: PlatformOperatorRole,
  permission: PlatformPermission,
) {
  if (!PLATFORM_ROLE_PERMISSIONS[role].includes(permission)) {
    throw new ApiError(
      403,
      'PLATFORM_PERMISSION_REQUIRED',
      'Tu rol de plataforma no permite realizar esta operación.',
    );
  }
}

function platformRole(value: string): PlatformOperatorRole {
  return value.toUpperCase() as PlatformOperatorRole;
}

function membershipRole(value: string): MembershipRole {
  return value.toUpperCase() as MembershipRole;
}

async function createPlatformAudit(
  database: DatabaseClient,
  input: {
    readonly action: string;
    readonly actorUserId?: string | null;
    readonly afterData?: unknown;
    readonly beforeData?: unknown;
    readonly entityId?: string | null;
    readonly entityType: string;
    readonly metadata?: Record<string, unknown>;
  },
) {
  await database.platformAuditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      afterData: input.afterData as never,
      beforeData: input.beforeData as never,
      entityId: input.entityId ?? null,
      entityType: input.entityType,
      metadata: (input.metadata ?? {}) as never,
    },
  });
}

async function publishedPlatformNumber(
  database: DatabaseClient,
  key: (typeof PLATFORM_CONFIGURATION_KEYS)[number],
  field: 'days' | 'hours',
  fallback: number,
) {
  const configuration = await database.platformConfigurationVersion.findFirst({
    orderBy: { version: 'desc' },
    select: { value: true },
    where: { key, status: PlatformConfigurationStatus.PUBLISHED },
  });
  if (!configuration?.value || typeof configuration.value !== 'object')
    return fallback;
  const value = (configuration.value as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function notificationDeliveryFailures(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const delivery = (value as { delivery?: unknown }).delivery;
  if (!delivery || typeof delivery !== 'object') return [];
  return Object.entries(delivery as Record<string, unknown>).flatMap(
    ([channel, attempt]) => {
      if (!attempt || typeof attempt !== 'object') return [];
      const record = attempt as {
        attempts?: unknown;
        error?: unknown;
        nextAttemptAt?: unknown;
        state?: unknown;
      };
      return record.state === 'failed'
        ? [
            {
              attempts:
                typeof record.attempts === 'number' ? record.attempts : 0,
              channel,
              error: typeof record.error === 'string' ? record.error : null,
              nextAttemptAt:
                typeof record.nextAttemptAt === 'string'
                  ? record.nextAttemptAt
                  : null,
              state: 'failed' as const,
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

function maskedName(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1)}.`)
    .join(' ');
}

function maskedPhone(phone: string | null) {
  if (!phone) return null;
  const visible = phone.slice(-3);
  return `${'*'.repeat(Math.max(4, phone.length - visible.length))}${visible}`;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function refreshPlatformAlerts(
  database: DatabaseClient,
  now = new Date(),
) {
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const cashOpenHours = await publishedPlatformNumber(
    database,
    'alerts.cash_open_hours',
    'hours',
    24,
  );
  const staleCashThreshold = new Date(
    now.getTime() - cashOpenHours * 60 * 60 * 1000,
  );
  const [
    trials,
    cashRegisters,
    inventoryRows,
    orders,
    notificationRows,
    breachedCases,
  ] = await Promise.all([
    database.subscription.findMany({
      include: { organization: { select: { id: true, name: true } } },
      where: {
        status: SubscriptionStatus.TRIAL,
        trialEndsAt: { gt: now, lte: nextWeek },
      },
    }),
    database.cashRegisterSession.findMany({
      where: {
        openedAt: { lt: staleCashThreshold },
        organizationId: { not: null },
        status: CashRegisterStatus.OPEN,
      },
    }),
    database.locationInventory.findMany({
      include: {
        location: { select: { name: true } },
        product: {
          select: {
            isActive: true,
            minimumStock: true,
            name: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
      where: { product: { isActive: true, stockTrackingEnabled: true } },
    }),
    database.productOrder.findMany({
      include: { organization: { select: { id: true, name: true } } },
      where: {
        expiresAt: { lte: now },
        status: {
          in: [ProductOrderStatus.PENDING_PAYMENT, ProductOrderStatus.RESERVED],
        },
      },
    }),
    database.appNotification.findMany({
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    database.platformSupportCase.findMany({
      include: { organization: { select: { id: true, name: true } } },
      where: {
        slaDueAt: { lt: now },
        status: { not: PlatformSupportCaseStatus.CLOSED },
      },
    }),
  ]);
  const organizationIds = [
    ...new Set(
      cashRegisters.flatMap((row) =>
        row.organizationId ? [row.organizationId] : [],
      ),
    ),
  ];
  const cashOrganizations = await database.organization.findMany({
    select: { id: true, name: true },
    where: { id: { in: organizationIds } },
  });
  const organizationNames = new Map(
    cashOrganizations.map((organization) => [
      organization.id,
      organization.name,
    ]),
  );
  const candidates = [
    ...trials.map((trial) => ({
      detail: `El periodo de prueba vence el ${trial.trialEndsAt?.toISOString() ?? 'sin fecha'}.`,
      fingerprint: `trial-ending:${trial.organizationId}`,
      occurredAt: trial.trialEndsAt ?? now,
      organizationId: trial.organizationId,
      severity: 'warning',
      title: `Trial próximo a vencer: ${trial.organization.name}`,
      type: 'trial_ending',
    })),
    ...cashRegisters.flatMap((cash) =>
      cash.organizationId
        ? [
            {
              detail: `La caja permanece abierta desde ${cash.openedAt.toISOString()}.`,
              fingerprint: `cash-open:${cash.id}`,
              occurredAt: cash.openedAt,
              organizationId: cash.organizationId,
              severity: 'critical',
              title: `Caja abierta por más de 24 h: ${organizationNames.get(cash.organizationId) ?? 'Organización'}`,
              type: 'cash_open_too_long',
            },
          ]
        : [],
    ),
    ...inventoryRows
      .filter(
        (row) =>
          row.quantityOnHand - row.quantityReserved <= row.product.minimumStock,
      )
      .map((row) => ({
        detail: `${row.product.name} tiene ${row.quantityOnHand - row.quantityReserved} unidades disponibles en ${row.location.name}.`,
        fingerprint: `low-stock:${row.locationId}:${row.productId}`,
        occurredAt: row.updatedAt,
        organizationId: row.product.organization.id,
        severity: 'warning',
        title: `Stock crítico: ${row.product.organization.name}`,
        type: 'low_stock',
      })),
    ...orders.map((order) => ({
      detail: `El pedido ${order.id} venció sin completar su flujo.`,
      fingerprint: `order-expired:${order.id}`,
      occurredAt: order.expiresAt,
      organizationId: order.organizationId,
      severity: 'warning',
      title: `Pedido pendiente vencido: ${order.organization.name}`,
      type: 'order_expired_pending',
    })),
    ...notificationRows.flatMap((notification) =>
      notificationDeliveryFailures(notification.data).map((failure) => ({
        detail: `Canal ${failure.channel}; ${failure.attempts} intentos agotados.`,
        fingerprint: `notification-failed:${notification.id}:${failure.channel}`,
        occurredAt: notification.createdAt,
        organizationId: notification.organizationId,
        severity: failure.attempts >= 5 ? 'critical' : 'warning',
        title: `Fallo de notificación: ${notification.organization.name}`,
        type: 'notification_failed',
      })),
    ),
    ...breachedCases.map((supportCase) => ({
      detail: `La incidencia ${supportCase.title} superó su SLA el ${supportCase.slaDueAt?.toISOString() ?? 'sin fecha'}.`,
      fingerprint: `support-sla-breached:${supportCase.id}`,
      occurredAt: supportCase.slaDueAt ?? now,
      organizationId: supportCase.organizationId,
      severity: 'critical',
      title: `SLA vencido: ${supportCase.organization.name}`,
      type: 'support_sla_breached',
    })),
  ];
  await Promise.all(
    candidates.map((candidate) =>
      database.platformAlert.upsert({
        create: { ...candidate, status: PlatformAlertStatus.OPEN },
        update: {
          detail: candidate.detail,
          occurredAt: candidate.occurredAt,
          severity: candidate.severity,
          title: candidate.title,
        },
        where: { fingerprint: candidate.fingerprint },
      }),
    ),
  );
  return candidates.length;
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
      role: { in: [MembershipRole.BARBER, MembershipRole.OWNER] },
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
  resendPendingVerification: (
    pendingRegistrationId: string,
  ) => Promise<{ readonly verificationExpiresAt: string }>,
  requestPasswordRecovery: (userId: string) => Promise<void>,
) {
  app.post('/v1/platform/development-session', async () => {
    if (config.PLATFORM_DEVELOPMENT_BYPASS !== 'true') {
      throw new ApiError(404, 'NOT_FOUND', 'Ruta no disponible.');
    }
    const email = configuredPlatformEmails(config).values().next().value;
    const user = email
      ? await database.user.findUnique({ where: { email } })
      : null;
    if (!user || user.deletedAt || user.suspendedAt || !user.emailVerifiedAt) {
      throw new ApiError(
        503,
        'DEVELOPMENT_OPERATOR_UNAVAILABLE',
        'No hay un operador de plataforma disponible para desarrollo.',
      );
    }

    const now = new Date();
    const token = createOpaqueToken();
    const expiresAt = new Date(now.getTime() + PLATFORM_SESSION_DURATION_MS);
    await database.$transaction(async (transaction) => {
      const session = await transaction.session.create({
        data: {
          expiresAt,
          lastActiveAt: now,
          tokenHash: hashOpaqueToken(token),
          userId: user.id,
        },
      });
      await transaction.platformAdminAccessChallenge.create({
        data: {
          codeHash: hashOpaqueToken(createOpaqueToken()),
          expiresAt,
          sessionId: session.id,
          usedAt: now,
          userId: user.id,
          verifiedAt: now,
        },
      });
    });
    return {
      operator: {
        email: user.email,
        fullName: user.fullName,
        id: user.id,
        role: PlatformOperatorRole.SUPER_ADMIN.toLowerCase(),
      },
      session: { expiresAt: expiresAt.toISOString(), token },
    };
  });

  app.post('/v1/platform/login', async (request) => {
    enforcePlatformLoginRateLimit(config, request);
    const input = signInSchema.parse(request.body);
    const email = input.email.trim().toLowerCase();
    const user = await database.user.findUnique({
      include: { platformOperator: true },
      where: { email },
    });
    const accountIsEligible = Boolean(
      user && !user.deletedAt && !user.suspendedAt && user.emailVerifiedAt,
    );
    const credentials = resolvePlatformLoginCredentials({
      bootstrapPasswordHash: config.PLATFORM_ADMIN_PASSWORD_HASH,
      configuredEmails: configuredPlatformEmails(config),
      user,
    });
    if (
      accountIsEligible &&
      credentials.source === 'operator_password_not_configured'
    ) {
      await createPlatformAudit(database, {
        action: 'platform.login.failed',
        actorUserId: user!.id,
        entityId: user!.platformOperator!.id,
        entityType: 'platform_operator',
        metadata: { reason: 'operator_password_not_configured' },
      });
      throw new ApiError(
        409,
        'PLATFORM_OPERATOR_PASSWORD_NOT_CONFIGURED',
        'Este operador no tiene una contraseña administrativa configurada. Solicita su configuración mediante el comando operativo de la VPS.',
      );
    }
    const passwordHash =
      'passwordHash' in credentials ? credentials.passwordHash : undefined;
    const platformPasswordMatches = Boolean(
      passwordHash &&
      user &&
      (await verifyPassword(input.password, passwordHash)),
    );
    const reusesApplicationPassword = Boolean(
      platformPasswordMatches &&
      user?.passwordHash &&
      (await verifyPassword(input.password, user.passwordHash)),
    );
    if (
      credentials.source === 'unauthorized' ||
      !passwordHash ||
      !user ||
      !accountIsEligible ||
      !platformPasswordMatches ||
      reusesApplicationPassword
    ) {
      if (user) {
        await createPlatformAudit(database, {
          action: 'platform.login.failed',
          actorUserId: user.id,
          entityId: user.id,
          entityType: 'platform_operator',
          metadata: { reason: 'invalid_credentials_or_inactive' },
        });
      }
      throw new ApiError(
        401,
        'INVALID_PLATFORM_CREDENTIALS',
        'El correo o la contraseña son incorrectos.',
      );
    }
    if (!platformAccessMailer) {
      throw new ApiError(
        503,
        'PLATFORM_ACCESS_DELIVERY_UNAVAILABLE',
        'El envío de códigos de acceso no está disponible.',
      );
    }
    if (
      credentials.source === 'operator' &&
      user.platformOperator &&
      passwordHashNeedsUpgrade(passwordHash)
    ) {
      await database.platformOperator.update({
        data: {
          adminPasswordHash: await hashPassword(input.password),
          adminPasswordSetAt: new Date(),
        },
        where: { id: user.platformOperator.id },
      });
    }
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + PLATFORM_ACCESS_CODE_DURATION_MS,
    );
    const code = createVerificationCode();
    const challengeToken = createOpaqueToken();
    await database.$transaction(async (transaction) => {
      await transaction.platformAdminAccessChallenge.updateMany({
        data: { usedAt: now },
        where: {
          userId: user.id,
          usedAt: null,
          verifiedAt: null,
        },
      });
      await transaction.platformAdminAccessChallenge.create({
        data: {
          challengeTokenHash: hashOpaqueToken(challengeToken),
          codeHash: hashOpaqueToken(code),
          expiresAt,
          userId: user.id,
        },
      });
    });
    await createPlatformAudit(database, {
      action: 'platform.login.challenge_requested',
      actorUserId: user.id,
      entityId: user.id,
      entityType: 'platform_operator',
    });
    try {
      await platformAccessMailer.send({ code, email: user.email });
    } catch (error) {
      await database.platformAdminAccessChallenge.updateMany({
        data: { usedAt: new Date() },
        where: { challengeTokenHash: hashOpaqueToken(challengeToken) },
      });
      throw error;
    }
    return {
      challengeToken,
      expiresAt: expiresAt.toISOString(),
      message: 'Enviamos un código de acceso a tu correo registrado.',
    };
  });

  app.post('/v1/platform/access-code', async (request) => {
    const challengeToken = platformChallengeToken(request);
    const challenge = await database.platformAdminAccessChallenge.findUnique({
      include: { user: true },
      where: { challengeTokenHash: hashOpaqueToken(challengeToken) },
    });
    const now = new Date();
    if (!challenge || challenge.usedAt || challenge.expiresAt <= now) {
      throw new ApiError(
        400,
        'PLATFORM_ACCESS_CODE_REQUIRED',
        'Inicia sesión nuevamente para solicitar un código.',
      );
    }
    if (challenge.failedAttempts >= PLATFORM_ACCESS_MAX_FAILED_ATTEMPTS) {
      throw new ApiError(
        429,
        'PLATFORM_ACCESS_CODE_RATE_LIMITED',
        'Demasiados intentos. Inicia sesión nuevamente.',
      );
    }
    if (!platformAccessMailer) {
      throw new ApiError(
        503,
        'PLATFORM_ACCESS_DELIVERY_UNAVAILABLE',
        'El envío de códigos de acceso no está disponible.',
      );
    }
    const expiresAt = new Date(
      now.getTime() + PLATFORM_ACCESS_CODE_DURATION_MS,
    );
    const code = createVerificationCode();
    await database.platformAdminAccessChallenge.update({
      data: { codeHash: hashOpaqueToken(code), expiresAt },
      where: { id: challenge.id },
    });
    try {
      await platformAccessMailer.send({ code, email: challenge.user.email });
    } catch (error) {
      await database.platformAdminAccessChallenge.update({
        data: { usedAt: new Date() },
        where: { id: challenge.id },
      });
      throw error;
    }
    return {
      expiresAt: expiresAt.toISOString(),
      message: 'Enviamos un código de acceso a tu correo registrado.',
    };
  });

  app.post('/v1/platform/verify-access-code', async (request) => {
    const challengeToken = platformChallengeToken(request);
    const { code } = platformAccessCodeSchema.parse(request.body);
    const now = new Date();
    const sessionToken = createOpaqueToken();
    const sessionExpiresAt = new Date(
      now.getTime() + PLATFORM_SESSION_DURATION_MS,
    );
    const operator = await database.$transaction(async (transaction) => {
      const challenge =
        await transaction.platformAdminAccessChallenge.findUnique({
          include: { user: { include: { platformOperator: true } } },
          where: { challengeTokenHash: hashOpaqueToken(challengeToken) },
        });
      if (!challenge) {
        throw new ApiError(
          401,
          'PLATFORM_ACCESS_CODE_REQUIRED',
          'Inicia sesión nuevamente para continuar.',
        );
      }
      const authorized = challenge.user.platformOperator
        ? challenge.user.platformOperator.isActive
        : configuredPlatformEmails(config).has(
            challenge.user.email.trim().toLowerCase(),
          );
      if (!authorized) {
        throw new ApiError(
          403,
          'PLATFORM_ADMIN_REQUIRED',
          'El acceso de este operador fue revocado.',
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
      const session = await transaction.session.create({
        data: {
          expiresAt: sessionExpiresAt,
          lastActiveAt: now,
          tokenHash: hashOpaqueToken(sessionToken),
          userId: challenge.userId,
        },
      });
      await transaction.platformAdminAccessChallenge.update({
        data: { sessionId: session.id, usedAt: now, verifiedAt: now },
        where: { id: challenge.id },
      });
      return challenge.user;
    });
    await createPlatformAudit(database, {
      action: 'platform.login.succeeded',
      actorUserId: operator.id,
      entityId: operator.id,
      entityType: 'platform_operator',
    });
    return {
      session: {
        expiresAt: sessionExpiresAt.toISOString(),
        token: sessionToken,
      },
      operator: {
        email: operator.email,
        fullName: operator.fullName,
        id: operator.id,
        role: operator.platformOperator?.role.toLowerCase() ?? 'super_admin',
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
      operator: {
        email: user.email,
        fullName: user.fullName,
        id: user.id,
        role: user.role.toLowerCase(),
      },
    };
  });

  app.get('/v1/platform/operators', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const configuredEmails = [...configuredPlatformEmails(config)];
    const [stored, bootstrapUsers] = await Promise.all([
      database.platformOperator.findMany({
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      }),
      database.user.findMany({
        where: { deletedAt: null, email: { in: configuredEmails } },
      }),
    ]);
    const byUserId = new Map(
      stored.map((entry) => [
        entry.userId,
        {
          createdAt: entry.createdAt.toISOString(),
          email: entry.user.email,
          fullName: entry.user.fullName,
          id: entry.id,
          isActive: entry.isActive,
          role: entry.role.toLowerCase(),
          userId: entry.userId,
        },
      ]),
    );
    for (const user of bootstrapUsers) {
      if (!byUserId.has(user.id)) {
        byUserId.set(user.id, {
          createdAt: user.createdAt.toISOString(),
          email: user.email,
          fullName: user.fullName,
          id: `bootstrap:${user.id}`,
          isActive: true,
          role: 'super_admin',
          userId: user.id,
        });
      }
    }
    return { operators: [...byUserId.values()] };
  });

  app.post('/v1/platform/operators', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operators');
    const input = platformOperatorInputSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    if (!user || user.deletedAt || !user.emailVerifiedAt) {
      throw new ApiError(
        404,
        'PLATFORM_OPERATOR_USER_NOT_FOUND',
        'El operador debe tener una cuenta verificada en Nava.',
      );
    }
    const before = await database.platformOperator.findUnique({
      where: { userId: user.id },
    });
    if (before && input.isActive && !before.adminPasswordHash) {
      throw new ApiError(
        409,
        'PLATFORM_OPERATOR_PASSWORD_NOT_CONFIGURED',
        'Configura una contraseña administrativa antes de activar al operador.',
      );
    }
    const saved = await database.platformOperator.upsert({
      create: {
        createdByUserId: operator.id,
        isActive: false,
        role: platformRole(input.role),
        userId: user.id,
      },
      update: {
        isActive: input.isActive,
        role: platformRole(input.role),
      },
      where: { userId: user.id },
    });
    await createPlatformAudit(database, {
      action: before
        ? 'platform.operator.updated'
        : 'platform.operator.created',
      actorUserId: operator.id,
      afterData: { isActive: saved.isActive, role: saved.role },
      beforeData: before
        ? { isActive: before.isActive, role: before.role }
        : null,
      entityId: saved.id,
      entityType: 'platform_operator',
      metadata: { targetUserId: user.id },
    });
    return reply.code(before ? 200 : 201).send({
      operator: {
        email: user.email,
        fullName: user.fullName,
        id: saved.id,
        isActive: saved.isActive,
        role: saved.role.toLowerCase(),
        userId: user.id,
      },
    });
  });

  app.patch('/v1/platform/operators/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operators');
    const { id } = platformOperatorParamsSchema.parse(request.params);
    const input = platformOperatorInputSchema
      .omit({ email: true })
      .parse(request.body);
    const before = await database.platformOperator.findUnique({
      where: { id },
    });
    if (!before) {
      throw new ApiError(
        404,
        'PLATFORM_OPERATOR_NOT_FOUND',
        'El operador no existe.',
      );
    }
    if (before.userId === operator.id && !input.isActive) {
      throw new ApiError(
        409,
        'PLATFORM_OPERATOR_SELF_DEACTIVATION',
        'No puedes desactivar tu propio acceso.',
      );
    }
    if (input.isActive && !before.adminPasswordHash) {
      throw new ApiError(
        409,
        'PLATFORM_OPERATOR_PASSWORD_NOT_CONFIGURED',
        'Configura una contraseña administrativa antes de activar al operador.',
      );
    }
    const saved = await database.platformOperator.update({
      data: { isActive: input.isActive, role: platformRole(input.role) },
      where: { id },
    });
    if (!saved.isActive) {
      await database.session.updateMany({
        data: { revokedAt: new Date() },
        where: { revokedAt: null, userId: saved.userId },
      });
    }
    await createPlatformAudit(database, {
      action:
        saved.isActive && !before.isActive
          ? 'platform.operator.activated'
          : !saved.isActive && before.isActive
            ? 'platform.operator.deactivated'
            : 'platform.operator.updated',
      actorUserId: operator.id,
      afterData: { isActive: saved.isActive, role: saved.role },
      beforeData: { isActive: before.isActive, role: before.role },
      entityId: saved.id,
      entityType: 'platform_operator',
      metadata: { targetUserId: saved.userId },
    });
    return {
      operator: {
        id: saved.id,
        isActive: saved.isActive,
        role: saved.role.toLowerCase(),
      },
    };
  });

  app.get('/v1/platform/sessions', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    const canManageAll =
      PLATFORM_ROLE_PERMISSIONS[operator.role].includes('manage_operators');
    const sessions = await database.session.findMany({
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { lastActiveAt: 'desc' },
      take: 100,
      where: {
        expiresAt: { gt: new Date() },
        revokedAt: null,
        ...(canManageAll ? {} : { userId: operator.id }),
        platformAccessChallenges: { some: { verifiedAt: { not: null } } },
      },
    });
    return {
      sessions: sessions.map((session) => ({
        createdAt: session.createdAt.toISOString(),
        current: session.id === operator.sessionId,
        expiresAt: session.expiresAt.toISOString(),
        id: session.id,
        lastActiveAt: session.lastActiveAt.toISOString(),
        operator: session.user,
      })),
    };
  });

  app.delete('/v1/platform/sessions/:id', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    const { id } = platformSessionParamsSchema.parse(request.params);
    const session = await database.session.findUnique({ where: { id } });
    if (!session) {
      throw new ApiError(
        404,
        'PLATFORM_SESSION_NOT_FOUND',
        'La sesión no existe.',
      );
    }
    if (session.userId !== operator.id) {
      requirePlatformPermission(operator.role, 'manage_operators');
    }
    await database.session.update({
      data: { revokedAt: new Date() },
      where: { id },
    });
    await createPlatformAudit(database, {
      action: 'platform.session.revoked',
      actorUserId: operator.id,
      entityId: id,
      entityType: 'session',
      metadata: { targetUserId: session.userId },
    });
    return reply.code(204).send();
  });

  app.get('/v1/platform/users', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformUserListSchema.parse(request.query);
    const where = {
      ...(query.status === 'active'
        ? { deletedAt: null, suspendedAt: null }
        : query.status === 'suspended'
          ? { deletedAt: null, suspendedAt: { not: null } }
          : query.status === 'deleted'
            ? { deletedAt: { not: null } }
            : {}),
      ...(query.verification === 'verified'
        ? { emailVerifiedAt: { not: null } }
        : query.verification === 'unverified'
          ? { emailVerifiedAt: null }
          : {}),
      ...(query.role === 'all'
        ? {}
        : { memberships: { some: { role: membershipRole(query.role) } } }),
      ...(query.organizationId
        ? { memberships: { some: { organizationId: query.organizationId } } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                fullName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              { id: { equals: query.search } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const now = new Date();
    const [total, users] = await Promise.all([
      database.user.count({ where }),
      database.user.findMany({
        include: {
          _count: {
            select: {
              memberships: true,
              sessions: {
                where: { expiresAt: { gt: now }, revokedAt: null },
              },
            },
          },
          memberships: { select: { role: true } },
          sessions: {
            orderBy: { lastActiveAt: 'desc' },
            select: { expiresAt: true, lastActiveAt: true, revokedAt: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    return {
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      users: users.map((user) => {
        return {
          createdAt: user.createdAt.toISOString(),
          email: maskedEmail(user.email),
          emailVerified: Boolean(user.emailVerifiedAt),
          id: user.id,
          lastAccessAt: user.sessions[0]?.lastActiveAt.toISOString() ?? null,
          memberships: user._count.memberships,
          name: maskedName(user.fullName),
          phone: maskedPhone(user.phone),
          roles: [
            ...new Set(
              user.memberships.map((membership) =>
                membership.role.toLowerCase(),
              ),
            ),
          ],
          security: {
            activeSessions: user._count.sessions,
            suspended: Boolean(user.suspendedAt),
          },
          status: user.deletedAt
            ? 'deleted'
            : user.suspendedAt
              ? 'suspended'
              : 'active',
        };
      }),
    };
  });

  app.get('/v1/platform/welcome-survey-responses', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformWelcomeSurveyResponseListSchema.parse(request.query);
    const where = query.search
      ? {
          user: {
            OR: [
              {
                email: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                fullName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          },
        }
      : {};
    const [total, responses] = await Promise.all([
      database.welcomeSurveyResponse.count({ where }),
      database.welcomeSurveyResponse.findMany({
        include: {
          user: { select: { email: true, fullName: true, id: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    return {
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      responses: responses.map((response) => ({
        id: response.id,
        selectedOptions: response.selectedOptions,
        submittedAt: response.submittedAt.toISOString(),
        user: response.user,
      })),
    };
  });

  app.get('/v1/platform/users/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const { id } = platformUserParamsSchema.parse(request.params);
    const now = new Date();
    const user = await database.user.findUnique({
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, name: true, status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        pushTokens: { select: { createdAt: true, updatedAt: true } },
        sessions: {
          orderBy: { lastActiveAt: 'desc' },
          select: {
            createdAt: true,
            expiresAt: true,
            lastActiveAt: true,
            revokedAt: true,
          },
          take: 50,
        },
      },
      where: { id },
    });
    if (!user)
      throw new ApiError(
        404,
        'PLATFORM_USER_NOT_FOUND',
        'La cuenta no existe.',
      );
    const activeSessions = user.sessions.filter(
      (session) => !session.revokedAt && session.expiresAt > now,
    );
    const [audit, supportCases] = await Promise.all([
      database.platformAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        select: { action: true, createdAt: true, metadata: true },
        take: 20,
        where: { entityId: user.id, entityType: 'user' },
      }),
      database.platformSupportCase.findMany({
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        where: {
          organizationId: {
            in: user.memberships.map((membership) => membership.organizationId),
          },
        },
      }),
    ]);
    return {
      user: {
        account: {
          createdAt: user.createdAt.toISOString(),
          deletedAt: user.deletedAt?.toISOString() ?? null,
          email: maskedEmail(user.email),
          emailVerified: Boolean(user.emailVerifiedAt),
          id: user.id,
          name: maskedName(user.fullName),
          phone: maskedPhone(user.phone),
          suspendedAt: user.suspendedAt?.toISOString() ?? null,
          updatedAt: user.updatedAt.toISOString(),
        },
        audit: audit.map((entry) => ({
          action: entry.action,
          createdAt: entry.createdAt.toISOString(),
          metadata: entry.metadata,
        })),
        devices: user.pushTokens.map((device) => ({
          createdAt: device.createdAt.toISOString(),
          updatedAt: device.updatedAt.toISOString(),
        })),
        memberships: user.memberships.map((membership) => ({
          createdAt: membership.createdAt.toISOString(),
          id: membership.id,
          organization: {
            id: membership.organization.id,
            name: membership.organization.name,
            status: membership.organization.status.toLowerCase(),
          },
          role: membership.role.toLowerCase(),
          status: membership.status.toLowerCase(),
        })),
        security: {
          activeSessions: activeSessions.length,
          lastAccessAt: user.sessions[0]?.lastActiveAt.toISOString() ?? null,
          sessions: user.sessions.map((session) => ({
            createdAt: session.createdAt.toISOString(),
            expiresAt: session.expiresAt.toISOString(),
            lastActiveAt: session.lastActiveAt.toISOString(),
            status: session.revokedAt
              ? 'revoked'
              : session.expiresAt <= now
                ? 'expired'
                : 'active',
          })),
        },
        status: user.deletedAt
          ? 'deleted'
          : user.suspendedAt
            ? 'suspended'
            : 'active',
        supportCases: supportCases.map((supportCase) => ({
          id: supportCase.id,
          organization: supportCase.organization,
          status: supportCase.status.toLowerCase(),
          title: supportCase.title,
          updatedAt: supportCase.updatedAt.toISOString(),
        })),
      },
    };
  });

  app.patch('/v1/platform/users/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_users');
    const { id } = platformUserParamsSchema.parse(request.params);
    const input = platformUserActionSchema.parse(request.body);
    const target = await database.user.findUnique({ where: { id } });
    if (!target)
      throw new ApiError(
        404,
        'PLATFORM_USER_NOT_FOUND',
        'La cuenta no existe.',
      );
    if (target.id === operator.id && input.action === 'suspend') {
      throw new ApiError(
        409,
        'PLATFORM_USER_SELF_SUSPENSION',
        'No puedes suspender tu propia cuenta.',
      );
    }
    if (target.deletedAt) {
      throw new ApiError(
        409,
        'PLATFORM_USER_DELETED',
        'Una cuenta eliminada no puede modificarse.',
      );
    }
    const now = new Date();
    if (input.action === 'suspend') {
      await database.$transaction(async (transaction) => {
        await transaction.user.update({
          data: { suspendedAt: now },
          where: { id },
        });
        await transaction.session.updateMany({
          data: { revokedAt: now },
          where: { revokedAt: null, userId: id },
        });
      });
    } else if (input.action === 'reactivate') {
      await database.user.update({
        data: { suspendedAt: null },
        where: { id },
      });
    } else if (input.action === 'revoke_sessions') {
      await database.session.updateMany({
        data: { revokedAt: now },
        where: { revokedAt: null, userId: id },
      });
    } else {
      if (target.suspendedAt) {
        throw new ApiError(
          409,
          'PLATFORM_USER_SUSPENDED',
          'Reactiva la cuenta antes de solicitar la recuperación.',
        );
      }
      await requestPasswordRecovery(id);
    }
    const action =
      input.action === 'suspend'
        ? 'platform.user.suspended'
        : input.action === 'reactivate'
          ? 'platform.user.reactivated'
          : input.action === 'revoke_sessions'
            ? 'platform.user.sessions_revoked'
            : 'platform.user.password_recovery_requested';
    await createPlatformAudit(database, {
      action,
      actorUserId: operator.id,
      afterData:
        input.action === 'suspend'
          ? { suspendedAt: now.toISOString() }
          : input.action === 'reactivate'
            ? { suspendedAt: null }
            : undefined,
      beforeData:
        input.action === 'suspend' || input.action === 'reactivate'
          ? { suspendedAt: target.suspendedAt?.toISOString() ?? null }
          : undefined,
      entityId: id,
      entityType: 'user',
      metadata: { reason: input.reason },
    });
    return {
      id,
      status:
        input.action === 'suspend'
          ? 'suspended'
          : input.action === 'reactivate'
            ? 'active'
            : undefined,
    };
  });

  app.patch('/v1/platform/memberships/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_users');
    const { id } = platformMembershipParamsSchema.parse(request.params);
    const input = platformMembershipActionSchema.parse(request.body);
    const membership = await database.membership.findUnique({
      select: {
        organizationId: true,
        role: true,
        status: true,
        userId: true,
      },
      where: { id },
    });
    if (!membership) {
      throw new ApiError(
        404,
        'PLATFORM_MEMBERSHIP_NOT_FOUND',
        'La membresÃ­a no existe.',
      );
    }
    if (membership.role === MembershipRole.OWNER) {
      throw new ApiError(
        409,
        'PLATFORM_OWNER_MEMBERSHIP_PROTECTED',
        'La propiedad solo puede cambiarse mediante una transferencia explÃ­cita.',
      );
    }
    if (
      (input.action === 'suspend' &&
        membership.status !== MembershipStatus.ACTIVE) ||
      (input.action === 'reactivate' &&
        membership.status !== MembershipStatus.SUSPENDED)
    ) {
      throw new ApiError(
        409,
        'PLATFORM_MEMBERSHIP_STATE_CONFLICT',
        'La membresÃ­a no admite esta transiciÃ³n de estado.',
      );
    }
    if (
      input.action === 'change_role' &&
      membership.status !== MembershipStatus.ACTIVE
    ) {
      throw new ApiError(
        409,
        'PLATFORM_MEMBERSHIP_STATE_CONFLICT',
        'Solo puedes cambiar el rol de una membresÃ­a activa.',
      );
    }
    if (
      input.action === 'change_role' &&
      membership.role === membershipRole(input.role)
    ) {
      throw new ApiError(
        409,
        'PLATFORM_MEMBERSHIP_NO_CHANGE',
        'La membresÃ­a ya tiene ese rol.',
      );
    }
    const nextRole =
      input.action === 'change_role'
        ? membershipRole(input.role)
        : membership.role;
    const nextStatus =
      input.action === 'suspend'
        ? MembershipStatus.SUSPENDED
        : input.action === 'reactivate'
          ? MembershipStatus.ACTIVE
          : membership.status;
    const updated = await database.$transaction(async (transaction) => {
      if (
        nextStatus === MembershipStatus.ACTIVE &&
        nextRole === MembershipRole.BARBER &&
        (membership.status !== MembershipStatus.ACTIVE ||
          membership.role !== MembershipRole.BARBER)
      ) {
        await assertCanCreateTeamMember(
          transaction as Parameters<typeof assertCanCreateTeamMember>[0],
          membership.organizationId,
        );
      }
      const result = await transaction.membership.update({
        data: { role: nextRole, status: nextStatus },
        where: { id },
      });
      await transaction.platformAuditLog.create({
        data: {
          action: 'platform.user.membership_changed',
          actorUserId: operator.id,
          afterData: {
            role: result.role.toLowerCase(),
            status: result.status.toLowerCase(),
          } as never,
          beforeData: {
            role: membership.role.toLowerCase(),
            status: membership.status.toLowerCase(),
          } as never,
          entityId: id,
          entityType: 'membership',
          metadata: {
            action: input.action,
            organizationId: membership.organizationId,
            reason: input.reason,
            userId: membership.userId,
          } as never,
        },
      });
      return result;
    });
    return {
      id: updated.id,
      role: updated.role.toLowerCase(),
      status: updated.status.toLowerCase(),
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

  app.get('/v1/platform/subscription-discounts', async (request) => {
    const operator = await requirePlatformAdmin(database, authenticate, request, config);
    requirePlatformPermission(operator.role, 'manage_billing');
    const query = platformSubscriptionDiscountListSchema.parse(request.query);
    const coupons = await database.subscriptionDiscountCoupon.findMany({
      include: {
        _count: { select: { grants: true } },
        plans: { include: { plan: { select: { code: true, id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      where: {
        ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
        ...(query.search
          ? {
              OR: [
                { displayCode: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    });
    const plans = await database.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { code: true, id: true, name: true },
      where: { isActive: true, isPublic: true, monthlyPriceCents: { gt: 0 } },
    });
    return {
      coupons: coupons.map((coupon) => ({
        code: coupon.displayCode,
        createdAt: coupon.createdAt.toISOString(),
        description: coupon.description,
        endsAt: coupon.endsAt?.toISOString() ?? null,
        grantCount: coupon._count.grants,
        id: coupon.id,
        isActive: coupon.isActive,
        kind: coupon.kind.toLowerCase(),
        name: coupon.name,
        percentage: coupon.percentageBasisPoints / 100,
        plans: coupon.plans.map(({ plan }) => plan),
        startsAt: coupon.startsAt?.toISOString() ?? null,
      })),
      plans,
    };
  });

  app.post('/v1/platform/subscription-discounts', async (request, reply) => {
    const operator = await requirePlatformAdmin(database, authenticate, request, config);
    requirePlatformPermission(operator.role, 'manage_billing');
    const input = platformSubscriptionDiscountCreateSchema.parse(request.body);
    const planIds = [...new Set(input.planIds)];
    if (planIds.length > 0) {
      const validPlans = await database.plan.count({
        where: { id: { in: planIds }, isActive: true, isPublic: true, monthlyPriceCents: { gt: 0 } },
      });
      if (validPlans !== planIds.length)
        throw new ApiError(400, 'SUBSCRIPTION_DISCOUNT_PLAN_INVALID', 'Selecciona únicamente planes públicos de pago vigentes.');
    }
    const normalizedCode = input.code.toUpperCase();
    let coupon;
    try {
      coupon = await database.subscriptionDiscountCoupon.create({
        data: {
          createdByUserId: operator.id,
          description: input.description || null,
          displayCode: normalizedCode,
          endsAt: input.kind === 'temporary' ? input.endsAt ?? null : null,
          kind: input.kind === 'temporary' ? SubscriptionDiscountKind.TEMPORARY : SubscriptionDiscountKind.LIFETIME_CONTINUITY,
          name: input.name,
          normalizedCode,
          percentageBasisPoints: input.percentage * 100,
          plans: { create: planIds.map((planId) => ({ plan: { connect: { id: planId } } })) },
          startsAt: input.startsAt ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApiError(409, 'SUBSCRIPTION_DISCOUNT_CODE_EXISTS', 'Ya existe un cupón con ese código.');
      throw error;
    }
    await createPlatformAudit(database, {
      action: 'platform.subscription_discount.created',
      actorUserId: operator.id,
      afterData: { code: coupon.normalizedCode, kind: coupon.kind, percentageBasisPoints: coupon.percentageBasisPoints, planIds },
      entityId: coupon.id,
      entityType: 'subscription_discount_coupon',
      metadata: { reason: input.reason },
    });
    return reply.code(201).send({ id: coupon.id });
  });

  app.post('/v1/platform/subscription-discounts/:id/status', async (request) => {
    const operator = await requirePlatformAdmin(database, authenticate, request, config);
    requirePlatformPermission(operator.role, 'manage_billing');
    const { id } = platformSubscriptionDiscountParamsSchema.parse(request.params);
    const input = platformSubscriptionDiscountStatusSchema.parse(request.body);
    const before = await database.subscriptionDiscountCoupon.findUnique({ where: { id } });
    if (!before)
      throw new ApiError(404, 'SUBSCRIPTION_DISCOUNT_NOT_FOUND', 'El cupón no existe.');
    const coupon = await database.subscriptionDiscountCoupon.update({ data: { isActive: input.isActive }, where: { id } });
    await createPlatformAudit(database, {
      action: input.isActive ? 'platform.subscription_discount.activated' : 'platform.subscription_discount.deactivated',
      actorUserId: operator.id,
      afterData: { isActive: coupon.isActive },
      beforeData: { isActive: before.isActive },
      entityId: coupon.id,
      entityType: 'subscription_discount_coupon',
      metadata: { reason: input.reason },
    });
    return { id: coupon.id, isActive: coupon.isActive };
  });

  app.get('/v1/platform/subscriptions', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_billing');
    const query = platformSubscriptionListSchema.parse(request.query);
    const subscriptionStatus =
      query.status === 'all'
        ? undefined
        : (query.status.toUpperCase() as SubscriptionStatus);
    const invoiceStatus =
      query.invoiceStatus === 'all'
        ? undefined
        : (query.invoiceStatus.toUpperCase() as SubscriptionInvoiceStatus);
    const paymentStatus =
      query.paymentStatus === 'all'
        ? undefined
        : (query.paymentStatus.toUpperCase() as SubscriptionPaymentStatus);
    const invoiceFilter = {
      ...(invoiceStatus ? { status: invoiceStatus } : {}),
      ...(paymentStatus
        ? { paymentAttempts: { some: { status: paymentStatus } } }
        : {}),
    };
    const hasInvoiceFilters = Boolean(invoiceStatus || paymentStatus);
    const where = {
      ...(subscriptionStatus ? { status: subscriptionStatus } : {}),
      organization: {
        deletedAt: null,
        ...(query.search
          ? {
              OR: [
                {
                  name: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  slug: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
        ...(hasInvoiceFilters
          ? { subscriptionInvoices: { some: invoiceFilter } }
          : {}),
      },
    };
    const [total, subscriptions] = await Promise.all([
      database.subscription.count({ where }),
      database.subscription.findMany({
        include: {
          changes: {
            orderBy: { createdAt: 'desc' },
            select: {
              billingTimezone: true,
              createdAt: true,
              id: true,
              kind: true,
              toStatus: true,
            },
            take: 3,
          },
          organization: {
            select: {
              defaultTimezone: true,
              id: true,
              name: true,
              slug: true,
              subscriptionInvoices: {
                orderBy: { createdAt: 'desc' },
                select: {
                  billingTimezone: true,
                  createdAt: true,
                  currencyCode: true,
                  dueAt: true,
                  id: true,
                  paidAt: true,
                  providerPaidAt: true,
                  planCode: true,
                  status: true,
                  totalCents: true,
                  paymentAttempts: {
                    orderBy: { createdAt: 'desc' },
                    select: {
                      amountCents: true,
                      appliedAt: true,
                      createdAt: true,
                      currencyCode: true,
                      id: true,
                      provider: true,
                      status: true,
                    },
                    take: 1,
                  },
                },
                take: 1,
              },
            },
          },
          plan: { select: { code: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    const firstPaidInvoices =
      subscriptions.length === 0
        ? []
        : await database.subscriptionInvoice.findMany({
            distinct: ['organizationId'],
            orderBy: [{ organizationId: 'asc' }, { periodStartsAt: 'asc' }],
            select: { organizationId: true, periodStartsAt: true },
            where: {
              organizationId: {
                in: subscriptions.map(
                  (subscription) => subscription.organization.id,
                ),
              },
              periodStartsAt: { not: null },
              status: SubscriptionInvoiceStatus.PAID,
            },
          });
    const subscriptionStarts = new Map(
      firstPaidInvoices.flatMap((invoice) =>
        invoice.periodStartsAt
          ? [[invoice.organizationId, invoice.periodStartsAt] as const]
          : [],
      ),
    );
    return {
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      subscriptions: subscriptions.map((subscription) => {
        const invoice =
          subscription.organization.subscriptionInvoices[0] ?? null;
        const payment = invoice?.paymentAttempts[0] ?? null;
        return {
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
          history: subscription.changes.map((change) => ({
            billingTimezone: change.billingTimezone,
            createdAt: change.createdAt.toISOString(),
            id: change.id,
            kind: change.kind.toLowerCase(),
            status: change.toStatus.toLowerCase(),
          })),
          id: subscription.id,
          latestInvoice: invoice
            ? {
                billingTimezone: invoice.billingTimezone,
                createdAt: invoice.createdAt.toISOString(),
                currencyCode: invoice.currencyCode,
                dueAt: invoice.dueAt.toISOString(),
                id: invoice.id,
                paidAt: invoice.paidAt?.toISOString() ?? null,
                providerPaidAt: invoice.providerPaidAt?.toISOString() ?? null,
                planCode: invoice.planCode,
                status: invoice.status.toLowerCase(),
                totalCents: invoice.totalCents,
              }
            : null,
          latestPayment: payment
            ? {
                amountCents: payment.amountCents,
                appliedAt: payment.appliedAt?.toISOString() ?? null,
                createdAt: payment.createdAt.toISOString(),
                currencyCode: payment.currencyCode,
                id: payment.id,
                provider: payment.provider,
                billingTimezone:
                  invoice?.billingTimezone ??
                  subscription.organization.defaultTimezone,
                status: payment.status.toLowerCase(),
              }
            : null,
          organization: subscription.organization,
          plan: subscription.plan,
          status: subscription.status.toLowerCase(),
          subscriptionStartedAt:
            subscriptionStarts
              .get(subscription.organization.id)
              ?.toISOString() ?? null,
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
          updatedAt: subscription.updatedAt.toISOString(),
        };
      }),
    };
  });

  app.get('/v1/platform/payment-receipts', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_billing');
    const query = platformPaymentReceiptListSchema.parse(request.query);
    if (query.from && query.to && query.from > query.to)
      throw new ApiError(
        400,
        'PLATFORM_RECEIPT_DATE_RANGE_INVALID',
        'El rango de recibos no es válido.',
      );
    const deliveryStatus =
      query.deliveryStatus === 'all'
        ? undefined
        : (query.deliveryStatus.toUpperCase() as SubscriptionPaymentReceiptDeliveryStatus);
    const where = {
      ...(deliveryStatus ? { deliveryStatus } : {}),
      ...(query.from || query.to
        ? {
            paidAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      organization: {
        deletedAt: null,
        ...(query.search
          ? {
              OR: [
                {
                  name: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  slug: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
    };
    const [total, receipts, summaryRows] = await Promise.all([
      database.subscriptionPaymentReceipt.count({ where }),
      database.subscriptionPaymentReceipt.findMany({
        orderBy: { paidAt: 'desc' },
        select: {
          attemptCount: true,
          createdAt: true,
          currencyCode: true,
          deliveryStatus: true,
          emailedAt: true,
          id: true,
          internalReference: true,
          lastAttemptAt: true,
          lastErrorCode: true,
          organization: {
            select: { defaultTimezone: true, id: true, name: true, slug: true },
          },
          organizationName: true,
          paidAt: true,
          paymentProvider: true,
          periodEndsAt: true,
          periodStartsAt: true,
          planCode: true,
          planName: true,
          providerTransactionId: true,
          recipientEmail: true,
          recipientName: true,
          receiptNumber: true,
          subscriptionInvoice: {
            select: {
              promotionCode: true,
              promotionDiscountCents: true,
              subtotalCents: true,
              taxCents: true,
            },
          },
          subscriptionPaymentAttempt: {
            select: { amountCents: true, id: true, status: true },
          },
          totalCents: true,
          updatedAt: true,
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      database.subscriptionPaymentReceipt.groupBy({
        _count: { _all: true },
        by: ['deliveryStatus'],
        where,
      }),
    ]);
    const summary = { failed: 0, pending: 0, sent: 0, total };
    for (const row of summaryRows) {
      summary[
        row.deliveryStatus.toLowerCase() as 'failed' | 'pending' | 'sent'
      ] = row._count._all;
    }
    return {
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      receipts: receipts.map((receipt) => ({
        createdAt: receipt.createdAt.toISOString(),
        currencyCode: receipt.currencyCode,
        delivery: {
          attemptCount: receipt.attemptCount,
          emailedAt: receipt.emailedAt?.toISOString() ?? null,
          lastAttemptAt: receipt.lastAttemptAt?.toISOString() ?? null,
          lastErrorCode: receipt.lastErrorCode,
          status: receipt.deliveryStatus.toLowerCase(),
          updatedAt: receipt.updatedAt.toISOString(),
        },
        id: receipt.id,
        pricing: {
          promotionCode: receipt.subscriptionInvoice.promotionCode,
          promotionDiscountCents:
            receipt.subscriptionInvoice.promotionDiscountCents,
          subtotalCents: receipt.subscriptionInvoice.subtotalCents,
          taxCents: receipt.subscriptionInvoice.taxCents,
        },
        organization: receipt.organization,
        organizationName: receipt.organizationName,
        paidAt: receipt.paidAt.toISOString(),
        payment: {
          amountCents: receipt.subscriptionPaymentAttempt.amountCents,
          id: receipt.subscriptionPaymentAttempt.id,
          internalReference: receipt.internalReference,
          provider: receipt.paymentProvider,
          providerTransactionId: receipt.providerTransactionId,
          status: receipt.subscriptionPaymentAttempt.status.toLowerCase(),
        },
        periodEndsAt: receipt.periodEndsAt.toISOString(),
        periodStartsAt: receipt.periodStartsAt.toISOString(),
        planCode: receipt.planCode,
        planName: receipt.planName,
        pdfPath: `/v1/platform/payment-receipts/${receipt.id}/pdf`,
        recipient: {
          email: receipt.recipientEmail,
          name: receipt.recipientName,
        },
        receiptNumber: receipt.receiptNumber,
        totalCents: receipt.totalCents,
      })),
      summary,
    };
  });

  app.get('/v1/platform/payment-receipts/:id/pdf', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_billing');
    const { id } = platformPaymentReceiptParamsSchema.parse(request.params);
    const receipt = await database.subscriptionPaymentReceipt.findFirst({
      select: { documentPdf: true, receiptNumber: true },
      where: { id, organization: { deletedAt: null } },
    });
    if (!receipt)
      throw new ApiError(
        404,
        'PLATFORM_PAYMENT_RECEIPT_NOT_FOUND',
        'El recibo de pago no existe.',
      );
    return reply
      .header(
        'Content-Disposition',
        `attachment; filename="${receipt.receiptNumber}.pdf"`,
      )
      .type('application/pdf')
      .send(receipt.documentPdf);
  });

  app.get('/v1/platform/organizations', async (request) => {
    await requirePlatformAdmin(database, authenticate, request, config);
    const query = platformOrganizationListSchema.parse(request.query);
    const now = new Date();
    const trialWindowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const subscriptionStatus =
      query.status === 'all'
        ? undefined
        : (query.status.toUpperCase() as SubscriptionStatus);
    const subscriptionWhere = {
      ...(subscriptionStatus ? { status: subscriptionStatus } : {}),
      ...(query.plan === 'all' ? {} : { plan: { code: query.plan } }),
      ...(query.trial === 'ending_soon'
        ? { trialEndsAt: { gte: now, lte: trialWindowEnd } }
        : query.trial === 'expired'
          ? { trialEndsAt: { lt: now } }
          : {}),
    };
    const hasSubscriptionFilters =
      query.status !== 'all' || query.plan !== 'all' || query.trial !== 'all';
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
      ...(hasSubscriptionFilters
        ? { subscription: { is: subscriptionWhere } }
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

  app.get('/v1/platform/organizations/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const { id } = platformOrganizationParamsSchema.parse(request.params);
    const organization = await database.organization.findFirst({
      include: {
        locations: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, isActive: true, name: true, timezone: true },
        },
        memberships: {
          include: {
            user: { select: { email: true, fullName: true, id: true } },
          },
          orderBy: { createdAt: 'asc' },
          where: { role: MembershipRole.OWNER },
        },
        payphoneConfiguration: {
          select: {
            connectionStatus: true,
            environment: true,
            isEnabled: true,
            lastErrorCode: true,
            lastTestedAt: true,
          },
        },
        subscription: { include: { plan: true } },
      },
      where: { deletedAt: null, id },
    });
    if (!organization) {
      throw new ApiError(
        404,
        'ORGANIZATION_NOT_FOUND',
        'La organización no existe.',
      );
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      usage,
      appointmentsByStatus,
      ordersByStatus,
      openCashRegisters,
      pendingSettlements,
      inventoryRows,
      notificationRows,
      recentAudit,
      supportCases,
      subscriptionHistory,
      commercialNotes,
    ] = await Promise.all([
      getSubscriptionUsage(database, id),
      database.appointment.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { createdAt: { gte: thirtyDaysAgo }, organizationId: id },
      }),
      database.productOrder.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { createdAt: { gte: thirtyDaysAgo }, organizationId: id },
      }),
      database.cashRegisterSession.count({
        where: { organizationId: id, status: CashRegisterStatus.OPEN },
      }),
      database.commissionSettlement.count({
        where: {
          organizationId: id,
          status: { in: ['DRAFT', 'APPROVED'] },
        },
      }),
      database.locationInventory.findMany({
        include: { product: { select: { minimumStock: true } } },
        where: { product: { isActive: true, organizationId: id } },
      }),
      database.appNotification.findMany({
        orderBy: { createdAt: 'desc' },
        select: { data: true },
        take: 200,
        where: { organizationId: id },
      }),
      database.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          action: true,
          actor: { select: { fullName: true } },
          createdAt: true,
          entityType: true,
          id: true,
        },
        take: 15,
        where: { organizationId: id },
      }),
      database.platformSupportCase.count({
        where: {
          organizationId: id,
          status: { not: PlatformSupportCaseStatus.CLOSED },
        },
      }),
      database.platformAuditLog.findMany({
        include: { actor: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        where: {
          action: {
            in: [
              'platform.organization.change_plan',
              'platform.organization.reactivate',
              'platform.organization.suspend',
              'platform.organization.extend_trial',
              'platform.organization.reduce_trial',
            ],
          },
          entityId: id,
        },
      }),
      database.platformOrganizationNote.findMany({
        include: { createdBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        where: { organizationId: id },
      }),
    ]);
    const owner = organization.memberships[0]?.user;
    return {
      activity: {
        appointmentsLast30Days: Object.fromEntries(
          appointmentsByStatus.map((row) => [
            row.status.toLowerCase(),
            row._count._all,
          ]),
        ),
        ordersLast30Days: Object.fromEntries(
          ordersByStatus.map((row) => [
            row.status.toLowerCase(),
            row._count._all,
          ]),
        ),
        recentAudit: recentAudit.map((entry) => ({
          ...entry,
          actor: entry.actor?.fullName ?? null,
          createdAt: entry.createdAt.toISOString(),
        })),
      },
      health: {
        lowStockItems: inventoryRows.filter(
          (row) =>
            row.quantityOnHand - row.quantityReserved <=
            row.product.minimumStock,
        ).length,
        notificationFailures: notificationRows.reduce(
          (total, row) => total + notificationDeliveryFailures(row.data).length,
          0,
        ),
        openCashRegisters,
        openSupportCases: supportCases,
        pendingCommissionSettlements: pendingSettlements,
      },
      notes: commercialNotes.map((note) => ({
        category: note.category,
        createdAt: note.createdAt.toISOString(),
        createdBy: note.createdBy?.fullName ?? 'Sistema',
        id: note.id,
        note: note.note,
      })),
      organization: {
        createdAt: organization.createdAt.toISOString(),
        currencyCode: organization.currencyCode,
        defaultTimezone: organization.defaultTimezone,
        id: organization.id,
        locations: organization.locations,
        name: organization.name,
        owner: owner
          ? {
              email: maskedEmail(owner.email),
              fullName: owner.fullName,
              id: owner.id,
            }
          : null,
        slug: organization.slug,
        status: organization.status.toLowerCase(),
      },
      payphone: organization.payphoneConfiguration
        ? {
            ...organization.payphoneConfiguration,
            connectionStatus:
              organization.payphoneConfiguration.connectionStatus.toLowerCase(),
            environment:
              organization.payphoneConfiguration.environment.toLowerCase(),
            lastTestedAt:
              organization.payphoneConfiguration.lastTestedAt?.toISOString() ??
              null,
          }
        : null,
      subscription: {
        currentPeriodEnd: usage.subscription.currentPeriodEnd.toISOString(),
        currentPeriodStart: usage.subscription.currentPeriodStart.toISOString(),
        effectiveBookingLimit: usage.effectiveBookingLimit,
        features: usage.featureFlags,
        graceEndsAt: usage.subscription.graceEndsAt?.toISOString() ?? null,
        history: subscriptionHistory.map((entry) => ({
          action: entry.action,
          actor: entry.actor?.fullName ?? 'Sistema',
          createdAt: entry.createdAt.toISOString(),
          id: entry.id,
          metadata: entry.metadata,
        })),
        limits: usage.limits,
        plan: usage.plan.code,
        status: usage.subscription.status.toLowerCase(),
        trialEndsAt: usage.subscription.trialEndsAt?.toISOString() ?? null,
        usage: usage.usage,
      },
    };
  });

  app.post('/v1/platform/organizations/:id/notes', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    const { id } = platformOrganizationParamsSchema.parse(request.params);
    const input = platformOrganizationNoteSchema.parse(request.body);
    requirePlatformPermission(
      operator.role,
      input.category === 'commercial' ? 'manage_billing' : 'support',
    );
    const organization = await database.organization.findFirst({
      select: { id: true },
      where: { deletedAt: null, id },
    });
    if (!organization)
      throw new ApiError(
        404,
        'ORGANIZATION_NOT_FOUND',
        'La organización no existe.',
      );
    const note = await database.platformOrganizationNote.create({
      data: {
        category: input.category,
        createdByUserId: operator.id,
        note: input.note,
        organizationId: id,
      },
    });
    await createPlatformAudit(database, {
      action: 'platform.organization.note_created',
      actorUserId: operator.id,
      afterData: { category: note.category },
      entityId: note.id,
      entityType: 'organization_note',
      metadata: { organizationId: id, reason: input.note },
    });
    return reply.code(201).send({ id: note.id });
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

  app.post('/v1/platform/notifications/:id/retry', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operations');
    const { id } = platformNotificationParamsSchema.parse(request.params);
    const input = platformNotificationRetrySchema.parse(request.body);
    const notification = await database.appNotification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new ApiError(
        404,
        'PLATFORM_NOTIFICATION_NOT_FOUND',
        'La notificación no existe.',
      );
    }
    const data =
      notification.data && typeof notification.data === 'object'
        ? (notification.data as Record<string, unknown>)
        : {};
    const delivery =
      data.delivery && typeof data.delivery === 'object'
        ? (data.delivery as Record<string, unknown>)
        : {};
    const attempt = delivery[input.channel];
    if (
      !attempt ||
      typeof attempt !== 'object' ||
      (attempt as { state?: unknown }).state !== 'failed'
    ) {
      throw new ApiError(
        409,
        'PLATFORM_NOTIFICATION_NOT_FAILED',
        'Ese canal no tiene una entrega fallida pendiente de reintento.',
      );
    }
    await database.appNotification.update({
      data: {
        data: {
          ...data,
          delivery: {
            ...delivery,
            [input.channel]: { attempts: 0, state: 'pending' },
          },
        } as never,
      },
      where: { id },
    });
    await createPlatformAudit(database, {
      action: 'platform.notification.retry_requested',
      actorUserId: operator.id,
      entityId: id,
      entityType: 'app_notification',
      metadata: {
        channel: input.channel,
        organizationId: notification.organizationId,
        reason: input.reason,
      },
    });
    return { id, queued: true };
  });

  app.get('/v1/platform/support-cases', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const query = platformCaseListSchema.parse(request.query);
    const cases = await database.platformSupportCase.findMany({
      include: {
        assignedTo: { select: { fullName: true, id: true } },
        createdBy: { select: { fullName: true, id: true } },
        events: {
          include: { actor: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        organization: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
      where: {
        ...(query.organizationId
          ? { organizationId: query.organizationId }
          : {}),
        ...(query.status === 'all'
          ? {}
          : {
              status: query.status.toUpperCase() as PlatformSupportCaseStatus,
            }),
      },
    });
    const supportOperators = await database.platformOperator.findMany({
      include: { user: { select: { fullName: true, id: true } } },
      orderBy: { user: { fullName: 'asc' } },
      where: {
        isActive: true,
        role: {
          in: [
            PlatformOperatorRole.SUPER_ADMIN,
            PlatformOperatorRole.OPERATIONS,
            PlatformOperatorRole.SUPPORT,
          ],
        },
      },
    });
    const now = new Date();
    return {
      cases: cases.map((supportCase) => ({
        ...supportCase,
        createdAt: supportCase.createdAt.toISOString(),
        events: supportCase.events.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
        priority: supportCase.priority.toLowerCase(),
        sla: supportCase.slaDueAt
          ? (() => {
              const reference = supportCase.closedAt ?? now;
              const differenceMinutes = Math.round(
                (supportCase.slaDueAt.getTime() - reference.getTime()) / 60_000,
              );
              return {
                breachedByMinutes: Math.max(0, -differenceMinutes),
                remainingMinutes: Math.max(0, differenceMinutes),
                state:
                  differenceMinutes < 0
                    ? 'breached'
                    : supportCase.closedAt
                      ? 'met'
                      : 'running',
              };
            })()
          : { breachedByMinutes: 0, remainingMinutes: 0, state: 'no_due' },
        slaDueAt: supportCase.slaDueAt?.toISOString() ?? null,
        status: supportCase.status.toLowerCase(),
        updatedAt: supportCase.updatedAt.toISOString(),
      })),
      operators: supportOperators.map(({ user }) => user),
      summary: {
        breached: cases.filter(
          ({ closedAt, slaDueAt }) =>
            slaDueAt !== null && (closedAt ?? now) > slaDueAt,
        ).length,
        open: cases.filter(
          ({ status }) => status !== PlatformSupportCaseStatus.CLOSED,
        ).length,
      },
    };
  });

  app.post('/v1/platform/support-cases', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const input = platformCaseCreateSchema.parse(request.body);
    const organization = await database.organization.findFirst({
      where: { deletedAt: null, id: input.organizationId },
    });
    if (!organization) {
      throw new ApiError(
        404,
        'ORGANIZATION_NOT_FOUND',
        'La organización no existe.',
      );
    }
    const defaultSlaHours = await publishedPlatformNumber(
      database,
      'support.default_sla_hours',
      'hours',
      24,
    );
    const supportCase = await database.platformSupportCase.create({
      data: {
        assignedToUserId: operator.id,
        category: input.category,
        createdByUserId: operator.id,
        description: input.description,
        organizationId: input.organizationId,
        priority: input.priority.toUpperCase() as PlatformSupportCasePriority,
        slaDueAt: input.slaDueAt
          ? new Date(input.slaDueAt)
          : new Date(Date.now() + defaultSlaHours * 60 * 60 * 1000),
        title: input.title,
        events: {
          create: {
            actorUserId: operator.id,
            note: input.description,
            type: 'created',
          },
        },
      },
    });
    await createPlatformAudit(database, {
      action: 'platform.support_case.created',
      actorUserId: operator.id,
      afterData: { priority: supportCase.priority, status: supportCase.status },
      entityId: supportCase.id,
      entityType: 'support_case',
      metadata: { organizationId: input.organizationId },
    });
    return reply.code(201).send({ id: supportCase.id });
  });

  app.patch('/v1/platform/support-cases/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const { id } = platformCaseParamsSchema.parse(request.params);
    const input = platformCaseUpdateSchema.parse(request.body);
    const before = await database.platformSupportCase.findUnique({
      where: { id },
    });
    if (!before) {
      throw new ApiError(
        404,
        'PLATFORM_SUPPORT_CASE_NOT_FOUND',
        'La incidencia no existe.',
      );
    }
    if (input.assignedToUserId) {
      const assignee = await database.platformOperator.findUnique({
        where: { userId: input.assignedToUserId },
      });
      if (!assignee?.isActive) {
        throw new ApiError(
          400,
          'PLATFORM_ASSIGNEE_INVALID',
          'El responsable no es un operador activo.',
        );
      }
    }
    const status = input.status
      ? (input.status.toUpperCase() as PlatformSupportCaseStatus)
      : before.status;
    const saved = await database.$transaction(async (transaction) => {
      const updated = await transaction.platformSupportCase.update({
        data: {
          ...(input.assignedToUserId !== undefined
            ? { assignedToUserId: input.assignedToUserId }
            : {}),
          ...(input.priority
            ? {
                priority:
                  input.priority.toUpperCase() as PlatformSupportCasePriority,
              }
            : {}),
          ...(input.status ? { status } : {}),
          ...(input.slaDueAt !== undefined
            ? {
                slaDueAt: input.slaDueAt ? new Date(input.slaDueAt) : null,
              }
            : {}),
          closedAt:
            status === PlatformSupportCaseStatus.CLOSED
              ? (before.closedAt ?? new Date())
              : null,
        },
        where: { id },
      });
      await transaction.platformSupportCaseEvent.create({
        data: {
          actorUserId: operator.id,
          caseId: id,
          metadata: {
            assignedToUserId: input.assignedToUserId,
            priority: input.priority,
            slaDueAt: input.slaDueAt,
            status: input.status,
          },
          note: input.note,
          type: input.status ? 'status_changed' : 'note_added',
        },
      });
      return updated;
    });
    await createPlatformAudit(database, {
      action: 'platform.support_case.updated',
      actorUserId: operator.id,
      afterData: {
        assignedToUserId: saved.assignedToUserId,
        priority: saved.priority,
        slaDueAt: saved.slaDueAt,
        status: saved.status,
      },
      beforeData: {
        assignedToUserId: before.assignedToUserId,
        priority: before.priority,
        slaDueAt: before.slaDueAt,
        status: before.status,
      },
      entityId: saved.id,
      entityType: 'support_case',
      metadata: { organizationId: saved.organizationId },
    });
    return { id: saved.id, status: saved.status.toLowerCase() };
  });

  app.get('/v1/platform/alerts', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformAlertListSchema.parse(request.query);
    await refreshPlatformAlerts(database);
    const alerts = await database.platformAlert.findMany({
      include: { organization: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { occurredAt: 'desc' }],
      take: 200,
      where: {
        ...(query.organizationId
          ? { organizationId: query.organizationId }
          : {}),
        ...(query.status === 'all'
          ? {}
          : { status: query.status.toUpperCase() as PlatformAlertStatus }),
      },
    });
    return {
      alerts: alerts.map((alert) => ({
        ...alert,
        actedAt: alert.actedAt?.toISOString() ?? null,
        occurredAt: alert.occurredAt.toISOString(),
        status: alert.status.toLowerCase(),
      })),
    };
  });

  app.patch('/v1/platform/alerts/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operations');
    const { id } = platformAlertParamsSchema.parse(request.params);
    const input = platformAlertActionSchema.parse(request.body);
    const before = await database.platformAlert.findUnique({ where: { id } });
    if (!before) {
      throw new ApiError(
        404,
        'PLATFORM_ALERT_NOT_FOUND',
        'La alerta no existe.',
      );
    }
    const saved = await database.platformAlert.update({
      data: {
        actedAt: new Date(),
        actedByUserId: operator.id,
        resolutionNote: input.note,
        status: input.status.toUpperCase() as PlatformAlertStatus,
      },
      where: { id },
    });
    await createPlatformAudit(database, {
      action: `platform.alert.${input.status}`,
      actorUserId: operator.id,
      afterData: { status: saved.status },
      beforeData: { status: before.status },
      entityId: saved.id,
      entityType: 'platform_alert',
      metadata: { organizationId: saved.organizationId, reason: input.note },
    });
    return { id: saved.id, status: saved.status.toLowerCase() };
  });

  app.get('/v1/platform/system-health', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const now = new Date();
    const [databaseProbe, pendingNotifications, openCases, openAlerts] =
      await Promise.all([
        database.organization.count(),
        database.appNotification.findMany({
          orderBy: { createdAt: 'desc' },
          select: { data: true },
          take: 500,
        }),
        database.platformSupportCase.count({
          where: { status: { not: PlatformSupportCaseStatus.CLOSED } },
        }),
        database.platformAlert.count({
          where: { status: PlatformAlertStatus.OPEN },
        }),
      ]);
    return {
      checkedAt: now.toISOString(),
      components: {
        api: { status: 'operational' },
        database: { organizations: databaseProbe, status: 'operational' },
        notifications: {
          failures: pendingNotifications.reduce(
            (total, row) =>
              total + notificationDeliveryFailures(row.data).length,
            0,
          ),
          status: 'observed',
        },
      },
      openAlerts,
      openSupportCases: openCases,
    };
  });

  app.get('/v1/platform/bookings', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformOperationalListSchema.parse(request.query);
    const where = query.organizationId
      ? { organizationId: query.organizationId }
      : {};
    const [total, appointments] = await Promise.all([
      database.appointment.count({ where }),
      database.appointment.findMany({
        include: {
          location: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { startsAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    return {
      bookings: appointments.map((appointment) => ({
        createdAt: appointment.createdAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        id: appointment.id,
        location: appointment.location,
        organization: appointment.organization,
        paymentStatus: appointment.paymentStatus.toLowerCase(),
        source: appointment.source.toLowerCase(),
        startsAt: appointment.startsAt.toISOString(),
        status: appointment.status.toLowerCase(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/v1/platform/orders', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformOperationalListSchema.parse(request.query);
    const where = query.organizationId
      ? { organizationId: query.organizationId }
      : {};
    const [total, orders] = await Promise.all([
      database.productOrder.count({ where }),
      database.productOrder.findMany({
        include: {
          location: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    return {
      orders: orders.map((order) => ({
        createdAt: order.createdAt.toISOString(),
        currencyCode: order.currencyCode,
        expiresAt: order.expiresAt.toISOString(),
        id: order.id,
        location: order.location,
        organization: order.organization,
        paymentMethod: order.paymentMethod.toLowerCase(),
        status: order.status.toLowerCase(),
        totalCents: order.totalCents,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/v1/platform/cash-health', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformOperationalListSchema.parse(request.query);
    const where = query.organizationId
      ? { organizationId: query.organizationId }
      : {};
    const [total, sessions] = await Promise.all([
      database.cashRegisterSession.count({ where }),
      database.cashRegisterSession.findMany({
        orderBy: { openedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    const organizationIds = sessions.flatMap((session) =>
      session.organizationId ? [session.organizationId] : [],
    );
    const organizations = await database.organization.findMany({
      select: { id: true, name: true },
      where: { id: { in: organizationIds } },
    });
    const names = new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
    return {
      sessions: sessions.map((session) => ({
        closedAt: session.closedAt?.toISOString() ?? null,
        differenceCents: session.differenceCents,
        expectedAmountCents: session.expectedAmountCents,
        id: session.id,
        openedAt: session.openedAt.toISOString(),
        organization: session.organizationId
          ? {
              id: session.organizationId,
              name: names.get(session.organizationId) ?? 'Organización',
            }
          : null,
        status: session.status.toLowerCase(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/v1/platform/commissions-health', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformOperationalListSchema.parse(request.query);
    const where = query.organizationId
      ? { organizationId: query.organizationId }
      : {};
    const [total, settlements] = await Promise.all([
      database.commissionSettlement.count({ where }),
      database.commissionSettlement.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    const organizations = await database.organization.findMany({
      select: { id: true, name: true },
      where: {
        id: { in: settlements.map((settlement) => settlement.organizationId) },
      },
    });
    const names = new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
    return {
      settlements: settlements.map((settlement) => ({
        commissionAmountCents: settlement.commissionAmountCents,
        createdAt: settlement.createdAt.toISOString(),
        id: settlement.id,
        organization: {
          id: settlement.organizationId,
          name: names.get(settlement.organizationId) ?? 'Organización',
        },
        periodEnd: settlement.periodEnd.toISOString(),
        periodStart: settlement.periodStart.toISOString(),
        status: settlement.status.toLowerCase(),
        totalPayableCents: settlement.totalPayableCents,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/v1/platform/inventory-health', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformOperationalListSchema.parse(request.query);
    const where = query.organizationId
      ? { product: { isActive: true, organizationId: query.organizationId } }
      : { product: { isActive: true } };
    const [total, rows] = await Promise.all([
      database.locationInventory.count({ where }),
      database.locationInventory.findMany({
        include: {
          location: { select: { id: true, name: true } },
          product: {
            select: {
              id: true,
              minimumStock: true,
              name: true,
              organization: { select: { id: true, name: true } },
              sku: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
    ]);
    return {
      inventory: rows.map((row) => ({
        available: row.quantityOnHand - row.quantityReserved,
        location: row.location,
        lowStock:
          row.quantityOnHand - row.quantityReserved <= row.product.minimumStock,
        minimumStock: row.product.minimumStock,
        organization: row.product.organization,
        product: {
          id: row.product.id,
          name: row.product.name,
          sku: row.product.sku,
        },
        quantityOnHand: row.quantityOnHand,
        quantityReserved: row.quantityReserved,
        updatedAt: row.updatedAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/v1/platform/payphone-health', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformOperationalListSchema.parse(request.query);
    const configurations = await database.payphoneConfiguration.findMany({
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      where: query.organizationId
        ? { organizationId: query.organizationId }
        : {},
    });
    const total = await database.payphoneConfiguration.count({
      where: query.organizationId
        ? { organizationId: query.organizationId }
        : {},
    });
    return {
      configurations: configurations.map((configuration) => ({
        connectionStatus: configuration.connectionStatus.toLowerCase(),
        environment: configuration.environment.toLowerCase(),
        id: configuration.id,
        isEnabled: configuration.isEnabled,
        lastErrorCode: configuration.lastErrorCode,
        lastTestedAt: configuration.lastTestedAt?.toISOString() ?? null,
        organization: configuration.organization,
        updatedAt: configuration.updatedAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/v1/platform/exports/audit.csv', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'export');
    const query = platformAuditExportSchema.parse(request.query);
    const exportRetentionDays = await publishedPlatformNumber(
      database,
      'exports.retention_days',
      'days',
      7,
    );
    await database.platformExport.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const from = new Date(query.from);
    const to = new Date(query.to);
    const maximumRangeMs = 31 * 24 * 60 * 60 * 1000;
    if (to <= from || to.getTime() - from.getTime() > maximumRangeMs) {
      throw new ApiError(
        400,
        'PLATFORM_EXPORT_RANGE_INVALID',
        'La exportación debe cubrir un periodo mayor a cero y de hasta 31 días.',
      );
    }
    const logs = await database.platformAuditLog.findMany({
      include: { actor: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5_000,
      where: {
        createdAt: { gte: from, lte: to },
        ...(query.organizationId
          ? {
              metadata: {
                path: ['organizationId'],
                equals: query.organizationId,
              },
            }
          : {}),
      },
    });
    const organizationIds = logs.flatMap((log) => {
      const metadata = log.metadata as { organizationId?: unknown };
      return typeof metadata.organizationId === 'string'
        ? [metadata.organizationId]
        : [];
    });
    const organizations = await database.organization.findMany({
      select: { id: true, name: true },
      where: { id: { in: organizationIds } },
    });
    const organizationNames = new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
    const rows = logs.map((log) => {
      const metadata = log.metadata as {
        organizationId?: unknown;
        reason?: unknown;
      };
      const organizationId =
        typeof metadata.organizationId === 'string'
          ? metadata.organizationId
          : null;
      return [
        log.createdAt.toISOString(),
        log.action,
        log.entityType,
        log.entityId,
        log.actor?.fullName ?? 'Sistema',
        log.actor?.email ?? '',
        organizationId
          ? (organizationNames.get(organizationId) ?? organizationId)
          : 'Plataforma Nava',
        typeof metadata.reason === 'string' ? metadata.reason : '',
      ]
        .map(csvCell)
        .join(',');
    });
    const exportRecord = await database.platformExport.create({
      data: {
        expiresAt: new Date(
          Date.now() + exportRetentionDays * 24 * 60 * 60 * 1000,
        ),
        filters: {
          from: from.toISOString(),
          organizationId: query.organizationId ?? null,
          to: to.toISOString(),
        },
        format: 'csv',
        requestedByUserId: operator.id,
        rowCount: logs.length,
        type: 'platform_audit',
      },
    });
    await createPlatformAudit(database, {
      action: 'platform.export.downloaded',
      actorUserId: operator.id,
      entityId: exportRecord.id,
      entityType: 'platform_export',
      metadata: {
        from: from.toISOString(),
        organizationId: query.organizationId ?? null,
        rowCount: logs.length,
        to: to.toISOString(),
      },
    });
    const csv = [
      'fecha,accion,entidad,entidad_id,operador,correo_operador,organizacion,motivo',
      ...rows,
    ].join('\r\n');
    return reply
      .header('cache-control', 'no-store')
      .header(
        'content-disposition',
        `attachment; filename="nava-auditoria-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`,
      )
      .type('text/csv; charset=utf-8')
      .send(`\uFEFF${csv}`);
  });

  app.get('/v1/platform/privacy-requests', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const query = platformPrivacyListSchema.parse(request.query);
    const requests = await database.platformPrivacyRequest.findMany({
      include: {
        assignedTo: { select: { fullName: true, id: true } },
        organization: { select: { id: true, name: true } },
        subject: { select: { email: true, fullName: true, id: true } },
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      where:
        query.status === 'all'
          ? {}
          : {
              status:
                query.status.toUpperCase() as PlatformPrivacyRequestStatus,
            },
    });
    return {
      requests: requests.map((privacyRequest) => ({
        assignedTo: privacyRequest.assignedTo,
        completedAt: privacyRequest.completedAt?.toISOString() ?? null,
        createdAt: privacyRequest.createdAt.toISOString(),
        dueAt: privacyRequest.dueAt?.toISOString() ?? null,
        id: privacyRequest.id,
        organization: privacyRequest.organization,
        reason: privacyRequest.reason,
        resolutionNote: privacyRequest.resolutionNote,
        status: privacyRequest.status.toLowerCase(),
        subject: privacyRequest.subject
          ? {
              email: maskedEmail(privacyRequest.subject.email),
              fullName: maskedName(privacyRequest.subject.fullName),
              id: privacyRequest.subject.id,
            }
          : null,
        type: privacyRequest.type.toLowerCase(),
      })),
    };
  });

  app.post('/v1/platform/privacy-requests', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const input = platformPrivacyCreateSchema.parse(request.body);
    const [organization, subject] = await Promise.all([
      input.organizationId
        ? database.organization.findFirst({
            select: { id: true },
            where: { deletedAt: null, id: input.organizationId },
          })
        : null,
      input.subjectUserId
        ? database.user.findFirst({
            select: { id: true },
            where: { deletedAt: null, id: input.subjectUserId },
          })
        : null,
    ]);
    if (input.organizationId && !organization)
      throw new ApiError(
        404,
        'ORGANIZATION_NOT_FOUND',
        'La organización no existe.',
      );
    if (input.subjectUserId && !subject)
      throw new ApiError(
        404,
        'PRIVACY_SUBJECT_NOT_FOUND',
        'La persona solicitante no existe.',
      );
    const saved = await database.platformPrivacyRequest.create({
      data: {
        assignedToUserId: operator.id,
        createdByUserId: operator.id,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        organizationId: input.organizationId ?? null,
        reason: input.reason,
        subjectUserId: input.subjectUserId ?? null,
        type: input.type.toUpperCase() as PlatformPrivacyRequestType,
      },
    });
    await createPlatformAudit(database, {
      action: 'platform.privacy_request.created',
      actorUserId: operator.id,
      afterData: { status: saved.status, type: saved.type },
      entityId: saved.id,
      entityType: 'privacy_request',
      metadata: { organizationId: saved.organizationId, reason: input.reason },
    });
    return reply.code(201).send({ id: saved.id });
  });

  app.patch('/v1/platform/privacy-requests/:id', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const { id } = platformPrivacyParamsSchema.parse(request.params);
    const input = platformPrivacyUpdateSchema.parse(request.body);
    const before = await database.platformPrivacyRequest.findUnique({
      where: { id },
    });
    if (!before)
      throw new ApiError(
        404,
        'PRIVACY_REQUEST_NOT_FOUND',
        'La solicitud de privacidad no existe.',
      );
    const saved = await database.platformPrivacyRequest.update({
      data: {
        assignedToUserId:
          input.assignedToUserId === undefined
            ? before.assignedToUserId
            : input.assignedToUserId,
        completedAt: ['completed', 'rejected'].includes(input.status)
          ? (before.completedAt ?? new Date())
          : null,
        resolutionNote: input.resolutionNote,
        status: input.status.toUpperCase() as PlatformPrivacyRequestStatus,
      },
      where: { id },
    });
    await createPlatformAudit(database, {
      action: 'platform.privacy_request.updated',
      actorUserId: operator.id,
      afterData: {
        assignedToUserId: saved.assignedToUserId,
        status: saved.status,
      },
      beforeData: {
        assignedToUserId: before.assignedToUserId,
        status: before.status,
      },
      entityId: id,
      entityType: 'privacy_request',
      metadata: {
        organizationId: saved.organizationId,
        reason: input.resolutionNote,
      },
    });
    return { id, status: saved.status.toLowerCase() };
  });

  app.get('/v1/platform/overrides', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_billing');
    const query = platformOverrideListSchema.parse(request.query);
    const overrides = await database.platformFeatureOverride.findMany({
      include: {
        createdBy: { select: { fullName: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      where: query.organizationId
        ? { organizationId: query.organizationId }
        : {},
    });
    return {
      overrides: overrides.map((override) => ({
        booleanValue: override.booleanValue,
        createdAt: override.createdAt.toISOString(),
        createdBy: override.createdBy,
        expiresAt: override.expiresAt.toISOString(),
        id: override.id,
        integerValue: override.integerValue,
        key: override.key,
        kind: override.kind.toLowerCase(),
        organization: override.organization,
        reason: override.reason,
        revokedAt: override.revokedAt?.toISOString() ?? null,
      })),
    };
  });

  app.post('/v1/platform/overrides', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_billing');
    const input = platformOverrideCreateSchema.parse(request.body);
    if (
      input.kind === 'limit' &&
      input.key === 'locations' &&
      input.integerValue === null
    )
      throw new ApiError(
        400,
        'PLATFORM_OVERRIDE_VALUE_INVALID',
        'El límite de sucursales debe ser un número.',
      );
    const now = new Date();
    const expiresAt = new Date(input.expiresAt);
    const maximum = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    if (expiresAt <= now || expiresAt > maximum)
      throw new ApiError(
        400,
        'PLATFORM_OVERRIDE_EXPIRATION_INVALID',
        'La excepción debe vencer dentro de los próximos 90 días.',
      );
    const organization = await database.organization.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: input.organizationId },
    });
    if (!organization)
      throw new ApiError(
        404,
        'ORGANIZATION_NOT_FOUND',
        'La organización no existe.',
      );
    const saved = await database.$transaction(async (transaction) => {
      await transaction.platformFeatureOverride.updateMany({
        data: { revokedAt: now, revokedByUserId: operator.id },
        where: {
          expiresAt: { gt: now },
          key: input.key,
          organizationId: input.organizationId,
          revokedAt: null,
        },
      });
      return transaction.platformFeatureOverride.create({
        data: {
          booleanValue: input.kind === 'feature' ? input.booleanValue : null,
          createdByUserId: operator.id,
          expiresAt,
          integerValue: input.kind === 'limit' ? input.integerValue : null,
          key: input.key,
          kind: input.kind.toUpperCase() as PlatformOverrideKind,
          organizationId: input.organizationId,
          reason: input.reason,
        },
      });
    });
    await createPlatformAudit(database, {
      action: 'platform.override.created',
      actorUserId: operator.id,
      afterData: {
        booleanValue: saved.booleanValue,
        expiresAt: saved.expiresAt,
        integerValue: saved.integerValue,
        key: saved.key,
        kind: saved.kind,
      },
      entityId: saved.id,
      entityType: 'feature_override',
      metadata: { organizationId: saved.organizationId, reason: saved.reason },
    });
    return reply.code(201).send({ id: saved.id });
  });

  app.post('/v1/platform/overrides/:id/revoke', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_billing');
    const { id } = platformOverrideParamsSchema.parse(request.params);
    const input = platformOverrideRevokeSchema.parse(request.body);
    const before = await database.platformFeatureOverride.findUnique({
      where: { id },
    });
    if (!before)
      throw new ApiError(
        404,
        'PLATFORM_OVERRIDE_NOT_FOUND',
        'La excepción no existe.',
      );
    const revokedAt = before.revokedAt ?? new Date();
    const saved = await database.platformFeatureOverride.update({
      data: { revokedAt, revokedByUserId: operator.id },
      where: { id },
    });
    await createPlatformAudit(database, {
      action: 'platform.override.revoked',
      actorUserId: operator.id,
      afterData: { revokedAt },
      beforeData: { revokedAt: before.revokedAt },
      entityId: id,
      entityType: 'feature_override',
      metadata: { organizationId: saved.organizationId, reason: input.reason },
    });
    return { id, revokedAt: revokedAt.toISOString() };
  });

  app.get('/v1/platform/onboarding', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const abandonedHours = await publishedPlatformNumber(
      database,
      'onboarding.abandoned_hours',
      'hours',
      24,
    );
    const abandonedBefore = new Date(
      Date.now() - abandonedHours * 60 * 60 * 1000,
    );
    const [profiles, pendingRegistrations] = await Promise.all([
      database.userRegistrationProfile.findMany({
        include: {
          user: {
            include: {
              memberships: {
                include: {
                  organization: {
                    select: {
                      _count: {
                        select: {
                          appointments: true,
                          locations: true,
                          memberships: true,
                          services: true,
                        },
                      },
                      id: true,
                      name: true,
                    },
                  },
                },
                take: 1,
                where: { role: MembershipRole.OWNER },
              },
              _count: {
                select: {
                  onboardingCollaborators: true,
                  onboardingServices: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      database.pendingRegistration.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          email: true,
          expiresAt: true,
          failedAttempts: true,
          id: true,
          lockedUntil: true,
        },
        take: 100,
      }),
    ]);
    const mappedProfiles = profiles.map((profile) => {
      const organization = profile.user.memberships[0]?.organization ?? null;
      const stages = {
        account: true,
        businessProfile: true,
        location: (organization?._count.locations ?? 0) > 0,
        service:
          (organization?._count.services ?? 0) > 0 ||
          profile.user._count.onboardingServices > 0,
        team:
          (organization?._count.memberships ?? 0) > 1 ||
          profile.user._count.onboardingCollaborators > 0,
      };
      const completedStages = Object.values(stages).filter(Boolean).length;
      const completed = profile.onboardingCompletedAt !== null;
      return {
        abandoned: !completed && profile.updatedAt < abandonedBefore,
        accountType: profile.accountType.toLowerCase(),
        appointments: organization?._count.appointments ?? 0,
        businessName: profile.businessName,
        collaborators: profile.user._count.onboardingCollaborators,
        completedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        organization: organization
          ? { id: organization.id, name: organization.name }
          : null,
        owner: {
          email: maskedEmail(profile.user.email),
          fullName: maskedName(profile.user.fullName),
        },
        progressPercent: completed
          ? 100
          : Math.round((completedStages / Object.keys(stages).length) * 100),
        services: profile.user._count.onboardingServices,
        stages,
        updatedAt: profile.updatedAt.toISOString(),
        userId: profile.userId,
      };
    });
    return {
      abandonedAfterHours: abandonedHours,
      pendingRegistrations: pendingRegistrations.map((registration) => ({
        abandoned: registration.createdAt < abandonedBefore,
        createdAt: registration.createdAt.toISOString(),
        email: maskedEmail(registration.email),
        expired: registration.expiresAt < new Date(),
        failedAttempts: registration.failedAttempts,
        id: registration.id,
        locked: Boolean(
          registration.lockedUntil && registration.lockedUntil > new Date(),
        ),
      })),
      profiles: mappedProfiles,
      summary: {
        abandoned: mappedProfiles.filter(({ abandoned }) => abandoned).length,
        completed: mappedProfiles.filter(({ completedAt }) => completedAt)
          .length,
        pending: mappedProfiles.filter(({ completedAt }) => !completedAt)
          .length,
        pendingVerification: pendingRegistrations.length,
      },
    };
  });

  app.post(
    '/v1/platform/onboarding/pending/:id/resend-verification',
    async (request) => {
      const operator = await requirePlatformAdmin(
        database,
        authenticate,
        request,
        config,
      );
      requirePlatformPermission(operator.role, 'support');
      const { id } = platformPendingRegistrationParamsSchema.parse(
        request.params,
      );
      const input = platformVerificationResendSchema.parse(request.body);
      const pendingRegistration = await database.pendingRegistration.findUnique(
        {
          select: { id: true, lockedUntil: true },
          where: { id },
        },
      );
      if (!pendingRegistration)
        throw new ApiError(
          404,
          'PENDING_REGISTRATION_NOT_FOUND',
          'El registro pendiente ya no existe.',
        );
      if (
        pendingRegistration.lockedUntil &&
        pendingRegistration.lockedUntil > new Date()
      )
        throw new ApiError(
          423,
          'PENDING_REGISTRATION_LOCKED',
          'El registro está bloqueado temporalmente y no admite reenvíos.',
        );
      const recentResends = await database.platformAuditLog.count({
        where: {
          action: 'platform.onboarding.verification_resent',
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          entityId: id,
        },
      });
      if (recentResends >= 3)
        throw new ApiError(
          429,
          'PLATFORM_VERIFICATION_RESEND_RATE_LIMITED',
          'Se alcanzó el máximo de 3 reenvíos por hora para este registro.',
        );
      const verification = await resendPendingVerification(id);
      await createPlatformAudit(database, {
        action: 'platform.onboarding.verification_resent',
        actorUserId: operator.id,
        entityId: id,
        entityType: 'pending_registration',
        metadata: { reason: input.reason },
      });
      return {
        id,
        verificationExpiresAt: verification.verificationExpiresAt,
      };
    },
  );

  app.get('/v1/platform/reviews', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const reviews = await database.appointmentReview.findMany({
      include: {
        location: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      reviews: reviews.map((review) => ({
        client: maskedName(review.clientName),
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        id: review.id,
        isVisible: review.isVisible,
        location: review.location,
        organization: review.organization,
        rating: review.rating,
      })),
    };
  });

  app.patch('/v1/platform/reviews/:id/visibility', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'support');
    const { id } = platformReviewParamsSchema.parse(request.params);
    const input = platformReviewActionSchema.parse(request.body);
    const before = await database.appointmentReview.findUnique({
      where: { id },
    });
    if (!before)
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'La reseña no existe.');
    const saved = await database.appointmentReview.update({
      data: {
        hiddenAt: input.isVisible ? null : new Date(),
        hiddenByUserId: input.isVisible ? null : operator.id,
        isVisible: input.isVisible,
      },
      where: { id },
    });
    await createPlatformAudit(database, {
      action: input.isVisible
        ? 'platform.review.restored'
        : 'platform.review.hidden',
      actorUserId: operator.id,
      afterData: { isVisible: saved.isVisible },
      beforeData: { isVisible: before.isVisible },
      entityId: id,
      entityType: 'appointment_review',
      metadata: { organizationId: saved.organizationId, reason: input.reason },
    });
    return { id, isVisible: saved.isVisible };
  });

  app.get('/v1/platform/configurations', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operators');
    const configurations = await database.platformConfigurationVersion.findMany(
      {
        include: {
          approvedBy: { select: { fullName: true } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: [{ key: 'asc' }, { version: 'desc' }],
        take: 300,
      },
    );
    return {
      allowedKeys: PLATFORM_CONFIGURATION_KEYS,
      configurations: configurations.map((configuration) => ({
        approvedBy: configuration.approvedBy?.fullName ?? null,
        createdAt: configuration.createdAt.toISOString(),
        createdBy: configuration.createdBy?.fullName ?? 'Sistema',
        id: configuration.id,
        key: configuration.key,
        publishedAt: configuration.publishedAt?.toISOString() ?? null,
        reason: configuration.reason,
        rollbackOfVersionId: configuration.rollbackOfVersionId,
        status: configuration.status.toLowerCase(),
        value: configuration.value,
        version: configuration.version,
      })),
    };
  });

  app.post('/v1/platform/configurations', async (request, reply) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operators');
    const input = platformConfigurationCreateSchema.parse(request.body);
    const saved = await database.$transaction(async (transaction) => {
      const latest = await transaction.platformConfigurationVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
        where: { key: input.key },
      });
      return transaction.platformConfigurationVersion.create({
        data: {
          createdByUserId: operator.id,
          key: input.key,
          reason: input.reason,
          value: input.value,
          version: (latest?.version ?? 0) + 1,
        },
      });
    });
    await createPlatformAudit(database, {
      action: 'platform.configuration.draft_created',
      actorUserId: operator.id,
      afterData: { key: saved.key, value: saved.value, version: saved.version },
      entityId: saved.id,
      entityType: 'platform_configuration',
      metadata: { reason: saved.reason },
    });
    return reply.code(201).send({ id: saved.id, version: saved.version });
  });

  app.post('/v1/platform/configurations/:id/publish', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operators');
    const { id } = platformConfigurationParamsSchema.parse(request.params);
    const input = platformConfigurationActionSchema.parse(request.body);
    const target = await database.platformConfigurationVersion.findUnique({
      where: { id },
    });
    if (!target)
      throw new ApiError(
        404,
        'PLATFORM_CONFIGURATION_NOT_FOUND',
        'La versión de configuración no existe.',
      );
    if (target.status !== PlatformConfigurationStatus.DRAFT)
      throw new ApiError(
        409,
        'PLATFORM_CONFIGURATION_NOT_DRAFT',
        'Solo se puede publicar una versión en borrador.',
      );
    if (target.createdByUserId === operator.id)
      throw new ApiError(
        409,
        'PLATFORM_CONFIGURATION_APPROVAL_REQUIRED',
        'Otro superadministrador debe aprobar este borrador.',
      );
    const published = await database.$transaction(async (transaction) => {
      await transaction.platformConfigurationVersion.updateMany({
        data: { status: PlatformConfigurationStatus.ARCHIVED },
        where: {
          key: target.key,
          status: PlatformConfigurationStatus.PUBLISHED,
        },
      });
      return transaction.platformConfigurationVersion.update({
        data: {
          approvedByUserId: operator.id,
          publishedAt: new Date(),
          reason: `${target.reason}\nAprobación: ${input.reason}`,
          status: PlatformConfigurationStatus.PUBLISHED,
        },
        where: { id },
      });
    });
    await createPlatformAudit(database, {
      action: 'platform.configuration.published',
      actorUserId: operator.id,
      afterData: { key: published.key, version: published.version },
      beforeData: { status: target.status },
      entityId: id,
      entityType: 'platform_configuration',
      metadata: { reason: input.reason },
    });
    return { id, status: published.status.toLowerCase() };
  });

  app.post('/v1/platform/configurations/:id/rollback', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'manage_operators');
    const { id } = platformConfigurationParamsSchema.parse(request.params);
    const input = platformConfigurationActionSchema.parse(request.body);
    const target = await database.platformConfigurationVersion.findUnique({
      where: { id },
    });
    if (!target || target.status === PlatformConfigurationStatus.DRAFT)
      throw new ApiError(
        409,
        'PLATFORM_CONFIGURATION_ROLLBACK_INVALID',
        'Solo se puede restaurar una versión publicada anteriormente.',
      );
    const rolledBack = await database.$transaction(async (transaction) => {
      const latest = await transaction.platformConfigurationVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
        where: { key: target.key },
      });
      await transaction.platformConfigurationVersion.updateMany({
        data: { status: PlatformConfigurationStatus.ARCHIVED },
        where: {
          key: target.key,
          status: PlatformConfigurationStatus.PUBLISHED,
        },
      });
      return transaction.platformConfigurationVersion.create({
        data: {
          approvedByUserId: operator.id,
          createdByUserId: operator.id,
          key: target.key,
          publishedAt: new Date(),
          reason: input.reason,
          rollbackOfVersionId: target.id,
          status: PlatformConfigurationStatus.PUBLISHED,
          value: target.value as never,
          version: (latest?.version ?? 0) + 1,
        },
      });
    });
    await createPlatformAudit(database, {
      action: 'platform.configuration.rolled_back',
      actorUserId: operator.id,
      afterData: { key: rolledBack.key, version: rolledBack.version },
      entityId: rolledBack.id,
      entityType: 'platform_configuration',
      metadata: { reason: input.reason, rollbackOfVersionId: id },
    });
    return { id: rolledBack.id, status: 'published' };
  });

  app.get('/v1/platform/audit', async (request) => {
    const operator = await requirePlatformAdmin(
      database,
      authenticate,
      request,
      config,
    );
    requirePlatformPermission(operator.role, 'view');
    const query = platformAuditListSchema.parse(request.query);
    const where = {
      ...(query.action
        ? { action: { contains: query.action, mode: 'insensitive' as const } }
        : {}),
      ...(query.organizationId
        ? {
            metadata: {
              path: ['organizationId'],
              equals: query.organizationId,
            },
          }
        : {}),
    };
    const [total, logs] = await Promise.all([
      database.platformAuditLog.count({ where }),
      database.platformAuditLog.findMany({
        include: { actor: { select: { email: true, fullName: true } } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const organizationIds = logs.flatMap((log) => {
      const metadata = log.metadata as { organizationId?: unknown };
      return typeof metadata.organizationId === 'string'
        ? [metadata.organizationId]
        : [];
    });
    const organizations = await database.organization.findMany({
      select: { id: true, name: true },
      where: { id: { in: organizationIds } },
    });
    const organizationNames = new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
    return {
      logs: logs.map((log) => ({
        action: log.action,
        actor: log.actor
          ? { email: log.actor.email, fullName: log.actor.fullName }
          : null,
        createdAt: log.createdAt.toISOString(),
        id: log.id,
        organization:
          organizationNames.get(
            (log.metadata as { organizationId?: string }).organizationId ?? '',
          ) ?? 'Plataforma Nava',
        reason:
          log.metadata && typeof log.metadata === 'object'
            ? ((log.metadata as { reason?: unknown }).reason ?? null)
            : null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
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
    requirePlatformPermission(
      user.role,
      input.action === 'change_plan' ||
        input.action === 'extend_trial' ||
        input.action === 'reduce_trial'
        ? 'manage_billing'
        : 'manage_operations',
    );
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
        trialEndsAt: subscription.trialEndsAt,
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
        const periodEnd = new Date(
          periodStart.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
        updated = await transaction.subscription.update({
          data: {
            currentPeriodEnd: periodEnd,
            graceEndsAt: new Date(
              periodEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
            ),
            currentPeriodStart: periodStart,
            status: SubscriptionStatus.ACTIVE,
            trialEndsAt: null,
          },
          where: { id: subscription.id },
        });
        await transaction.organization.update({
          data: { status: OrganizationStatus.ACTIVE },
          where: { id: organization.id },
        });
      } else if (input.action === 'change_plan') {
        const plan = await transaction.plan.findFirst({
          where: { code: input.planCode, isActive: true },
        });
        if (!plan)
          throw new ApiError(404, 'PLAN_NOT_FOUND', 'El plan no existe.');
        const periodStart = new Date();
        const periodEnd = new Date(
          periodStart.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
        const isFree = plan.code === 'free';
        updated = await transaction.subscription.update({
          data: {
            currentPeriodEnd: periodEnd,
            currentPeriodStart: periodStart,
            graceEndsAt: isFree
              ? null
              : new Date(
                  periodEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
                ),
            planId: plan.id,
            status: isFree
              ? SubscriptionStatus.FREE
              : SubscriptionStatus.ACTIVE,
            trialEndsAt: null,
          },
          where: { id: subscription.id },
        });
        await transaction.organization.update({
          data: { status: OrganizationStatus.ACTIVE },
          where: { id: organization.id },
        });
      } else if (input.action === 'extend_trial') {
        const base =
          subscription.trialEndsAt && subscription.trialEndsAt > new Date()
            ? subscription.trialEndsAt
            : new Date();
        const trialEndsAt = new Date(
          base.getTime() + input.days * 24 * 60 * 60 * 1000,
        );
        updated = await transaction.subscription.update({
          data: {
            currentPeriodEnd: trialEndsAt,
            graceEndsAt: null,
            status: SubscriptionStatus.TRIAL,
            trialEndsAt,
          },
          where: { id: subscription.id },
        });
        await transaction.organization.update({
          data: { status: OrganizationStatus.TRIAL },
          where: { id: organization.id },
        });
      } else {
        if (
          subscription.status !== SubscriptionStatus.TRIAL ||
          !subscription.trialEndsAt
        )
          throw new ApiError(
            409,
            'TRIAL_NOT_ACTIVE',
            'La organización no tiene un trial activo.',
          );
        const trialEndsAt = new Date(
          subscription.trialEndsAt.getTime() - input.days * 24 * 60 * 60 * 1000,
        );
        if (trialEndsAt <= new Date())
          throw new ApiError(
            409,
            'TRIAL_REDUCTION_INVALID',
            'La reducción debe conservar al menos un día de trial.',
          );
        updated = await transaction.subscription.update({
          data: { currentPeriodEnd: trialEndsAt, trialEndsAt },
          where: { id: subscription.id },
        });
      }
      const organizationStatus =
        input.action === 'suspend'
          ? OrganizationStatus.SUSPENDED
          : input.action === 'extend_trial' || input.action === 'reduce_trial'
            ? OrganizationStatus.TRIAL
            : OrganizationStatus.ACTIVE;
      await transaction.auditLog.create({
        data: {
          action: `platform.organization.${input.action}`,
          actorUserId: user.id,
          afterData: {
            organizationStatus,
            planId: updated.planId,
            subscriptionStatus: updated.status,
            trialEndsAt: updated.trialEndsAt,
          },
          beforeData: before,
          entityId: organization.id,
          entityType: 'organization',
          metadata: {
            organizationId: organization.id,
            reason: input.reason,
            source: 'platform_admin',
          },
          organizationId: organization.id,
        },
      });
      await transaction.platformAuditLog.create({
        data: {
          action: `platform.organization.${input.action}`,
          actorUserId: user.id,
          afterData: {
            organizationStatus,
            planId: updated.planId,
            subscriptionStatus: updated.status,
            trialEndsAt: updated.trialEndsAt,
          },
          beforeData: before,
          entityId: organization.id,
          entityType: 'organization',
          metadata: {
            organizationId: organization.id,
            reason: input.reason,
            source: 'platform_admin',
          },
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
    requirePlatformPermission(user.role, 'support');
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
    await createPlatformAudit(database, {
      action: 'platform.organization.support_accessed',
      actorUserId: user.id,
      entityId: organization.id,
      entityType: 'organization',
      metadata: {
        organizationId: organization.id,
        reason: input.reason,
        scope: 'operational_diagnostics',
        source: 'platform_admin',
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
  resendPendingVerification: (
    pendingRegistrationId: string,
  ) => Promise<{ readonly verificationExpiresAt: string }>,
  requestPasswordRecovery: (userId: string) => Promise<void>,
) {
  registerPlatformRoutes(
    app,
    database,
    authenticate,
    config,
    platformAccessMailer,
    resendPendingVerification,
    requestPasswordRecovery,
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
    const feature = path.startsWith('/v1/inventory')
      ? 'inventory'
      : path.startsWith('/v1/commissions')
        ? 'commissions'
        : null;
    if (feature) {
      const entitlements = await getEntitlements(
        database,
        membership.organizationId,
      );
      if (!entitlements.featureFlags[feature])
        throw new ApiError(
          403,
          'PLAN_FEATURE_NOT_INCLUDED',
          feature === 'inventory'
            ? 'El inventario requiere Nava Esencial o un plan superior.'
            : 'Esta función requiere Nava Local.',
        );
    }
  });

  app.get('/v1/subscription', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    const now = new Date();
    const { plans, subscriptionUsage } = await database.$transaction(
      async (transaction) => {
        const usage = await getSubscriptionUsage(
          transaction,
          current.organizationId,
          now,
        );
        const availablePlans = await transaction.plan.findMany({
          orderBy: { sortOrder: 'asc' },
          where: { isActive: true },
        });
        return { plans: availablePlans, subscriptionUsage: usage };
      },
    );
    const { plan: currentPlan, subscription } = subscriptionUsage;
    return {
      current: {
        canManage: current.role === MembershipRole.OWNER,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        // Platform exceptions are enforced by getSubscriptionUsage. Return the
        // same effective flags to Mobile so its navigation matches the API.
        featureFlags: subscriptionUsage.featureFlags,
        graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
        limits: subscriptionUsage.limits,
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
          featureFlags: parsePlanFeatureFlags(plan.featureFlags),
          features: plan.features,
          limits: parsePlanLimits(plan.limits),
          monthlyPriceCents: plan.monthlyPriceCents,
          name: plan.name,
        };
      }),
      usage: {
        bookingLimit: subscriptionUsage.effectiveBookingLimit,
        bookingWindowStartsAt:
          subscriptionUsage.bookingWindowStartsAt.toISOString(),
        clients: subscriptionUsage.usage.clients,
        clientLimit: subscriptionUsage.limits.clients,
        graceAvailable: subscriptionUsage.grace.available,
        graceBookings: subscriptionUsage.grace.bookings,
        graceUsed: subscriptionUsage.grace.used,
        locations: subscriptionUsage.usage.locations,
        rolling30DayBookings: subscriptionUsage.usage.rolling30DayBookings,
        teamMemberLimit: subscriptionUsage.limits.teamMembers,
        teamMembers: subscriptionUsage.usage.teamMembers,
      },
    };
  });

  app.post('/v1/subscription/booking-grace', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    if (current.role !== MembershipRole.OWNER) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo el propietario puede activar las reservas de cortesia.',
      );
    }
    const result = await grantFirstBookingGrace(
      database,
      current.organizationId,
    );
    return {
      usage: {
        bookingLimit: result.effectiveBookingLimit,
        graceAvailable: result.grace.available,
        graceBookings: result.grace.bookings,
        graceUsed: result.grace.used,
        rolling30DayBookings: result.usage.rolling30DayBookings,
      },
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
      const { plans, subscription } = await ensureOrganizationSubscription(
        transaction,
        current.organizationId,
      );
      const localPlan = plans.find(({ code }) => code === 'local');
      if (!localPlan) throw new Error('Nava Local no esta disponible.');

      const status =
        input.status === 'active'
          ? SubscriptionStatus.ACTIVE
          : SubscriptionStatus.SUSPENDED;
      const periodStart = new Date();
      const periodEnd = new Date(
        periodStart.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
      const updated = await transaction.subscription.update({
        data: {
          ...(status === SubscriptionStatus.ACTIVE
            ? {
                currentPeriodEnd: periodEnd,
                currentPeriodStart: periodStart,
                graceEndsAt: new Date(
                  periodEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
                ),
                trialEndsAt: null,
                planId: localPlan.id,
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
        const entitlements = await getEntitlements(
          transaction,
          current.organizationId,
        );
        const maximumLocations = entitlements.limits.locations;
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
            `Tu plan actual permite ${maximumLocations} sucursal${maximumLocations === 1 ? '' : 'es'}.`,
          );
        const organization = await transaction.organization.findUniqueOrThrow({
          select: { primaryLocationId: true },
          where: { id: current.organizationId },
        });
        const templateSchedule = organization.primaryLocationId
          ? await transaction.businessWeeklySchedule.findMany({
              orderBy: { weekday: 'asc' },
              where: { locationId: organization.primaryLocationId },
            })
          : [];
        const templateServiceIds = organization.primaryLocationId
          ? await transaction.professionalService.findMany({
              distinct: ['serviceId'],
              select: { serviceId: true },
              where: {
                locationId: organization.primaryLocationId,
                service: { isActive: true },
              },
            })
          : [];
        const created = await transaction.location.create({
          data: {
            addressLine: input.addressLine || null,
            city: input.city || null,
            countryCode: input.countryCode,
            currencyCode: input.currencyCode,
            formattedAddress: input.formattedAddress || null,
            googlePlaceId: input.googlePlaceId ?? null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
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
        // The owner may also be a bookable professional.  A newly created
        // branch must therefore receive the active catalog for that
        // professional; otherwise its public page is empty until somebody
        // manually touches the member assignment again.
        if (
          current.role === MembershipRole.OWNER ||
          current.role === MembershipRole.BARBER
        ) {
          const activeServices = templateServiceIds.length
            ? templateServiceIds.map(({ serviceId }) => ({ id: serviceId }))
            : await transaction.service.findMany({
                select: { id: true },
                where: {
                  isActive: true,
                  organizationId: current.organizationId,
                },
              });
          if (activeServices.length > 0) {
            await transaction.professionalService.createMany({
              data: activeServices.map((service) => ({
                locationId: created.id,
                membershipId: current.id,
                serviceId: service.id,
              })),
              skipDuplicates: true,
            });
          }
        }
        await transaction.businessWeeklySchedule.createMany({
          data: Array.from({ length: 7 }, (_, weekday) => {
            const template = templateSchedule.find(
              (schedule) => schedule.weekday === weekday,
            );
            return {
              endMinute: template?.endMinute ?? 1080,
              isOpen: template?.isOpen ?? true,
              locationId: created.id,
              organizationId: current.organizationId,
              startMinute: template?.startMinute ?? 540,
              weekday,
            };
          }),
        });
        await transaction.auditLog.create({
          data: {
            action: 'location.created',
            actorUserId: user.id,
            afterData: {
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

  app.get('/v1/locations', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    if (current.role !== MembershipRole.OWNER)
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo el propietario puede administrar sucursales.',
      );
    const { subscriptionUsage } = await database.$transaction(
      async (transaction) => ({
        subscriptionUsage: await getSubscriptionUsage(
          transaction,
          current.organizationId,
          new Date(),
        ),
      }),
    );
    const locations = await database.location.findMany({
      orderBy: { createdAt: 'asc' },
      where: { organizationId: current.organizationId },
    });
    const activeLocationCount = locations.filter(
      (location) => location.isActive,
    ).length;
    return {
      canAdd: activeLocationCount < subscriptionUsage.limits.locations,
      limit: subscriptionUsage.limits.locations,
      locations: locations.map((location) => ({
        addressLine: location.addressLine,
        city: location.city,
        countryCode: location.countryCode,
        currencyCode: location.currencyCode,
        formattedAddress: location.formattedAddress,
        googlePlaceId: location.googlePlaceId,
        id: location.id,
        isActive: location.isActive,
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name,
        phone: location.phone,
        slug: location.slug,
        timezone: location.timezone,
      })),
      used: activeLocationCount,
    };
  });

  app.get('/v1/locations/accessible', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id, 'location.read');
    const canOperateAllLocations =
      current.role === MembershipRole.OWNER ||
      current.role === MembershipRole.MANAGER;
    const locations = await database.location.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
      where: {
        isActive: true,
        organizationId: current.organizationId,
        ...(canOperateAllLocations
          ? {}
          : {
              memberLocations: {
                some: { membershipId: current.id },
              },
            }),
      },
    });
    return { locations };
  });

  app.get('/v1/locations/booking-context', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    const canOperateAllLocations =
      current.role === MembershipRole.OWNER ||
      current.role === MembershipRole.MANAGER;
    const locations = await database.location.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, timezone: true },
      where: {
        isActive: true,
        organizationId: current.organizationId,
        ...(canOperateAllLocations
          ? {}
          : { memberLocations: { some: { membershipId: current.id } } }),
      },
    });
    return { locations };
  });

  app.post('/v1/locations/:locationId/archive', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    if (current.role !== MembershipRole.OWNER) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo el propietario puede archivar sucursales.',
      );
    }
    const { locationId } = z
      .object({ locationId: z.uuid() })
      .parse(request.params);
    const archived = await database.$transaction(async (transaction) => {
      const location = await transaction.location.findFirst({
        where: {
          id: locationId,
          isActive: true,
          organizationId: current.organizationId,
        },
      });
      if (!location) {
        throw new ApiError(
          404,
          'LOCATION_NOT_FOUND',
          'La sucursal no existe o ya está archivada.',
        );
      }
      const now = new Date();
      const [activeLocationCount, openCashRegisters, futureAppointments] =
        await Promise.all([
          transaction.location.count({
            where: { isActive: true, organizationId: current.organizationId },
          }),
          transaction.cashRegisterSession.count({
            where: {
              locationId: location.id,
              status: CashRegisterStatus.OPEN,
            },
          }),
          transaction.appointment.count({
            where: {
              locationId: location.id,
              startsAt: { gt: now },
              status: { not: AppointmentStatus.CANCELLED },
            },
          }),
        ]);
      if (activeLocationCount <= 1) {
        throw new ApiError(
          409,
          'LAST_ACTIVE_LOCATION',
          'Debes conservar al menos una sucursal activa.',
        );
      }
      if (openCashRegisters > 0) {
        throw new ApiError(
          409,
          'LOCATION_CASH_REGISTER_OPEN',
          'Cierra la caja antes de archivar la sucursal.',
        );
      }
      if (futureAppointments > 0) {
        throw new ApiError(
          409,
          'LOCATION_HAS_FUTURE_APPOINTMENTS',
          'Reagenda o cancela las citas futuras antes de archivar la sucursal.',
        );
      }
      await transaction.teamInvitation.updateMany({
        data: { status: InvitationStatus.REVOKED },
        where: {
          locationId: location.id,
          organizationId: current.organizationId,
          status: InvitationStatus.PENDING,
        },
      });
      const updated = await transaction.location.update({
        data: { isActive: false },
        where: { id: location.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'location.archived',
          actorUserId: user.id,
          afterData: { isActive: false },
          beforeData: { isActive: true },
          entityId: location.id,
          entityType: 'location',
          locationId: location.id,
          organizationId: current.organizationId,
        },
      });
      return updated;
    });
    return { location: archived };
  });

  app.post('/v1/locations/:locationId/restore', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    if (current.role !== MembershipRole.OWNER) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo el propietario puede restaurar sucursales.',
      );
    }
    const { locationId } = z
      .object({ locationId: z.uuid() })
      .parse(request.params);
    const restored = await database.$transaction(async (transaction) => {
      const location = await transaction.location.findFirst({
        where: {
          id: locationId,
          isActive: false,
          organizationId: current.organizationId,
        },
      });
      if (!location) {
        throw new ApiError(
          404,
          'LOCATION_NOT_FOUND',
          'La sucursal no existe o ya está activa.',
        );
      }
      const [entitlements, activeLocationCount] = await Promise.all([
        getEntitlements(transaction, current.organizationId),
        transaction.location.count({
          where: { isActive: true, organizationId: current.organizationId },
        }),
      ]);
      if (activeLocationCount >= entitlements.limits.locations) {
        throw new ApiError(
          409,
          'PLAN_LIMIT_REACHED',
          'Restaura una sucursal solo si tu plan tiene capacidad disponible.',
        );
      }
      const updated = await transaction.location.update({
        data: { isActive: true },
        where: { id: location.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'location.restored',
          actorUserId: user.id,
          afterData: { isActive: true },
          beforeData: { isActive: false },
          entityId: location.id,
          entityType: 'location',
          locationId: location.id,
          organizationId: current.organizationId,
        },
      });
      return updated;
    });
    return { location: restored };
  });

  app.patch('/v1/locations/:locationId', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    if (current.role !== MembershipRole.OWNER)
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo el propietario puede editar sucursales.',
      );
    const { locationId } = z
      .object({ locationId: z.uuid() })
      .parse(request.params);
    const input = updateLocationSchema.parse(request.body);
    const existing = await database.location.findFirst({
      where: {
        id: locationId,
        isActive: true,
        organizationId: current.organizationId,
      },
    });
    if (!existing)
      throw new ApiError(404, 'LOCATION_NOT_FOUND', 'La sucursal no existe.');
    try {
      const location = await database.$transaction(async (transaction) => {
        const updated = await transaction.location.update({
          data: {
            ...(input.addressLine !== undefined
              ? { addressLine: input.addressLine || null }
              : {}),
            ...(input.city !== undefined ? { city: input.city || null } : {}),
            ...(input.countryCode !== undefined
              ? { countryCode: input.countryCode }
              : {}),
            ...(input.currencyCode !== undefined
              ? { currencyCode: input.currencyCode }
              : {}),
            ...(input.formattedAddress !== undefined
              ? { formattedAddress: input.formattedAddress || null }
              : {}),
            ...(input.googlePlaceId !== undefined
              ? { googlePlaceId: input.googlePlaceId }
              : {}),
            ...(input.latitude !== undefined
              ? { latitude: input.latitude }
              : {}),
            ...(input.longitude !== undefined
              ? { longitude: input.longitude }
              : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.phone !== undefined
              ? { phone: input.phone, whatsappPhone: input.phone }
              : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.timezone !== undefined
              ? { timezone: input.timezone }
              : {}),
          },
          where: { id: existing.id },
        });
        await transaction.auditLog.create({
          data: {
            action: 'location.updated',
            actorUserId: user.id,
            afterData: input,
            beforeData: {
              addressLine: existing.addressLine,
              formattedAddress: existing.formattedAddress,
              name: existing.name,
              phone: existing.phone,
              slug: existing.slug,
            },
            entityId: updated.id,
            entityType: 'location',
            locationId: updated.id,
            organizationId: current.organizationId,
          },
        });
        return updated;
      });
      return {
        location: {
          addressLine: location.addressLine,
          city: location.city,
          countryCode: location.countryCode,
          currencyCode: location.currencyCode,
          formattedAddress: location.formattedAddress,
          googlePlaceId: location.googlePlaceId,
          id: location.id,
          latitude: location.latitude,
          longitude: location.longitude,
          name: location.name,
          phone: location.phone,
          slug: location.slug,
          timezone: location.timezone,
        },
      };
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
    const [
      members,
      pendingInvitations,
      commissionRules,
      entitlements,
      allowedProfessionalIds,
    ] = await Promise.all([
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
      getEntitlements(database, current.organizationId),
      getAllowedProfessionalIds(database, current.organizationId),
    ]);
    const commissionByMembership = new Map<string, number>();
    for (const rule of commissionRules) {
      if (!commissionByMembership.has(rule.professionalMembershipId)) {
        commissionByMembership.set(rule.professionalMembershipId, rule.value);
      }
    }
    return {
      assignmentCapabilities: {
        canEditAssignments: entitlements.featureFlags.team,
        maxActiveLocations: entitlements.limits.locations,
        reason: !entitlements.featureFlags.team
          ? 'plan_team_not_available'
          : !entitlements.featureFlags.multiLocation
            ? 'plan_multi_location_not_available'
            : null,
      },
      teamEnabled: entitlements.featureFlags.team,
      members: members.map((member) => ({
        commissionPercentage: commissionByMembership.get(member.id) ?? null,
        id: member.id,
        planAvailable:
          member.role === MembershipRole.OWNER ||
          member.role === MembershipRole.BARBER
            ? allowedProfessionalIds === null ||
              allowedProfessionalIds.includes(member.id)
            : entitlements.featureFlags.team,
        locations: member.memberLocations.map(
          ({ location, onlineBookingEnabled }) => ({
            id: location.id,
            name: location.name,
            onlineBookingEnabled,
          }),
        ),
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

  app.get('/v1/team/locations', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'membership.manage',
    );
    const entitlements = await getEntitlements(
      database,
      current.organizationId,
    );
    if (!entitlements.featureFlags.team) {
      throw new ApiError(
        409,
        'PLAN_TEAM_NOT_AVAILABLE',
        'Tu plan actual no incluye equipo.',
      );
    }
    const locations = await database.location.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
      where: { isActive: true, organizationId: current.organizationId },
    });
    return { locations };
  });

  app.patch('/v1/team/members/:id/online-booking', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id);
    const { id } = teamRecordParamsSchema.parse(request.params);
    const input = updateMemberOnlineBookingSchema.parse(request.body);
    const canManageTeam = hasPermission(
      permissionRole(current.role),
      'membership.manage',
    );
    if (!canManageTeam && current.id !== id) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo puedes cambiar tu disponibilidad para reservas.',
      );
    }
    const member = await database.membership.findFirst({
      where: {
        id,
        organizationId: current.organizationId,
        role: { in: [MembershipRole.BARBER, MembershipRole.OWNER] },
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new ApiError(
        404,
        'PROFESSIONAL_NOT_FOUND',
        'El profesional no existe o no está activo.',
      );
    }
    await assertCanUseProfessional(database, current.organizationId, member.id);
    await requireLocation(database, current.organizationId, input.locationId);
    const memberLocation = await database.memberLocation.findUnique({
      where: {
        membershipId_locationId: {
          locationId: input.locationId,
          membershipId: member.id,
        },
      },
    });
    if (!memberLocation) {
      throw new ApiError(
        400,
        'PROFESSIONAL_LOCATION_REQUIRED',
        'El profesional no pertenece a la sucursal.',
      );
    }
    const updated = await database.$transaction(async (transaction) => {
      const updatedMemberLocation = await transaction.memberLocation.update({
        data: { onlineBookingEnabled: input.onlineBookingEnabled },
        where: {
          membershipId_locationId: {
            locationId: input.locationId,
            membershipId: member.id,
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'professional.online_booking.updated',
          actorUserId: user.id,
          afterData: { onlineBookingEnabled: input.onlineBookingEnabled },
          beforeData: {
            onlineBookingEnabled: memberLocation.onlineBookingEnabled,
          },
          entityId: member.id,
          entityType: 'member_location',
          locationId: input.locationId,
          organizationId: current.organizationId,
        },
      });
      return updatedMemberLocation;
    });
    return {
      locationId: updated.locationId,
      membershipId: updated.membershipId,
      onlineBookingEnabled: updated.onlineBookingEnabled,
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
      include: {
        memberLocations: { select: { locationId: true } },
        user: true,
      },
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
    if (
      member.role === MembershipRole.BARBER ||
      role === MembershipRole.BARBER
    ) {
      await assertCanUseProfessional(
        database,
        current.organizationId,
        member.id,
      );
    }
    const previousLocationIds = member.memberLocations.map(
      ({ locationId }) => locationId,
    );
    const selectedLocationIds = input.locationIds ?? [];
    const addedLocationIds =
      input.locationIds === undefined
        ? []
        : selectedLocationIds.filter(
            (locationId) => !previousLocationIds.includes(locationId),
          );
    const removedLocationIds =
      input.locationIds === undefined
        ? []
        : previousLocationIds.filter(
            (locationId) => !selectedLocationIds.includes(locationId),
          );
    const serviceAssignmentLocationIds =
      role !== MembershipRole.BARBER
        ? []
        : member.role === MembershipRole.BARBER
          ? addedLocationIds
          : (input.locationIds ?? previousLocationIds);
    const resultingLocationIds = input.locationIds ?? previousLocationIds;
    if (
      (role === MembershipRole.BARBER ||
        role === MembershipRole.RECEPTIONIST) &&
      resultingLocationIds.length === 0
    ) {
      throw new ApiError(
        400,
        'MEMBER_LOCATION_REQUIRED',
        'El profesional y recepción deben tener al menos una sucursal asignada.',
      );
    }
    if (input.locationIds !== undefined) {
      const entitlements = await getEntitlements(
        database,
        current.organizationId,
      );
      if (!entitlements.featureFlags.team) {
        throw new ApiError(
          409,
          'PLAN_TEAM_NOT_AVAILABLE',
          'Tu plan actual no incluye equipo.',
        );
      }
      if (
        input.locationIds.length > 1 &&
        !entitlements.featureFlags.multiLocation
      ) {
        throw new ApiError(
          409,
          'PLAN_MULTI_LOCATION_NOT_AVAILABLE',
          'Tu plan actual no incluye varias sucursales.',
        );
      }
      if (input.locationIds.length > entitlements.limits.locations) {
        throw new ApiError(
          409,
          'PLAN_LOCATION_LIMIT_REACHED',
          'La asignación supera el límite de sucursales de tu plan.',
        );
      }
      const locations = await database.location.findMany({
        select: { id: true },
        where: {
          id: { in: input.locationIds },
          isActive: true,
          organizationId: current.organizationId,
        },
      });
      if (locations.length !== input.locationIds.length) {
        throw new ApiError(
          404,
          'LOCATION_NOT_FOUND',
          'Una de las sucursales no existe o no pertenece a tu negocio.',
        );
      }
    }
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
      if (input.locationIds !== undefined) {
        if (
          member.role === MembershipRole.BARBER &&
          removedLocationIds.length > 0
        ) {
          const futureAppointments = await transaction.appointment.count({
            where: {
              locationId: { in: removedLocationIds },
              professionalMembershipId: member.id,
              startsAt: { gt: now },
              status: { not: AppointmentStatus.CANCELLED },
            },
          });
          if (futureAppointments > 0) {
            throw new ApiError(
              409,
              'MEMBER_LOCATION_HAS_FUTURE_APPOINTMENTS',
              'Reagenda o cancela las citas futuras antes de retirar esta sucursal.',
            );
          }
        }
        await transaction.memberLocation.deleteMany({
          where: {
            locationId: { in: removedLocationIds },
            membershipId: member.id,
          },
        });
        await transaction.memberLocation.createMany({
          data: input.locationIds.map((locationId) => ({
            locationId,
            membershipId: member.id,
          })),
          skipDuplicates: true,
        });
      }
      if (
        role === MembershipRole.BARBER &&
        serviceAssignmentLocationIds.length > 0
      ) {
        const activeServices = await transaction.service.findMany({
          select: { id: true },
          where: { isActive: true, organizationId: current.organizationId },
        });
        if (activeServices.length > 0) {
          await transaction.professionalService.createMany({
            data: serviceAssignmentLocationIds.flatMap((locationId) =>
              activeServices.map((service) => ({
                locationId,
                membershipId: member.id,
                serviceId: service.id,
              })),
            ),
            skipDuplicates: true,
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          action: 'team.member.updated',
          actorUserId: user.id,
          afterData: {
            commissionPercentage,
            fullName: updatedUser.fullName,
            ...(input.locationIds === undefined
              ? {}
              : {
                  autoAssignedLocationIds: serviceAssignmentLocationIds,
                  locationIds: input.locationIds,
                  removedLocationIds,
                }),
            role: input.role,
          },
          beforeData: {
            fullName: member.user.fullName,
            locationIds: member.memberLocations.map(
              ({ locationId }) => locationId,
            ),
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
    await assertCanCreateTeamMember(database, current.organizationId);
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
    await assertCanCreateTeamMember(database, invitation.organizationId);
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
      if (invitation.role === MembershipRole.BARBER) {
        const activeServices = await transaction.service.findMany({
          select: { id: true },
          where: { isActive: true, organizationId: invitation.organizationId },
        });
        if (activeServices.length > 0) {
          await transaction.professionalService.createMany({
            data: activeServices.map((service) => ({
              locationId: invitation.locationId,
              membershipId: acceptedMembership.id,
              serviceId: service.id,
            })),
            skipDuplicates: true,
          });
        }
      }
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
        imageData: service.imageData,
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
              imageData: input.imageData ?? null,
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
              imageData: input.imageData ?? null,
              name: input.name,
              onlineBooking: input.onlineBooking,
              organizationId: current.organizationId,
              priceCents: input.priceCents,
            },
          });
      // A service belongs to the organization catalog.  Make it available by
      // default to every active professional at every branch where they work;
      // managers can still remove an individual assignment afterwards.
      const professionalLocations = await transaction.memberLocation.findMany({
        select: { locationId: true, membershipId: true },
        where: {
          membership: {
            organizationId: current.organizationId,
            role: { in: [MembershipRole.BARBER, MembershipRole.OWNER] },
            status: MembershipStatus.ACTIVE,
          },
          location: { isActive: true },
        },
      });
      if (professionalLocations.length > 0) {
        await transaction.professionalService.createMany({
          data: professionalLocations.map((assignment) => ({
            locationId: assignment.locationId,
            membershipId: assignment.membershipId,
            serviceId: record.id,
          })),
          skipDuplicates: true,
        });
      }
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
          imageData: input.imageData ?? null,
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
    await assertCanUseProfessional(
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

  app.delete('/v1/services/assignments', async (request, reply) => {
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
    await assertCanUseProfessional(
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
    if (!service) {
      throw new ApiError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe.');
    }
    await database.$transaction(async (transaction) => {
      const removed = await transaction.professionalService.deleteMany({
        where: {
          locationId: input.locationId,
          membershipId: input.membershipId,
          serviceId: input.serviceId,
        },
      });
      if (removed.count > 0) {
        await transaction.auditLog.create({
          data: {
            action: 'professional_service.unassigned',
            actorUserId: user.id,
            beforeData: {
              locationId: input.locationId,
              membershipId: input.membershipId,
              serviceId: input.serviceId,
            },
            entityId: input.serviceId,
            entityType: 'professional_service',
            locationId: input.locationId,
            organizationId: current.organizationId,
          },
        });
      }
    });
    return reply.code(204).send();
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
    await assertCanUseProfessional(
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
    await assertCanUseProfessional(
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
