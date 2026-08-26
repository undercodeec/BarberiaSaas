import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  AppNotificationType,
  AppointmentStatus,
  CashRegisterStatus,
  createDatabaseClient,
  InvitationStatus,
  MembershipRole,
  MembershipStatus,
  OnboardingCollaboratorRole,
  OrganizationStatus,
  RegistrationAccountType,
  SubscriptionStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import {
  completeOnboardingSchema,
  closeOwnedBusinessSchema,
  createSlug,
  createOnboardingCollaboratorSchema,
  createOnboardingServiceSchema,
  deleteAccountSchema,
  mapsAutocompleteSchema,
  mapsPlaceDetailsSchema,
  mapsReverseGeocodeSchema,
  recoverAccessSchema,
  registrationAvailabilitySchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  updateOnboardingCollaboratorSchema,
  updateOnboardingServiceSchema,
  updateOnboardingAccountDetailsSchema,
  updateAccountTypeSchema,
  updateBusinessLocationSchema,
  verifyEmailSchema,
} from '@barber-saas/validation';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import nodemailer from 'nodemailer';
import { z, ZodError } from 'zod';

import type { ApiConfig } from './config';
import { ApiError, isUniqueConstraintError } from './errors';
import { createGoogleMapsClient } from './google-maps';
import { registerAgendaRoutes } from './agenda';
import { registerBusinessScheduleRoutes } from './business-schedule';
import { registerCashRegisterRoutes } from './cash-register';
import { registerCommissionRoutes } from './commissions';
import { registerClientRoutes } from './clients';
import { registerInventoryRoutes } from './inventory';
import { registerOperationsRoutes } from './operations';
import { sendFcmNotifications } from './fcm';
import { registerNotificationRoutes } from './notifications';
import type {
  AppointmentNotificationKind,
  AppointmentNotifier,
} from './notifications';
import { registerProfileRoutes } from './profile';
import { registerPayphoneRoutes } from './payphone';
import {
  processProductOrderLifecycle,
  registerProductOrderRoutes,
} from './product-orders';
import { registerReportRoutes } from './reports';
import {
  expireStaleSubscriptionPayments,
  registerSubscriptionPaymentRoutes,
  type PlatformPaymentProvider,
} from './subscription-payments';
import {
  processPublicBookingLifecycle,
  registerPublicBookingRoutes,
  type PublicBookingMailer,
} from './public-booking';
import type {
  InvitationMailer,
  PlatformAccessMailer,
  RecoveryMailer,
  VerificationMailer,
} from './recovery-mailer';
import {
  createOpaqueToken,
  createVerificationCode,
  hashOpaqueToken,
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from './security';
import {
  ensureOrganizationSubscription,
  reconcileSubscriptionLifecycle,
} from './subscription-policy';
import { processSubscriptionRenewalReminders } from './subscription-reminders';
import {
  enqueuePendingSriInvoices,
  processSriInvoiceQueue,
} from './sri-invoicing';
import { registerSriBillingRoutes } from './sri-billing';
import { deliverSriInvoices } from './sri-mailer';
import {
  buildClosedBusinessExport,
  listClosedBusinessExports,
} from './closed-business-export';

const SESSION_IDLE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_DURATION_MS = 30 * 60 * 1000;
const VERIFICATION_DURATION_MS = 10 * 60 * 1000;
const VERIFICATION_LOCK_DURATION_MS = 15 * 60 * 1000;
const ACCOUNT_DELETION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_AUTH_RATE_LIMIT_BUCKETS = 10_000;
const marketingPreferenceSchema = z.object({ marketingOptIn: z.boolean() });
const closedBusinessExportParamsSchema = z.object({ organizationId: z.uuid() });
const closedBusinessExportQuerySchema = z.object({
  format: z.enum(['csv', 'zip']).default('csv'),
});

interface AuthRateLimitBucket {
  count: number;
  resetAt: number;
}

type AuthRateLimitScope =
  'login' | 'recover' | 'register' | 'resend-verification';

function enforceAuthIpRateLimit({
  buckets,
  limit,
  reply,
  request,
  scope,
  windowMs,
}: {
  readonly buckets: Map<string, AuthRateLimitBucket>;
  readonly limit: number;
  readonly reply: FastifyReply;
  readonly request: FastifyRequest;
  readonly scope: AuthRateLimitScope;
  readonly windowMs: number;
}): void {
  const now = Date.now();
  const key = `${scope}:${request.ip}`;
  if (!buckets.has(key) && buckets.size >= MAX_AUTH_RATE_LIMIT_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    if (buckets.size >= MAX_AUTH_RATE_LIMIT_BUCKETS) {
      const oldestKey = buckets.keys().next().value as string | undefined;
      if (oldestKey) buckets.delete(oldestKey);
    }
  }
  const current = buckets.get(key);
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

  if (!current || current.resetAt <= now) buckets.set(key, bucket);

  const allowed = bucket.count < limit;
  if (allowed) bucket.count += 1;

  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000),
  );
  reply
    .header('x-ratelimit-limit', String(limit))
    .header('x-ratelimit-remaining', String(remaining))
    .header('x-ratelimit-reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (allowed) return;

  reply.header('retry-after', String(retryAfterSeconds));
  const errorCode = {
    login: 'AUTH_LOGIN_RATE_LIMITED',
    recover: 'AUTH_RECOVER_RATE_LIMITED',
    register: 'AUTH_REGISTER_RATE_LIMITED',
    'resend-verification': 'AUTH_RESEND_RATE_LIMITED',
  } as const;
  throw new ApiError(
    429,
    errorCode[scope],
    'Has realizado demasiadas solicitudes. Espera unos minutos antes de intentarlo nuevamente.',
  );
}

type NotificationDeliveryState = 'failed' | 'pending' | 'sent' | 'skipped';
interface NotificationDeliveryAttempt {
  attempts: number;
  nextAttemptAt?: string;
  state: NotificationDeliveryState;
}
interface QueuedNotificationData {
  appointmentId?: string;
  appointmentStartsAt?: string;
  details?: string;
  delivery?: {
    email: NotificationDeliveryAttempt;
    push: NotificationDeliveryAttempt;
  };
  route?: string;
  type?: string;
}

function appointmentNotificationCopy(
  kind: AppointmentNotificationKind,
  clientName: string,
) {
  if (kind === 'cancelled')
    return {
      body: `${clientName} canceló una reserva online.`,
      title: 'Reserva cancelada',
      type: AppNotificationType.APPOINTMENT_CANCELLED,
    };
  if (kind === 'rescheduled')
    return {
      body: `${clientName} reprogramó una reserva online.`,
      title: 'Reserva reprogramada',
      type: AppNotificationType.APPOINTMENT_RESCHEDULED,
    };
  return {
    body: `${clientName} confirmó una nueva reserva online.`,
    title: 'Nueva reserva online',
    type: AppNotificationType.APPOINTMENT_CREATED,
  };
}

function queuedNotificationData(value: unknown): QueuedNotificationData {
  return value && typeof value === 'object'
    ? (value as QueuedNotificationData)
    : {};
}

function notificationDeliveryDue(
  delivery: NotificationDeliveryAttempt | undefined,
  now: Date,
) {
  return Boolean(
    delivery &&
    (delivery.state === 'pending' || delivery.state === 'failed') &&
    delivery.attempts < 5 &&
    (!delivery.nextAttemptAt || new Date(delivery.nextAttemptAt) <= now),
  );
}

function failedNotificationAttempt(attempts: number) {
  const delays = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
  return {
    attempts,
    nextAttemptAt: new Date(
      Date.now() +
        (delays[Math.min(attempts - 1, delays.length - 1)] ?? 60_000),
    ).toISOString(),
    state: 'failed' as const,
  };
}

let notificationDeliveryRunning = false;

async function processQueuedNotificationDeliveries(
  database: DatabaseClient,
  config: ApiConfig,
) {
  if (notificationDeliveryRunning) return;
  notificationDeliveryRunning = true;
  try {
    const now = new Date();
    const notifications = await database.appNotification.findMany({
      include: { organization: true, user: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const transporter =
      config.SMTP_HOST && config.SMTP_FROM
        ? nodemailer.createTransport({
            auth:
              config.SMTP_USER && config.SMTP_PASSWORD
                ? { pass: config.SMTP_PASSWORD, user: config.SMTP_USER }
                : undefined,
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            secure: config.SMTP_SECURE === 'true',
          })
        : null;
    for (const notification of notifications) {
      const data = queuedNotificationData(notification.data);
      if (!data.delivery) continue;
      let { email, push } = data.delivery;
      if (notificationDeliveryDue(email, now)) {
        const attempts = email.attempts + 1;
        if (!transporter || !config.SMTP_FROM) {
          email = { attempts, state: 'skipped' };
        } else {
          try {
            await transporter.sendMail({
              from: config.SMTP_FROM,
              subject: `${notification.title} · ${notification.organization.name}`,
              text: `${notification.body}${data.details ? `\n\n${data.details}` : ''}`,
              to: notification.user.email,
            });
            email = { attempts, state: 'sent' };
          } catch {
            email = failedNotificationAttempt(attempts);
          }
        }
      }
      if (notificationDeliveryDue(push, now)) {
        const attempts = push.attempts + 1;
        const tokens = await database.pushToken.findMany({
          where: { userId: notification.userId },
        });
        if (!tokens.length) {
          push = { attempts, state: 'skipped' };
        } else {
          try {
            await sendFcmNotifications({
              body: notification.body,
              config,
              data: {
                appointmentId: data.appointmentId,
                appointmentStartsAt: data.appointmentStartsAt,
                route: data.route,
                type: data.type,
              },
              title: notification.title,
              tokens: tokens.map((token) => token.token),
            });
            push = { attempts, state: 'sent' };
          } catch {
            push = failedNotificationAttempt(attempts);
          }
        }
      }
      await database.appNotification.update({
        data: { data: { ...data, delivery: { email, push } } as never },
        where: { id: notification.id },
      });
    }
  } finally {
    notificationDeliveryRunning = false;
  }
}

function createQueuedAppointmentNotifier(
  database: DatabaseClient,
  config: ApiConfig,
): AppointmentNotifier {
  return {
    async notify(appointmentId, kind) {
      try {
        const appointment = await database.appointment.findUnique({
          include: {
            location: true,
            organization: true,
            professional: { include: { user: true } },
          },
          where: { id: appointmentId },
        });
        if (!appointment) return;
        const memberships = await database.membership.findMany({
          include: { user: { select: { id: true } } },
          where: {
            organizationId: appointment.organizationId,
            status: MembershipStatus.ACTIVE,
            OR: [
              { id: appointment.professionalMembershipId },
              { role: MembershipRole.OWNER },
              { role: MembershipRole.MANAGER },
            ],
          },
        });
        const recipients = [
          ...new Map(
            memberships.map((member) => [member.userId, member.user]),
          ).values(),
        ];
        const content = appointmentNotificationCopy(
          kind,
          appointment.clientName,
        );
        const startsAt = new Intl.DateTimeFormat('es-EC', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: appointment.location.timezone,
        }).format(appointment.startsAt);
        await database.appNotification.createMany({
          data: recipients.map((recipient) => ({
            appointmentId: appointment.id,
            body: content.body,
            data: {
              appointmentId: appointment.id,
              appointmentStartsAt: appointment.startsAt.toISOString(),
              delivery: {
                email: {
                  attempts: 0,
                  state:
                    config.SMTP_HOST && config.SMTP_FROM
                      ? ('pending' as const)
                      : ('skipped' as const),
                },
                push: { attempts: 0, state: 'pending' as const },
              },
              details: `${appointment.clientName} · ${appointment.professional.user.fullName}\n${startsAt}`,
              route: '/agenda',
              type: kind,
            },
            organizationId: appointment.organizationId,
            title: content.title,
            type: content.type,
            userId: recipient.id,
          })),
        });
        await processQueuedNotificationDeliveries(database, config);
      } catch {
        // La cita ya quedó confirmada; la cola reintentará entregas persistidas.
      }
    },
  };
}

function minuteForRegistrationTime(
  value: string | null | undefined,
  fallback: number,
) {
  const match = /^(\d{2}):(\d{2})$/u.exec(value ?? '');
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

function publicBookingUrl(baseUrl: string, publicBookingToken: string) {
  return `${baseUrl.replace(/\/$/u, '')}/${publicBookingToken}`;
}

const onboardingCollaboratorParamsSchema = z.object({
  id: z.uuid('El identificador no es válido.'),
});
const onboardingServiceParamsSchema = z.object({
  id: z.uuid('El identificador no es válido.'),
});

interface BuildApiOptions {
  readonly config: ApiConfig;
  readonly database?: DatabaseClient;
  readonly googleMapsFetch?: typeof fetch;
  readonly invitationMailer?: InvitationMailer | null;
  readonly platformAccessMailer?: PlatformAccessMailer | null;
  readonly platformPaymentProvider?: PlatformPaymentProvider;
  readonly publicBookingMailer?: PublicBookingMailer | null;
  readonly recoveryMailer?: RecoveryMailer | null;
  readonly verificationMailer?: VerificationMailer | null;
}

interface RegistrationProfileDraft {
  readonly accountType: RegistrationAccountType;
  readonly businessName: string;
  readonly city: string;
  readonly closingTime: string;
  readonly countryCode: string;
  readonly openingTime: string;
  readonly phone: string;
  readonly timezone: string;
}

function completeRegistrationProfile(input: {
  readonly accountType: RegistrationAccountType | null;
  readonly businessName: string | null;
  readonly city: string | null;
  readonly closingTime: string | null;
  readonly countryCode: string | null;
  readonly openingTime: string | null;
  readonly phone: string | null;
  readonly timezone: string | null;
}): RegistrationProfileDraft | null {
  if (
    !input.accountType ||
    !input.businessName ||
    !input.city ||
    !input.closingTime ||
    !input.countryCode ||
    !input.openingTime ||
    !input.phone ||
    !input.timezone
  ) {
    return null;
  }
  return {
    accountType: input.accountType,
    businessName: input.businessName,
    city: input.city,
    closingTime: input.closingTime,
    countryCode: input.countryCode,
    openingTime: input.openingTime,
    phone: input.phone,
    timezone: input.timezone,
  };
}

function onboardingCollaboratorData(input: {
  readonly agendaColor: string;
  readonly canPerformServices: boolean;
  readonly customRoleDescription?: string | null | undefined;
  readonly customRoleName?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly identification?: string | null | undefined;
  readonly name: string;
  readonly phone?: string | null | undefined;
  readonly photoUri?: string | null | undefined;
  readonly role: 'administrator' | 'barber' | 'custom';
}) {
  const role: Record<
    'administrator' | 'barber' | 'custom',
    OnboardingCollaboratorRole
  > = {
    administrator: OnboardingCollaboratorRole.ADMINISTRATOR,
    barber: OnboardingCollaboratorRole.BARBER,
    custom: OnboardingCollaboratorRole.CUSTOM,
  };
  return {
    agendaColor: input.agendaColor.toUpperCase(),
    canPerformServices: input.canPerformServices,
    customRoleDescription: input.customRoleDescription ?? null,
    customRoleName: input.customRoleName ?? null,
    description: input.description ?? null,
    identification: input.identification ?? null,
    name: input.name,
    phone: input.phone ?? null,
    photoUri: input.photoUri ?? null,
    role: role[input.role],
  };
}

function publicOnboardingCollaborator(collaborator: {
  readonly agendaColor: string;
  readonly canPerformServices: boolean;
  readonly customRoleDescription: string | null;
  readonly customRoleName: string | null;
  readonly description: string | null;
  readonly id: string;
  readonly identification: string | null;
  readonly name: string;
  readonly phone: string | null;
  readonly photoUri: string | null;
  readonly role: OnboardingCollaboratorRole;
}) {
  return {
    agendaColor: collaborator.agendaColor,
    canPerformServices: collaborator.canPerformServices,
    customRoleDescription: collaborator.customRoleDescription,
    customRoleName: collaborator.customRoleName,
    description: collaborator.description,
    id: collaborator.id,
    identification: collaborator.identification,
    name: collaborator.name,
    phone: collaborator.phone,
    photoUri: collaborator.photoUri,
    role: collaborator.role.toLowerCase(),
  };
}

function onboardingServiceData(input: {
  readonly agendaColor: string;
  readonly category: {
    readonly description: string;
    readonly name: string;
  } | null;
  readonly description?: string | null | undefined;
  readonly downPaymentPercentage: number;
  readonly durationMinutes: number;
  readonly imageUri?: string | null | undefined;
  readonly name: string;
  readonly onlineBooking: boolean;
  readonly price: number;
  readonly priceType: 'fixed' | 'from' | 'free' | 'hidden';
  readonly showServiceTime: boolean;
  readonly tax: {
    readonly addAtCheckout: boolean;
    readonly addAtPurchaseEnd: boolean;
    readonly name: string;
    readonly percentage: number;
  } | null;
}) {
  return {
    agendaColor: input.agendaColor.toUpperCase(),
    categoryDescription: input.category?.description || null,
    categoryName: input.category?.name || null,
    description: input.description || null,
    downPaymentPercentage: input.downPaymentPercentage,
    durationMinutes: input.durationMinutes,
    imageUri: input.imageUri || null,
    name: input.name,
    onlineBooking: input.onlineBooking,
    priceCents: Math.round(input.price * 100),
    priceType: input.priceType,
    showServiceTime: input.showServiceTime,
    taxAddAtCheckout: input.tax?.addAtCheckout ?? false,
    taxAddAtPurchaseEnd: input.tax?.addAtPurchaseEnd ?? false,
    taxName: input.tax?.name || null,
    taxPercentage: input.tax?.percentage ?? null,
  };
}

function publicOnboardingService(service: {
  readonly agendaColor: string;
  readonly categoryDescription: string | null;
  readonly categoryName: string | null;
  readonly description: string | null;
  readonly downPaymentPercentage: number;
  readonly durationMinutes: number;
  readonly id: string;
  readonly imageUri: string | null;
  readonly name: string;
  readonly onlineBooking: boolean;
  readonly priceCents: number;
  readonly priceType: string;
  readonly showServiceTime: boolean;
  readonly taxAddAtCheckout: boolean;
  readonly taxAddAtPurchaseEnd: boolean;
  readonly taxName: string | null;
  readonly taxPercentage: number | null;
}) {
  return {
    agendaColor: service.agendaColor,
    category: service.categoryName
      ? {
          description: service.categoryDescription ?? '',
          name: service.categoryName,
        }
      : null,
    description: service.description,
    downPaymentPercentage: service.downPaymentPercentage,
    durationMinutes: service.durationMinutes,
    id: service.id,
    imageUri: service.imageUri,
    name: service.name,
    onlineBooking: service.onlineBooking,
    price: service.priceCents / 100,
    priceType: service.priceType as 'fixed' | 'from' | 'free' | 'hidden',
    showServiceTime: service.showServiceTime,
    tax:
      service.taxName && service.taxPercentage !== null
        ? {
            addAtCheckout: service.taxAddAtCheckout,
            addAtPurchaseEnd: service.taxAddAtPurchaseEnd,
            name: service.taxName,
            percentage: service.taxPercentage,
          }
        : null,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeBusinessName(businessName: string): string {
  return businessName
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/gu, '');
}

function accountDeletionIdentifierHash(
  type: 'email' | 'phone',
  value: string,
): string {
  return hashOpaqueToken(`account-deletion-retention:${type}:${value}`);
}

async function activeAccountDeletionRetention(
  database: DatabaseClient,
  input: { readonly email?: string | null; readonly phoneKey?: string | null },
) {
  const emailHash = input.email
    ? accountDeletionIdentifierHash('email', input.email)
    : null;
  const phoneHash = input.phoneKey
    ? accountDeletionIdentifierHash('phone', input.phoneKey)
    : null;
  const identifierHashes = [emailHash, phoneHash].filter(
    (identifierHash): identifierHash is string => identifierHash !== null,
  );
  if (identifierHashes.length === 0) {
    return { email: false, phone: false };
  }

  const now = new Date();
  await database.accountDeletionRetention.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  const records = await database.accountDeletionRetention.findMany({
    select: { identifierHash: true },
    where: {
      expiresAt: { gt: now },
      identifierHash: { in: identifierHashes },
    },
  });
  return {
    email:
      emailHash !== null &&
      records.some((record) => record.identifierHash === emailHash),
    phone:
      phoneHash !== null &&
      records.some((record) => record.identifierHash === phoneHash),
  };
}

function duplicateRegistrationError(
  duplicate: {
    readonly phoneKey: string | null;
  },
  phoneKey: string,
): ApiError {
  if (duplicate.phoneKey === phoneKey) {
    return new ApiError(
      409,
      'PHONE_ALREADY_EXISTS',
      'Ese número telefónico ya está registrado.',
    );
  }
  return new ApiError(
    409,
    'REGISTRATION_DATA_ALREADY_EXISTS',
    'El teléfono ya está registrado.',
  );
}

function publicUser(user: { email: string; fullName: string; id: string }) {
  return { email: user.email, fullName: user.fullName, id: user.id };
}

function verificationRateLimitError(lockedUntil: Date): ApiError {
  const remainingMinutes = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000),
  );
  return new ApiError(
    429,
    'VERIFICATION_RATE_LIMITED',
    `Demasiados intentos. Inténtalo nuevamente en ${remainingMinutes} minuto${remainingMinutes === 1 ? '' : 's'}.`,
  );
}

function assertVerificationNotLocked(lockedUntil: Date | null): void {
  if (!lockedUntil || lockedUntil <= new Date()) return;
  throw verificationRateLimitError(lockedUntil);
}

async function createSession(database: DatabaseClient, userId: string) {
  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_DURATION_MS);
  await database.session.create({
    data: {
      expiresAt,
      lastActiveAt: now,
      tokenHash: hashOpaqueToken(token),
      userId,
    },
  });
  return { expiresAt: expiresAt.toISOString(), token };
}

async function issueVerificationCode({
  appEnvironment,
  database,
  email,
  fullName,
  marketingOptIn = false,
  passwordHash,
  privacyPolicyAccepted = false,
  registrationProfile,
  verificationMailer,
}: {
  readonly appEnvironment: ApiConfig['APP_ENV'];
  readonly database: DatabaseClient;
  readonly email: string;
  readonly fullName: string;
  readonly marketingOptIn?: boolean;
  readonly passwordHash: string;
  readonly privacyPolicyAccepted?: boolean;
  readonly registrationProfile?: RegistrationProfileDraft;
  readonly verificationMailer: VerificationMailer | null;
}) {
  const code = createVerificationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_DURATION_MS);
  const registrationData = registrationProfile
    ? {
        ...registrationProfile,
        businessNameKey: normalizeBusinessName(
          registrationProfile.businessName,
        ),
        phoneKey: normalizePhone(registrationProfile.phone),
      }
    : {};
  await database.pendingRegistration.upsert({
    create: {
      codeHash: hashOpaqueToken(code),
      email,
      expiresAt,
      fullName,
      marketingOptIn,
      passwordHash,
      privacyPolicyAccepted,
      ...registrationData,
    },
    update: {
      codeHash: hashOpaqueToken(code),
      expiresAt,
      failedAttempts: 0,
      fullName,
      lockedUntil: null,
      marketingOptIn,
      passwordHash,
      privacyPolicyAccepted,
      ...registrationData,
    },
    where: { email },
  });
  if (verificationMailer) await verificationMailer.send({ code, email });
  else if (appEnvironment !== 'local') {
    throw new ApiError(
      503,
      'VERIFICATION_DELIVERY_UNAVAILABLE',
      'El servicio de verificación por correo no está disponible.',
    );
  }
  return {
    developmentVerificationCode: appEnvironment === 'local' ? code : undefined,
    verificationExpiresAt: expiresAt.toISOString(),
  };
}

function getBearerToken(request: FastifyRequest): string {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
  }
  return token;
}

async function authenticate(database: DatabaseClient, request: FastifyRequest) {
  const token = getBearerToken(request);
  const now = new Date();
  const session = await database.session.findFirst({
    include: { user: true },
    where: {
      expiresAt: { gt: now },
      lastActiveAt: {
        gt: new Date(now.getTime() - SESSION_IDLE_DURATION_MS),
      },
      revokedAt: null,
      tokenHash: hashOpaqueToken(token),
      user: { deletedAt: null, suspendedAt: null },
    },
  });
  if (!session) {
    throw new ApiError(
      401,
      'INVALID_SESSION',
      'Tu sesión venció. Inicia sesión nuevamente.',
    );
  }
  await database.session.update({
    data: { lastActiveAt: now },
    where: { id: session.id },
  });
  return { session, token, user: session.user };
}

export async function buildApi({
  config,
  database = createDatabaseClient({ connectionString: config.DATABASE_URL }),
  googleMapsFetch,
  invitationMailer = null,
  platformAccessMailer = null,
  platformPaymentProvider,
  publicBookingMailer = null,
  recoveryMailer = null,
  verificationMailer = null,
}: BuildApiOptions) {
  const trustedProxyIps = config.API_TRUSTED_PROXY_IPS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: config.APP_ENV === 'production',
    requestTimeout: 30_000,
    trustProxy:
      config.API_TRUST_PROXY === 'true'
        ? trustedProxyIps.length > 0
          ? trustedProxyIps
          : config.APP_ENV === 'local'
        : false,
  });
  const authRateLimitBuckets = new Map<string, AuthRateLimitBucket>();
  const googleMapsRateLimitBuckets = new Map<string, AuthRateLimitBucket>();
  const authRateLimitWindowMs = config.AUTH_IP_RATE_LIMIT_WINDOW_SECONDS * 1000;
  const googleMaps = createGoogleMapsClient({
    apiKey: config.GOOGLE_MAPS_SERVER_API_KEY,
    fetchImplementation: googleMapsFetch,
  });
  const enforceGoogleMapsRateLimit = (
    userId: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const now = Date.now();
    const windowMs = config.GOOGLE_MAPS_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const key = `${userId}:${request.ip}`;
    if (
      !googleMapsRateLimitBuckets.has(key) &&
      googleMapsRateLimitBuckets.size >= MAX_AUTH_RATE_LIMIT_BUCKETS
    ) {
      for (const [bucketKey, stored] of googleMapsRateLimitBuckets) {
        if (stored.resetAt <= now) googleMapsRateLimitBuckets.delete(bucketKey);
      }
      if (googleMapsRateLimitBuckets.size >= MAX_AUTH_RATE_LIMIT_BUCKETS) {
        const oldestKey = googleMapsRateLimitBuckets.keys().next().value as
          string | undefined;
        if (oldestKey) googleMapsRateLimitBuckets.delete(oldestKey);
      }
    }
    const current = googleMapsRateLimitBuckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
    if (!current || current.resetAt <= now)
      googleMapsRateLimitBuckets.set(key, bucket);
    const allowed = bucket.count < config.GOOGLE_MAPS_RATE_LIMIT_MAX;
    if (allowed) bucket.count += 1;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000),
    );
    reply
      .header('x-ratelimit-limit', String(config.GOOGLE_MAPS_RATE_LIMIT_MAX))
      .header(
        'x-ratelimit-remaining',
        String(Math.max(0, config.GOOGLE_MAPS_RATE_LIMIT_MAX - bucket.count)),
      )
      .header('x-ratelimit-reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (!allowed) {
      reply.header('retry-after', String(retryAfterSeconds));
      throw new ApiError(
        429,
        'GOOGLE_MAPS_RATE_LIMITED',
        'Has realizado demasiadas búsquedas de ubicación. Espera un momento.',
      );
    }
  };
  await app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    strictTransportSecurity:
      config.APP_ENV === 'production'
        ? { includeSubDomains: true, maxAge: 31_536_000 }
        : false,
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/v1/auth/registration-availability', async (request) => {
    const input = registrationAvailabilitySchema.parse(request.body);
    const now = new Date();
    const email = input.email ? normalizeEmail(input.email) : null;
    const phoneKey = input.phone ? normalizePhone(input.phone) : null;
    const [existingUser, pendingEmail, profilePhone, pendingPhone, retention] =
      await Promise.all([
        email
          ? database.user.findUnique({
              select: { emailVerifiedAt: true, passwordHash: true },
              where: { email },
            })
          : null,
        email
          ? database.pendingRegistration.findFirst({
              select: { id: true },
              where: { email, expiresAt: { gt: now } },
            })
          : null,
        phoneKey
          ? database.userRegistrationProfile.findUnique({
              select: { userId: true },
              where: { phoneKey },
            })
          : null,
        phoneKey
          ? database.pendingRegistration.findFirst({
              select: { id: true },
              where: { expiresAt: { gt: now }, phoneKey },
            })
          : null,
        activeAccountDeletionRetention(database, { email, phoneKey }),
      ]);
    return {
      conflicts: {
        ...(email &&
        ((existingUser?.passwordHash && existingUser.emailVerifiedAt) ||
          pendingEmail ||
          retention?.email)
          ? { email: 'Ese correo ya está registrado.' }
          : {}),
        ...(phoneKey && (profilePhone || pendingPhone || retention?.phone)
          ? { phone: 'Ese número telefónico ya está registrado.' }
          : {}),
      },
    };
  });

  app.post('/v1/auth/register', async (request, reply) => {
    enforceAuthIpRateLimit({
      buckets: authRateLimitBuckets,
      limit: config.AUTH_REGISTER_RATE_LIMIT_MAX,
      reply,
      request,
      scope: 'register',
      windowMs: authRateLimitWindowMs,
    });
    const input = signUpSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const phoneKey = normalizePhone(input.phone);
    try {
      const retention = await activeAccountDeletionRetention(database, {
        email,
        phoneKey,
      });
      if (retention.email || retention.phone) {
        throw new ApiError(
          409,
          'ACCOUNT_DELETION_RETENTION_ACTIVE',
          'Estos datos estarán disponibles nuevamente 90 días después de eliminar la cuenta.',
        );
      }
      const passwordHash = await hashPassword(input.password);
      const existingUser = await database.user.findUnique({ where: { email } });
      if (existingUser?.passwordHash && existingUser.emailVerifiedAt) {
        throw new ApiError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'Ya existe una cuenta con ese correo.',
        );
      }
      const pendingRegistration = await database.pendingRegistration.findUnique(
        { where: { email } },
      );
      assertVerificationNotLocked(pendingRegistration?.lockedUntil ?? null);
      if (pendingRegistration && pendingRegistration.expiresAt > new Date()) {
        throw new ApiError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'Ese correo ya está registrado o pendiente de verificación.',
        );
      }
      await database.pendingRegistration.deleteMany({
        where: {
          email: { not: email },
          expiresAt: { lte: new Date() },
          phoneKey,
        },
      });
      const [duplicateProfile, duplicatePendingRegistration] =
        await Promise.all([
          database.userRegistrationProfile.findFirst({
            select: { phoneKey: true },
            where: { phoneKey },
          }),
          database.pendingRegistration.findFirst({
            select: { phoneKey: true },
            where: {
              email: { not: email },
              expiresAt: { gt: new Date() },
              phoneKey,
            },
          }),
        ]);
      const duplicate = duplicateProfile ?? duplicatePendingRegistration;
      if (duplicate) {
        throw duplicateRegistrationError(duplicate, phoneKey);
      }
      const verification = await issueVerificationCode({
        appEnvironment: config.APP_ENV,
        database,
        email,
        fullName: input.fullName.trim(),
        marketingOptIn: input.marketingOptIn,
        passwordHash,
        privacyPolicyAccepted: input.privacyPolicyAccepted,
        registrationProfile: {
          accountType:
            input.accountType === 'business'
              ? RegistrationAccountType.BUSINESS
              : RegistrationAccountType.PROFESSIONAL,
          businessName: input.businessName.trim(),
          city: input.city.trim(),
          closingTime: input.closingTime,
          countryCode: input.countryCode,
          openingTime: input.openingTime,
          phone: input.phone.trim(),
          timezone: input.timezone,
        },
        verificationMailer,
      });
      return reply.code(201).send({
        ...(verification.developmentVerificationCode
          ? {
              developmentVerificationCode:
                verification.developmentVerificationCode,
            }
          : {}),
        email,
        verificationExpiresAt: verification.verificationExpiresAt,
        verificationRequired: true,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'REGISTRATION_DATA_ALREADY_EXISTS',
          'El correo, teléfono o nombre del negocio ya está registrado.',
        );
      }
      throw error;
    }
  });

  app.post('/v1/auth/login', async (request, reply) => {
    enforceAuthIpRateLimit({
      buckets: authRateLimitBuckets,
      limit: config.AUTH_LOGIN_RATE_LIMIT_MAX,
      reply,
      request,
      scope: 'login',
      windowMs: authRateLimitWindowMs,
    });
    const input = signInSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { email: normalizeEmail(input.email) },
    });
    if (
      !user?.passwordHash ||
      user.deletedAt ||
      user.suspendedAt ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'El correo o la contraseña son incorrectos.',
      );
    }
    if (!user.emailVerifiedAt) {
      throw new ApiError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verifica tu correo antes de iniciar sesión.',
      );
    }
    if (passwordHashNeedsUpgrade(user.passwordHash)) {
      await database.user.update({
        data: { passwordHash: await hashPassword(input.password) },
        where: { id: user.id },
      });
    }
    return {
      session: await createSession(database, user.id),
      user: publicUser(user),
    };
  });

  app.post('/v1/auth/verify-email', async (request) => {
    const input = verifyEmailSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const outcome = await database.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.$queryRaw`
        SELECT "id"
        FROM "pending_registrations"
        WHERE "email" = ${email}
        FOR UPDATE
      `;
      const verification = await transaction.pendingRegistration.findUnique({
        where: { email },
      });
      if (!verification || verification.expiresAt <= now) {
        return { kind: 'invalid' as const, remainingAttempts: null };
      }
      if (verification.lockedUntil && verification.lockedUntil > now) {
        return {
          kind: 'locked' as const,
          lockedUntil: verification.lockedUntil,
        };
      }
      if (verification.codeHash !== hashOpaqueToken(input.code)) {
        const updated = await transaction.pendingRegistration.update({
          data: verification.lockedUntil
            ? { failedAttempts: 1, lockedUntil: null }
            : { failedAttempts: { increment: 1 } },
          where: { id: verification.id },
        });
        if (updated.failedAttempts >= MAX_VERIFICATION_ATTEMPTS) {
          const lockedUntil = new Date(
            now.getTime() + VERIFICATION_LOCK_DURATION_MS,
          );
          await transaction.pendingRegistration.update({
            data: { lockedUntil },
            where: { id: verification.id },
          });
          return { kind: 'locked' as const, lockedUntil };
        }
        return {
          kind: 'invalid' as const,
          remainingAttempts: MAX_VERIFICATION_ATTEMPTS - updated.failedAttempts,
        };
      }
      if (!verification.privacyPolicyAccepted) {
        throw new ApiError(
          400,
          'PRIVACY_POLICY_NOT_ACCEPTED',
          'Debes aceptar la Política de Privacidad antes de verificar tu cuenta.',
        );
      }
      const consumed = await transaction.pendingRegistration.deleteMany({
        where: {
          codeHash: verification.codeHash,
          id: verification.id,
        },
      });
      if (consumed.count !== 1) {
        return { kind: 'invalid' as const, remainingAttempts: null };
      }
      const registrationProfile = completeRegistrationProfile(verification);
      const user = await transaction.user.upsert({
        create: {
          email: verification.email,
          emailVerifiedAt: now,
          fullName: verification.fullName,
          passwordHash: verification.passwordHash,
          ...(registrationProfile ? { phone: registrationProfile.phone } : {}),
        },
        update: {
          emailVerifiedAt: now,
          fullName: verification.fullName,
          passwordHash: verification.passwordHash,
          ...(registrationProfile ? { phone: registrationProfile.phone } : {}),
        },
        where: { email: verification.email },
      });
      await transaction.privacyConsent.create({
        data: {
          policyVersion: config.PLATFORM_PRIVACY_POLICY_VERSION,
          userId: user.id,
        },
      });
      if (verification.marketingOptIn) {
        await transaction.marketingConsent.create({
          data: {
            policyVersion: config.PLATFORM_MARKETING_POLICY_VERSION,
            userId: user.id,
          },
        });
      }
      if (registrationProfile) {
        const {
          accountType,
          businessName,
          city,
          closingTime,
          countryCode,
          openingTime,
          timezone,
        } = registrationProfile;
        const profileData = {
          accountType,
          businessName,
          businessNameKey: normalizeBusinessName(businessName),
          city,
          closingTime,
          countryCode,
          openingTime,
          phoneKey: normalizePhone(registrationProfile.phone),
          timezone,
        };
        await transaction.userRegistrationProfile.upsert({
          create: { ...profileData, userId: user.id },
          update: profileData,
          where: { userId: user.id },
        });
      }
      return { kind: 'verified' as const, user };
    });
    if (outcome.kind === 'locked') {
      throw verificationRateLimitError(outcome.lockedUntil);
    }
    if (outcome.kind === 'invalid') {
      throw new ApiError(
        400,
        'INVALID_VERIFICATION_CODE',
        outcome.remainingAttempts === null
          ? 'El código no es válido o ya venció.'
          : `El código no es válido. Te quedan ${outcome.remainingAttempts} intento${outcome.remainingAttempts === 1 ? '' : 's'}.`,
      );
    }
    return {
      session: await createSession(database, outcome.user.id),
      user: publicUser(outcome.user),
    };
  });

  app.post('/v1/auth/resend-verification', async (request, reply) => {
    enforceAuthIpRateLimit({
      buckets: authRateLimitBuckets,
      limit: config.AUTH_RESEND_RATE_LIMIT_MAX,
      reply,
      request,
      scope: 'resend-verification',
      windowMs: authRateLimitWindowMs,
    });
    const { email: rawEmail } = resendVerificationSchema.parse(request.body);
    const email = normalizeEmail(rawEmail);
    const pendingRegistration = await database.pendingRegistration.findUnique({
      where: { email },
    });
    assertVerificationNotLocked(pendingRegistration?.lockedUntil ?? null);
    let developmentVerificationCode: string | undefined;
    let verificationExpiresAt = new Date(
      Date.now() + VERIFICATION_DURATION_MS,
    ).toISOString();
    if (pendingRegistration) {
      const registrationProfile =
        completeRegistrationProfile(pendingRegistration);
      const verification = await issueVerificationCode({
        appEnvironment: config.APP_ENV,
        database,
        email: pendingRegistration.email,
        fullName: pendingRegistration.fullName,
        marketingOptIn: pendingRegistration.marketingOptIn,
        passwordHash: pendingRegistration.passwordHash,
        privacyPolicyAccepted: pendingRegistration.privacyPolicyAccepted,
        ...(registrationProfile ? { registrationProfile } : {}),
        verificationMailer,
      });
      developmentVerificationCode = verification.developmentVerificationCode;
      verificationExpiresAt = verification.verificationExpiresAt;
    }
    return {
      ...(developmentVerificationCode ? { developmentVerificationCode } : {}),
      message: 'Si la cuenta está pendiente, recibirás un nuevo código.',
      verificationExpiresAt,
    };
  });

  app.get('/v1/auth/session', async (request) => {
    const { session, user } = await authenticate(database, request);
    return {
      session: { expiresAt: session.expiresAt.toISOString() },
      user: publicUser(user),
    };
  });

  app.get('/v1/account/marketing-preference', async (request) => {
    const { user } = await authenticate(database, request);
    const consent = await database.marketingConsent.findFirst({
      orderBy: { grantedAt: 'desc' },
      where: { userId: user.id, withdrawnAt: null },
    });
    return {
      consentedAt: consent?.grantedAt.toISOString() ?? null,
      policyVersion: consent?.policyVersion ?? null,
      subscribed: Boolean(consent),
    };
  });

  app.put('/v1/account/marketing-preference', async (request) => {
    const { user } = await authenticate(database, request);
    const { marketingOptIn } = marketingPreferenceSchema.parse(request.body);
    const now = new Date();
    if (marketingOptIn) {
      const activeConsent = await database.marketingConsent.findFirst({
        orderBy: { grantedAt: 'desc' },
        where: { userId: user.id, withdrawnAt: null },
      });
      const consent =
        activeConsent ??
        (await database.marketingConsent.create({
          data: {
            policyVersion: config.PLATFORM_MARKETING_POLICY_VERSION,
            userId: user.id,
          },
        }));
      return {
        consentedAt: consent.grantedAt.toISOString(),
        policyVersion: consent.policyVersion,
        subscribed: true,
      };
    }
    await database.marketingConsent.updateMany({
      data: { withdrawnAt: now },
      where: { userId: user.id, withdrawnAt: null },
    });
    return { consentedAt: null, policyVersion: null, subscribed: false };
  });

  app.get('/v1/account/closed-business-exports', async (request) => {
    const { user } = await authenticate(database, request);
    return {
      exports: await listClosedBusinessExports(database, user.id),
    };
  });

  app.get(
    '/v1/account/closed-business-exports/:organizationId',
    async (request) => {
      const { user } = await authenticate(database, request);
      const { organizationId } = closedBusinessExportParamsSchema.parse(
        request.params,
      );
      const { format } = closedBusinessExportQuerySchema.parse(request.query);
      return buildClosedBusinessExport({
        database,
        format,
        organizationId,
        userId: user.id,
      });
    },
  );

  app.post('/v1/auth/logout', async (request, reply) => {
    const { session } = await authenticate(database, request);
    await database.session.update({
      data: { revokedAt: new Date() },
      where: { id: session.id },
    });
    return reply.code(204).send();
  });

  app.delete('/v1/account', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = deleteAccountSchema.parse(request.body);
    if (
      !user.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new ApiError(
        401,
        'INVALID_ACCOUNT_PASSWORD',
        'La contraseña actual no es correcta.',
      );
    }

    const memberships = await database.membership.findMany({
      where: { userId: user.id },
    });
    const ownerOrganizationIds = memberships
      .filter(
        ({ role, status }) =>
          role === MembershipRole.OWNER && status === MembershipStatus.ACTIVE,
      )
      .map(({ organizationId }) => organizationId);
    const now = new Date();
    if (ownerOrganizationIds.length > 0) {
      const [activeCollaborators, openCashRegisters, futureAppointments] =
        await Promise.all([
          database.membership.count({
            where: {
              organizationId: { in: ownerOrganizationIds },
              status: MembershipStatus.ACTIVE,
              userId: { not: user.id },
            },
          }),
          database.cashRegisterSession.count({
            where: {
              organizationId: { in: ownerOrganizationIds },
              status: CashRegisterStatus.OPEN,
            },
          }),
          database.appointment.count({
            where: {
              organizationId: { in: ownerOrganizationIds },
              startsAt: { gte: now },
              status: {
                in: [
                  AppointmentStatus.AWAITING_CONFIRMATION,
                  AppointmentStatus.CHECKED_IN,
                  AppointmentStatus.CONFIRMED,
                  AppointmentStatus.IN_PROGRESS,
                  AppointmentStatus.PENDING_VERIFICATION,
                  AppointmentStatus.SCHEDULED,
                  AppointmentStatus.WAITING,
                ],
              },
            },
          }),
        ]);
      if (activeCollaborators > 0) {
        throw new ApiError(
          409,
          'ACCOUNT_HAS_ACTIVE_COLLABORATORS',
          'Retira a los colaboradores activos antes de borrar la cuenta del propietario.',
        );
      }
      if (openCashRegisters > 0) {
        throw new ApiError(
          409,
          'ACCOUNT_HAS_OPEN_CASH_REGISTER',
          'Cierra la caja abierta antes de borrar tu cuenta.',
        );
      }
      if (futureAppointments > 0) {
        throw new ApiError(
          409,
          'ACCOUNT_HAS_FUTURE_APPOINTMENTS',
          'Cancela o completa las citas futuras antes de borrar tu cuenta.',
        );
      }
    }

    const anonymizedEmail = `deleted-${user.id}@deleted.invalid`;
    const membershipIds = memberships.map(({ id }) => id);
    const retentionExpiresAt = new Date(
      now.getTime() + ACCOUNT_DELETION_RETENTION_MS,
    );
    const retainedIdentifierHashes = [
      accountDeletionIdentifierHash('email', user.email),
      ...(user.phone
        ? [accountDeletionIdentifierHash('phone', normalizePhone(user.phone))]
        : []),
    ];
    await database.$transaction(async (transaction) => {
      await transaction.accountDeletionRetention.createMany({
        data: retainedIdentifierHashes.map((identifierHash) => ({
          expiresAt: retentionExpiresAt,
          identifierHash,
          userId: user.id,
        })),
        skipDuplicates: true,
      });
      for (const membership of memberships) {
        await transaction.auditLog.create({
          data: {
            action: 'account.deleted',
            actorUserId: user.id,
            afterData: {
              deletedAt: now.toISOString(),
              organizationClosed: ownerOrganizationIds.includes(
                membership.organizationId,
              ),
              personalProfileAnonymized: true,
            },
            entityId: user.id,
            entityType: 'user_account',
            organizationId: membership.organizationId,
          },
        });
      }
      if (ownerOrganizationIds.length > 0) {
        await transaction.teamInvitation.updateMany({
          data: { status: InvitationStatus.REVOKED },
          where: {
            organizationId: { in: ownerOrganizationIds },
            status: InvitationStatus.PENDING,
          },
        });
        await transaction.location.updateMany({
          data: { isActive: false },
          where: { organizationId: { in: ownerOrganizationIds } },
        });
        await transaction.service.updateMany({
          data: { isActive: false, onlineBooking: false },
          where: { organizationId: { in: ownerOrganizationIds } },
        });
        await transaction.subscription.updateMany({
          data: { status: SubscriptionStatus.CANCELLED },
          where: { organizationId: { in: ownerOrganizationIds } },
        });
        await transaction.organization.updateMany({
          data: { deletedAt: now, status: OrganizationStatus.CANCELLED },
          where: { id: { in: ownerOrganizationIds } },
        });
        await transaction.membership.updateMany({
          data: { status: MembershipStatus.SUSPENDED },
          where: { organizationId: { in: ownerOrganizationIds } },
        });
      }
      if (membershipIds.length > 0) {
        await transaction.professionalService.deleteMany({
          where: { membershipId: { in: membershipIds } },
        });
        await transaction.commissionRule.updateMany({
          data: { effectiveTo: now, isActive: false },
          where: {
            isActive: true,
            professionalMembershipId: { in: membershipIds },
          },
        });
      }
      await transaction.membership.updateMany({
        data: { status: MembershipStatus.SUSPENDED },
        where: { userId: user.id },
      });
      await transaction.teamInvitation.updateMany({
        data: { email: anonymizedEmail },
        where: { email: user.email },
      });
      await transaction.pendingRegistration.deleteMany({
        where: { email: user.email },
      });
      await transaction.appNotification.deleteMany({
        where: { userId: user.id },
      });
      await transaction.marketingConsent.updateMany({
        data: { withdrawnAt: now },
        where: { userId: user.id, withdrawnAt: null },
      });
      await transaction.pushToken.deleteMany({ where: { userId: user.id } });
      await transaction.userPortfolioItem.deleteMany({
        where: { userId: user.id },
      });
      await transaction.onboardingCollaborator.deleteMany({
        where: { ownerUserId: user.id },
      });
      await transaction.onboardingService.deleteMany({
        where: { ownerUserId: user.id },
      });
      await transaction.userRegistrationProfile.deleteMany({
        where: { userId: user.id },
      });
      await transaction.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });
      await transaction.emailVerificationCode.deleteMany({
        where: { userId: user.id },
      });
      await transaction.session.deleteMany({ where: { userId: user.id } });
      await transaction.user.update({
        data: {
          deletedAt: now,
          email: anonymizedEmail,
          emailVerifiedAt: null,
          fullName: 'Cuenta eliminada',
          locale: 'es',
          passwordHash: null,
          phone: null,
          profileBio: null,
          profilePhotoData: null,
        },
        where: { id: user.id },
      });
    });
    return reply.code(204).send();
  });

  app.post('/v1/account/close-owned-business', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = closeOwnedBusinessSchema.parse(request.body);
    if (
      !user.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new ApiError(
        401,
        'INVALID_ACCOUNT_PASSWORD',
        'La contraseÃ±a actual no es correcta.',
      );
    }
    const [profile, memberships] = await Promise.all([
      database.userRegistrationProfile.findUnique({
        where: { userId: user.id },
      }),
      database.membership.findMany({
        where: { status: MembershipStatus.ACTIVE, userId: user.id },
      }),
    ]);
    if (profile?.accountType !== RegistrationAccountType.PROFESSIONAL) {
      throw new ApiError(
        409,
        'ACCOUNT_NOT_SOLO',
        'Cambia tu tipo de cuenta a Solo yo antes de cerrar tu barberÃ­a.',
      );
    }
    const organizationIds = memberships
      .filter(({ role }) => role === MembershipRole.OWNER)
      .map(({ organizationId }) => organizationId);
    if (organizationIds.length === 0) {
      throw new ApiError(
        409,
        'NO_ACTIVE_OWNED_BUSINESS',
        'No tienes una barberÃ­a activa para cerrar.',
      );
    }
    const now = new Date();
    const [
      activeCollaborators,
      pendingInvitations,
      openCashRegisters,
      futureAppointments,
    ] = await Promise.all([
      database.membership.count({
        where: {
          organizationId: { in: organizationIds },
          status: MembershipStatus.ACTIVE,
          userId: { not: user.id },
        },
      }),
      database.teamInvitation.count({
        where: {
          organizationId: { in: organizationIds },
          status: InvitationStatus.PENDING,
        },
      }),
      database.cashRegisterSession.count({
        where: {
          organizationId: { in: organizationIds },
          status: CashRegisterStatus.OPEN,
        },
      }),
      database.appointment.count({
        where: {
          organizationId: { in: organizationIds },
          startsAt: { gte: now },
          status: {
            in: [
              AppointmentStatus.AWAITING_CONFIRMATION,
              AppointmentStatus.CHECKED_IN,
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.IN_PROGRESS,
              AppointmentStatus.PENDING_VERIFICATION,
              AppointmentStatus.SCHEDULED,
              AppointmentStatus.WAITING,
            ],
          },
        },
      }),
    ]);
    if (activeCollaborators > 0)
      throw new ApiError(
        409,
        'ACCOUNT_HAS_ACTIVE_COLLABORATORS',
        'Retira a los colaboradores activos antes de cerrar tu barberÃ­a.',
      );
    if (pendingInvitations > 0)
      throw new ApiError(
        409,
        'ACCOUNT_HAS_PENDING_INVITATIONS',
        'Cancela las invitaciones pendientes antes de cerrar tu barberÃ­a.',
      );
    if (openCashRegisters > 0)
      throw new ApiError(
        409,
        'ACCOUNT_HAS_OPEN_CASH_REGISTER',
        'Cierra la caja abierta antes de cerrar tu barberÃ­a.',
      );
    if (futureAppointments > 0)
      throw new ApiError(
        409,
        'ACCOUNT_HAS_FUTURE_APPOINTMENTS',
        'Cancela o completa las citas futuras antes de cerrar tu barberÃ­a.',
      );
    await database.$transaction(async (transaction) => {
      await transaction.auditLog.create({
        data: {
          action: 'account.owned_business_closed',
          actorUserId: user.id,
          afterData: {
            closedAt: now.toISOString(),
            personalAccountRetained: true,
          },
          entityId: user.id,
          entityType: 'user_account',
          organizationId: organizationIds[0]!,
        },
      });
      await transaction.location.updateMany({
        data: { isActive: false },
        where: { organizationId: { in: organizationIds } },
      });
      await transaction.service.updateMany({
        data: { isActive: false, onlineBooking: false },
        where: { organizationId: { in: organizationIds } },
      });
      await transaction.subscription.updateMany({
        data: { status: SubscriptionStatus.CANCELLED },
        where: { organizationId: { in: organizationIds } },
      });
      await transaction.organization.updateMany({
        data: { deletedAt: now, status: OrganizationStatus.CANCELLED },
        where: { id: { in: organizationIds } },
      });
      await transaction.commissionRule.updateMany({
        data: { effectiveTo: now, isActive: false },
        where: {
          isActive: true,
          professionalMembershipId: { in: memberships.map(({ id }) => id) },
        },
      });
      await transaction.professionalService.deleteMany({
        where: { membershipId: { in: memberships.map(({ id }) => id) } },
      });
      await transaction.membership.updateMany({
        data: { status: MembershipStatus.SUSPENDED },
        where: { organizationId: { in: organizationIds } },
      });
    });
    return reply.code(204).send();
  });

  app.post('/v1/auth/recover', async (request, reply) => {
    enforceAuthIpRateLimit({
      buckets: authRateLimitBuckets,
      limit: config.AUTH_RECOVER_RATE_LIMIT_MAX,
      reply,
      request,
      scope: 'recover',
      windowMs: authRateLimitWindowMs,
    });
    const { email } = recoverAccessSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
    let developmentResetToken: string | undefined;
    if (user && !user.deletedAt && !user.suspendedAt) {
      const token = createOpaqueToken();
      await database.passwordResetToken.create({
        data: {
          expiresAt: new Date(Date.now() + RESET_DURATION_MS),
          tokenHash: hashOpaqueToken(token),
          userId: user.id,
        },
      });
      const separator = config.MOBILE_RESET_URL.includes('?') ? '&' : '?';
      const resetUrl = `${config.MOBILE_RESET_URL}${separator}token=${encodeURIComponent(token)}`;
      if (recoveryMailer)
        await recoveryMailer.send({ email: user.email, resetUrl });
      else if (config.APP_ENV === 'local') developmentResetToken = token;
    }
    return {
      ...(developmentResetToken ? { developmentResetToken } : {}),
      message:
        'Si la cuenta existe, recibirás un enlace para cambiar la contraseña.',
    };
  });

  app.post('/v1/auth/reset-password', async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    const resetToken = await database.passwordResetToken.findFirst({
      include: { user: true },
      where: {
        expiresAt: { gt: new Date() },
        tokenHash: hashOpaqueToken(input.token),
        usedAt: null,
      },
    });
    if (!resetToken) {
      throw new ApiError(
        400,
        'INVALID_RESET_TOKEN',
        'El enlace de recuperación no es válido o ya venció.',
      );
    }
    const passwordHash = await hashPassword(input.password);
    await database.$transaction([
      database.user.update({
        data: { passwordHash },
        where: { id: resetToken.userId },
      }),
      database.passwordResetToken.update({
        data: { usedAt: new Date() },
        where: { id: resetToken.id },
      }),
      database.session.updateMany({
        data: { revokedAt: new Date() },
        where: { revokedAt: null, userId: resetToken.userId },
      }),
    ]);
    return reply.code(204).send();
  });

  app.post('/v1/maps/autocomplete', async (request, reply) => {
    const { user } = await authenticate(database, request);
    enforceGoogleMapsRateLimit(user.id, request, reply);
    const input = mapsAutocompleteSchema.parse(request.body);
    return { suggestions: await googleMaps.autocomplete(input) };
  });

  app.post('/v1/maps/place-details', async (request, reply) => {
    const { user } = await authenticate(database, request);
    enforceGoogleMapsRateLimit(user.id, request, reply);
    const input = mapsPlaceDetailsSchema.parse(request.body);
    return {
      location: await googleMaps.placeDetails(
        input.placeId,
        input.sessionToken,
      ),
    };
  });

  app.post('/v1/maps/reverse-geocode', async (request, reply) => {
    const { user } = await authenticate(database, request);
    enforceGoogleMapsRateLimit(user.id, request, reply);
    const input = mapsReverseGeocodeSchema.parse(request.body);
    return {
      location: await googleMaps.reverseGeocode(
        input.latitude,
        input.longitude,
      ),
    };
  });

  app.put('/v1/business-location', async (request) => {
    const { user } = await authenticate(database, request);
    const input = updateBusinessLocationSchema.parse(request.body);
    const membership = await database.membership.findFirst({
      include: {
        memberLocations: { include: { location: true }, take: 1 },
      },
      where: { status: MembershipStatus.ACTIVE, userId: user.id },
    });
    const currentLocation = membership?.memberLocations[0]?.location;
    if (!membership || !currentLocation)
      throw new ApiError(
        404,
        'BUSINESS_LOCATION_NOT_FOUND',
        'No encontramos una sucursal activa para tu cuenta.',
      );
    if (
      membership.role !== MembershipRole.OWNER &&
      membership.role !== MembershipRole.MANAGER
    )
      throw new ApiError(
        403,
        'BUSINESS_LOCATION_FORBIDDEN',
        'No tienes permiso para modificar la ubicación del negocio.',
      );

    const updated = await database.$transaction(async (transaction) => {
      const location = await transaction.location.update({
        data: {
          addressLine: input.addressLine,
          city: input.city ?? currentLocation.city,
          countryCode: input.countryCode ?? currentLocation.countryCode,
          formattedAddress: input.formattedAddress,
          googlePlaceId: input.googlePlaceId ?? null,
          latitude: input.latitude,
          longitude: input.longitude,
        },
        where: { id: currentLocation.id },
      });
      if (membership.role === MembershipRole.OWNER)
        await transaction.userRegistrationProfile.updateMany({
          data: {
            addressLine: input.addressLine,
            ...(input.city ? { city: input.city } : {}),
            ...(input.countryCode ? { countryCode: input.countryCode } : {}),
          },
          where: { userId: user.id },
        });
      await transaction.auditLog.create({
        data: {
          action: 'location.map_updated',
          actorUserId: user.id,
          afterData: {
            formattedAddress: location.formattedAddress,
            googlePlaceId: location.googlePlaceId,
            latitude: location.latitude,
            longitude: location.longitude,
          },
          beforeData: {
            formattedAddress: currentLocation.formattedAddress,
            googlePlaceId: currentLocation.googlePlaceId,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          entityId: location.id,
          entityType: 'location',
          locationId: location.id,
          organizationId: membership.organizationId,
        },
      });
      return location;
    });
    return {
      location: {
        addressLine: updated.addressLine,
        city: updated.city,
        countryCode: updated.countryCode,
        formattedAddress: updated.formattedAddress,
        googlePlaceId: updated.googlePlaceId,
        latitude: updated.latitude,
        longitude: updated.longitude,
      },
    };
  });

  app.get('/v1/onboarding/account-details', async (request) => {
    const { user } = await authenticate(database, request);
    const [profile, membership] = await Promise.all([
      database.userRegistrationProfile.findUnique({
        where: { userId: user.id },
      }),
      database.membership.findFirst({
        include: {
          memberLocations: {
            select: {
              location: {
                select: {
                  addressLine: true,
                  city: true,
                  countryCode: true,
                  formattedAddress: true,
                  googlePlaceId: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
            take: 1,
          },
          organization: { select: { publicBookingToken: true, slug: true } },
        },
        where: { status: MembershipStatus.ACTIVE, userId: user.id },
      }),
    ]);
    const businessLocation = membership?.memberLocations[0]?.location ?? null;
    return {
      accountType: profile
        ? (profile.accountType.toLowerCase() as 'business' | 'professional')
        : null,
      canCloseOwnedBusiness:
        profile?.accountType === RegistrationAccountType.PROFESSIONAL &&
        membership?.role === MembershipRole.OWNER,
      addressLine: profile?.addressLine ?? null,
      businessName: profile?.businessName ?? null,
      businessLocation,
      bookingUrl:
        profile && membership
          ? publicBookingUrl(
              config.PUBLIC_WEB_URL,
              membership?.organization.publicBookingToken ??
                createSlug(profile.businessName).slice(0, 80),
            )
          : null,
      city: profile?.city ?? null,
      closingTime: profile?.closingTime ?? null,
      coverImageUri: profile?.coverImageUri ?? null,
      countryCode: profile?.countryCode ?? null,
      description: profile?.description ?? null,
      email: user.email,
      fullName: user.fullName,
      facebookUrl: profile?.facebookUrl ?? null,
      openingTime: profile?.openingTime ?? null,
      phone: user.phone,
      timezone: profile?.timezone ?? null,
      instagramUrl: profile?.instagramUrl ?? null,
      onboardingCompletedAt:
        profile?.onboardingCompletedAt?.toISOString() ?? null,
    };
  });

  app.patch('/v1/onboarding/account-details', async (request) => {
    const { user } = await authenticate(database, request);
    const input = updateOnboardingAccountDetailsSchema.parse(request.body);
    const existingProfile = await database.userRegistrationProfile.findUnique({
      where: { userId: user.id },
    });
    if (!existingProfile) {
      throw new ApiError(
        404,
        'ONBOARDING_ACCOUNT_DETAILS_NOT_FOUND',
        'No encontramos la informaci\u00f3n de tu cuenta.',
      );
    }

    try {
      const activeMembership = await database.membership.findFirst({
        include: {
          memberLocations: { select: { locationId: true }, take: 1 },
          organization: { select: { publicBookingToken: true, slug: true } },
        },
        where: { status: MembershipStatus.ACTIVE, userId: user.id },
      });
      const [updatedUser, updatedProfile] = await database.$transaction(
        async (transaction) => {
          const updatedUserRecord = await transaction.user.update({
            data: { phone: input.phone },
            where: { id: user.id },
          });
          const updatedProfileRecord =
            await transaction.userRegistrationProfile.update({
              data: {
                addressLine: input.addressLine,
                businessName: input.businessName,
                businessNameKey: normalizeBusinessName(input.businessName),
                city: input.city,
                countryCode: input.countryCode,
                coverImageUri: input.coverImageUri,
                description: input.description,
                facebookUrl: input.facebookUrl,
                instagramUrl: input.instagramUrl,
                phoneKey: normalizePhone(input.phone),
                timezone: input.timezone,
              },
              where: { userId: user.id },
            });
          if (activeMembership) {
            await transaction.organization.update({
              data: {
                defaultTimezone: input.timezone,
                name: input.businessName,
              },
              where: { id: activeMembership.organizationId },
            });
            const locationId =
              activeMembership.memberLocations[0]?.locationId ?? null;
            if (locationId) {
              await transaction.location.update({
                data: {
                  addressLine: input.addressLine,
                  city: input.city,
                  countryCode: input.countryCode,
                  phone: input.phone,
                  timezone: input.timezone,
                  whatsappPhone: input.phone,
                },
                where: { id: locationId },
              });
            }
          }
          return [updatedUserRecord, updatedProfileRecord] as const;
        },
      );
      return {
        accountType: updatedProfile.accountType.toLowerCase() as
          'business' | 'professional',
        addressLine: updatedProfile.addressLine,
        businessName: updatedProfile.businessName,
        bookingUrl: publicBookingUrl(
          config.PUBLIC_WEB_URL,
          activeMembership?.organization.publicBookingToken ??
            createSlug(updatedProfile.businessName).slice(0, 80),
        ),
        city: updatedProfile.city,
        closingTime: updatedProfile.closingTime,
        coverImageUri: updatedProfile.coverImageUri,
        countryCode: updatedProfile.countryCode,
        description: updatedProfile.description,
        email: updatedUser.email,
        facebookUrl: updatedProfile.facebookUrl,
        fullName: updatedUser.fullName,
        instagramUrl: updatedProfile.instagramUrl,
        onboardingCompletedAt:
          updatedProfile.onboardingCompletedAt?.toISOString() ?? null,
        openingTime: updatedProfile.openingTime,
        phone: updatedUser.phone,
        timezone: updatedProfile.timezone,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'ONBOARDING_ACCOUNT_DETAILS_ALREADY_EXISTS',
          'El nombre del negocio o tel\u00e9fono ya est\u00e1 registrado.',
        );
      }
      throw error;
    }
  });

  app.patch('/v1/onboarding/account-type', async (request) => {
    const { user } = await authenticate(database, request);
    const input = updateAccountTypeSchema.parse(request.body);
    const [profile, membership] = await Promise.all([
      database.userRegistrationProfile.findUnique({
        where: { userId: user.id },
      }),
      database.membership.findFirst({
        where: { status: MembershipStatus.ACTIVE, userId: user.id },
      }),
    ]);
    if (!profile || !membership) {
      throw new ApiError(
        404,
        'ACCOUNT_TYPE_NOT_AVAILABLE',
        'No encontramos una cuenta activa para actualizar.',
      );
    }
    if (membership.role !== MembershipRole.OWNER) {
      throw new ApiError(
        403,
        'ACCOUNT_TYPE_OWNER_REQUIRED',
        'Solo el propietario puede cambiar el tipo de cuenta.',
      );
    }
    const nextType =
      input.accountType === 'business'
        ? RegistrationAccountType.BUSINESS
        : RegistrationAccountType.PROFESSIONAL;
    if (profile.accountType === nextType) {
      return { accountType: input.accountType };
    }
    if (nextType === RegistrationAccountType.PROFESSIONAL) {
      const [otherMembers, pendingInvitations, locations] = await Promise.all([
        database.membership.count({
          where: {
            id: { not: membership.id },
            organizationId: membership.organizationId,
            status: MembershipStatus.ACTIVE,
          },
        }),
        database.teamInvitation.count({
          where: {
            organizationId: membership.organizationId,
            status: 'PENDING',
          },
        }),
        database.location.count({
          where: { isActive: true, organizationId: membership.organizationId },
        }),
      ]);
      if (otherMembers > 0 || pendingInvitations > 0 || locations > 1) {
        throw new ApiError(
          409,
          'PROFESSIONAL_ACCOUNT_REQUIRES_SOLO_OPERATION',
          'Para cambiar a Solo yo, primero retira los colaboradores activos, cancela las invitaciones pendientes y conserva una sola sucursal.',
        );
      }
    }
    await database.$transaction([
      database.userRegistrationProfile.update({
        data: { accountType: nextType },
        where: { userId: user.id },
      }),
      database.auditLog.create({
        data: {
          action: 'account_type.updated',
          actorUserId: user.id,
          afterData: { accountType: input.accountType },
          beforeData: { accountType: profile.accountType.toLowerCase() },
          entityId: membership.id,
          entityType: 'membership',
          organizationId: membership.organizationId,
        },
      }),
    ]);
    return { accountType: input.accountType };
  });

  app.post('/v1/onboarding/complete-account-setup', async (request) => {
    const { user } = await authenticate(database, request);
    return database.$transaction(async (transaction) => {
      const profile = await transaction.userRegistrationProfile.findUnique({
        where: { userId: user.id },
      });
      if (!profile) {
        throw new ApiError(
          404,
          'ONBOARDING_ACCOUNT_DETAILS_NOT_FOUND',
          'No encontramos la informaci\u00f3n de tu cuenta.',
        );
      }

      const existingMembership = await transaction.membership.findFirst({
        include: {
          memberLocations: { select: { locationId: true }, take: 1 },
          organization: { select: { publicBookingToken: true, slug: true } },
        },
        where: { status: MembershipStatus.ACTIVE, userId: user.id },
      });
      if (existingMembership) {
        const completedProfile =
          await transaction.userRegistrationProfile.update({
            data: {
              onboardingCompletedAt:
                profile.onboardingCompletedAt ?? new Date(),
            },
            where: { userId: user.id },
          });
        return {
          bookingUrl: publicBookingUrl(
            config.PUBLIC_WEB_URL,
            existingMembership.organization.publicBookingToken,
          ),
          locationId: existingMembership.memberLocations[0]?.locationId ?? null,
          onboardingCompletedAt:
            completedProfile.onboardingCompletedAt!.toISOString(),
          organizationId: existingMembership.organizationId,
        };
      }

      const onboardingServices = await transaction.onboardingService.findMany({
        orderBy: { createdAt: 'asc' },
        where: { ownerUserId: user.id },
      });
      if (onboardingServices.length === 0) {
        throw new ApiError(
          400,
          'ONBOARDING_SERVICES_REQUIRED',
          'Agrega al menos un servicio antes de finalizar.',
        );
      }

      const baseSlug =
        createSlug(profile.businessName).slice(0, 72) ||
        `negocio-${user.id.slice(0, 8)}`;
      const matchingOrganizations = await transaction.organization.findMany({
        select: { slug: true },
        where: { slug: { startsWith: baseSlug } },
      });
      const reservedSlugs = new Set(
        matchingOrganizations.map((organization) => organization.slug),
      );
      let organizationSlug = baseSlug;
      let suffix = 2;
      while (reservedSlugs.has(organizationSlug)) {
        organizationSlug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }

      const organization = await transaction.organization.create({
        data: {
          currencyCode: 'USD',
          defaultTimezone: profile.timezone,
          name: profile.businessName,
          slug: organizationSlug,
        },
      });
      const location = await transaction.location.create({
        data: {
          addressLine: profile.addressLine,
          city: profile.city,
          countryCode: profile.countryCode,
          currencyCode: 'USD',
          email: user.email,
          name: 'Principal',
          organizationId: organization.id,
          phone: user.phone ?? profile.phoneKey,
          slug: 'principal',
          timezone: profile.timezone,
          whatsappPhone: user.phone ?? profile.phoneKey,
        },
      });
      const membership = await transaction.membership.create({
        data: {
          organizationId: organization.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
          userId: user.id,
        },
      });
      await transaction.memberLocation.create({
        data: { locationId: location.id, membershipId: membership.id },
      });

      const startMinute = minuteForRegistrationTime(profile.openingTime, 540);
      const requestedEndMinute = minuteForRegistrationTime(
        profile.closingTime,
        1080,
      );
      const endMinute =
        requestedEndMinute > startMinute
          ? requestedEndMinute
          : Math.min(startMinute + 60, 1440);
      const weeklyDays = Array.from({ length: 7 }, (_, weekday) => ({
        endMinute,
        locationId: location.id,
        startMinute,
        weekday,
      }));
      await transaction.businessWeeklySchedule.createMany({
        data: weeklyDays.map((day) => ({
          ...day,
          isOpen: true,
          organizationId: organization.id,
        })),
      });
      await transaction.weeklySchedule.createMany({
        data: weeklyDays.map((day) => ({
          ...day,
          membershipId: membership.id,
        })),
      });

      const categoryIds = new Map<string, string>();
      for (const draft of onboardingServices) {
        const categoryName = draft.categoryName?.trim() || null;
        let categoryId: string | null = null;
        if (categoryName) {
          const knownCategoryId = categoryIds.get(categoryName);
          if (knownCategoryId) {
            categoryId = knownCategoryId;
          } else {
            const category = await transaction.serviceCategory.create({
              data: {
                name: categoryName,
                organizationId: organization.id,
                sortOrder: categoryIds.size,
              },
            });
            categoryId = category.id;
            categoryIds.set(categoryName, category.id);
          }
        }
        const service = await transaction.service.create({
          data: {
            categoryId,
            description: draft.description,
            durationMinutes: draft.durationMinutes,
            name: draft.name,
            onlineBooking: draft.onlineBooking,
            organizationId: organization.id,
            priceCents: draft.priceCents,
          },
        });
        await transaction.professionalService.create({
          data: {
            locationId: location.id,
            membershipId: membership.id,
            serviceId: service.id,
          },
        });
      }

      await transaction.onboardingService.deleteMany({
        where: { ownerUserId: user.id },
      });
      await transaction.onboardingCollaborator.deleteMany({
        where: { ownerUserId: user.id },
      });
      const completedProfile = await transaction.userRegistrationProfile.update(
        {
          data: { onboardingCompletedAt: new Date() },
          where: { userId: user.id },
        },
      );
      await transaction.auditLog.create({
        data: {
          action: 'onboarding.account_setup_completed',
          actorUserId: user.id,
          afterData: {
            accountType: profile.accountType,
            locationId: location.id,
            organizationId: organization.id,
            servicesCreated: onboardingServices.length,
          },
          entityId: organization.id,
          entityType: 'organization',
          locationId: location.id,
          organizationId: organization.id,
        },
      });
      return {
        bookingUrl: publicBookingUrl(
          config.PUBLIC_WEB_URL,
          organization.publicBookingToken,
        ),
        locationId: location.id,
        onboardingCompletedAt:
          completedProfile.onboardingCompletedAt!.toISOString(),
        organizationId: organization.id,
      };
    });
  });
  app.get('/v1/onboarding/collaborators', async (request) => {
    const { user } = await authenticate(database, request);
    const collaborators = await database.onboardingCollaborator.findMany({
      orderBy: { createdAt: 'asc' },
      where: { ownerUserId: user.id },
    });
    return {
      collaborators: collaborators.map(publicOnboardingCollaborator),
    };
  });

  app.post('/v1/onboarding/collaborators', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createOnboardingCollaboratorSchema.parse(request.body);
    const collaborator = await database.onboardingCollaborator.create({
      data: {
        ...onboardingCollaboratorData(input),
        ownerUserId: user.id,
      },
    });
    return reply
      .code(201)
      .send({ collaborator: publicOnboardingCollaborator(collaborator) });
  });

  app.patch('/v1/onboarding/collaborators/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingCollaboratorParamsSchema.parse(request.params);
    const input = updateOnboardingCollaboratorSchema.parse(request.body);
    const existing = await database.onboardingCollaborator.findFirst({
      where: { id, ownerUserId: user.id },
    });
    if (!existing)
      throw new ApiError(
        404,
        'ONBOARDING_COLLABORATOR_NOT_FOUND',
        'El colaborador no existe.',
      );
    const collaborator = await database.onboardingCollaborator.update({
      data: onboardingCollaboratorData(input),
      where: { id: existing.id },
    });
    return { collaborator: publicOnboardingCollaborator(collaborator) };
  });

  app.delete('/v1/onboarding/collaborators/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingCollaboratorParamsSchema.parse(request.params);
    const existing = await database.onboardingCollaborator.findFirst({
      where: { id, ownerUserId: user.id },
    });
    if (!existing)
      throw new ApiError(
        404,
        'ONBOARDING_COLLABORATOR_NOT_FOUND',
        'El colaborador no existe.',
      );
    await database.onboardingCollaborator.delete({
      where: { id: existing.id },
    });
    return reply.code(204).send();
  });

  app.get('/v1/onboarding/services', async (request) => {
    const { user } = await authenticate(database, request);
    const services = await database.onboardingService.findMany({
      orderBy: { createdAt: 'asc' },
      where: { ownerUserId: user.id },
    });
    return { services: services.map(publicOnboardingService) };
  });

  app.post('/v1/onboarding/services', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createOnboardingServiceSchema.parse(request.body);
    const service = await database.onboardingService.create({
      data: { ...onboardingServiceData(input), ownerUserId: user.id },
    });
    return reply.code(201).send({ service: publicOnboardingService(service) });
  });

  app.patch('/v1/onboarding/services/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingServiceParamsSchema.parse(request.params);
    const input = updateOnboardingServiceSchema.parse(request.body);
    const existing = await database.onboardingService.findFirst({
      where: { id, ownerUserId: user.id },
    });
    if (!existing)
      throw new ApiError(
        404,
        'ONBOARDING_SERVICE_NOT_FOUND',
        'El servicio no existe.',
      );
    const service = await database.onboardingService.update({
      data: onboardingServiceData(input),
      where: { id: existing.id },
    });
    return { service: publicOnboardingService(service) };
  });

  app.delete('/v1/onboarding/services/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingServiceParamsSchema.parse(request.params);
    const existing = await database.onboardingService.findFirst({
      where: { id, ownerUserId: user.id },
    });
    if (!existing)
      throw new ApiError(
        404,
        'ONBOARDING_SERVICE_NOT_FOUND',
        'El servicio no existe.',
      );
    await database.onboardingService.delete({ where: { id: existing.id } });
    return reply.code(204).send();
  });

  app.post('/v1/onboarding', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = completeOnboardingSchema.parse(request.body);
    try {
      const result = await database.$transaction(async (transaction) => {
        const existingMembership = await transaction.membership.findFirst({
          where: { status: MembershipStatus.ACTIVE, userId: user.id },
        });
        if (existingMembership) {
          throw new ApiError(
            409,
            'ONBOARDING_ALREADY_COMPLETED',
            'Tu cuenta ya pertenece a una barbería.',
          );
        }
        const organization = await transaction.organization.create({
          data: {
            currencyCode: input.location.currencyCode,
            defaultTimezone: input.location.timezone,
            name: input.name,
            slug: input.slug,
          },
        });
        const location = await transaction.location.create({
          data: {
            addressLine: input.location.addressLine || null,
            city: input.location.city || null,
            countryCode: input.location.countryCode,
            currencyCode: input.location.currencyCode,
            email: input.location.email || null,
            name: input.location.name,
            organizationId: organization.id,
            phone: input.location.phone,
            slug: input.location.slug,
            timezone: input.location.timezone,
            whatsappPhone: input.location.whatsappPhone,
          },
        });
        const membership = await transaction.membership.create({
          data: {
            organizationId: organization.id,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            userId: user.id,
          },
        });
        await transaction.memberLocation.create({
          data: { locationId: location.id, membershipId: membership.id },
        });
        const registrationProfile =
          await transaction.userRegistrationProfile.findUnique({
            where: { userId: user.id },
          });
        const startMinute = minuteForRegistrationTime(
          registrationProfile?.openingTime,
          540,
        );
        const endMinuteCandidate = minuteForRegistrationTime(
          registrationProfile?.closingTime,
          1080,
        );
        const endMinute =
          endMinuteCandidate > startMinute
            ? endMinuteCandidate
            : startMinute + 60;
        await transaction.businessWeeklySchedule.createMany({
          data: Array.from({ length: 7 }, (_, weekday) => ({
            endMinute,
            isOpen: true,
            locationId: location.id,
            organizationId: organization.id,
            startMinute,
            weekday,
          })),
        });
        await transaction.auditLog.create({
          data: {
            action: 'onboarding.completed',
            actorUserId: user.id,
            afterData: {
              locationId: location.id,
              organizationId: organization.id,
            },
            entityId: organization.id,
            entityType: 'organization',
            locationId: location.id,
            organizationId: organization.id,
          },
        });
        await ensureOrganizationSubscription(transaction, organization.id);
        return { locationId: location.id, organizationId: organization.id };
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'SLUG_ALREADY_EXISTS',
          'Ese enlace ya está en uso. Elige otro identificador.',
        );
      }
      throw error;
    }
  });

  app.get('/v1/organizations/current', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await database.membership.findFirst({
      include: {
        memberLocations: { include: { location: true }, take: 1 },
        organization: true,
      },
      where: { status: MembershipStatus.ACTIVE, userId: user.id },
    });
    if (!membership) return { organization: null };
    const location = membership.memberLocations[0]?.location ?? null;
    return {
      location,
      membership: {
        id: membership.id,
        role: membership.role.toLowerCase(),
        status: membership.status.toLowerCase(),
      },
      organization: membership.organization,
    };
  });

  const appointmentNotifier = createQueuedAppointmentNotifier(database, config);

  registerOperationsRoutes(
    app,
    database,
    authenticate,
    invitationMailer,
    config,
    platformAccessMailer,
    async (pendingRegistrationId) => {
      const pendingRegistration = await database.pendingRegistration.findUnique(
        {
          where: { id: pendingRegistrationId },
        },
      );
      if (!pendingRegistration)
        throw new ApiError(
          404,
          'PENDING_REGISTRATION_NOT_FOUND',
          'El registro pendiente ya no existe.',
        );
      assertVerificationNotLocked(pendingRegistration.lockedUntil);
      const registrationProfile =
        completeRegistrationProfile(pendingRegistration);
      const verification = await issueVerificationCode({
        appEnvironment: config.APP_ENV,
        database,
        email: pendingRegistration.email,
        fullName: pendingRegistration.fullName,
        passwordHash: pendingRegistration.passwordHash,
        ...(registrationProfile ? { registrationProfile } : {}),
        verificationMailer,
      });
      return { verificationExpiresAt: verification.verificationExpiresAt };
    },
    async (userId) => {
      const user = await database.user.findFirst({
        where: { deletedAt: null, id: userId, suspendedAt: null },
      });
      if (!user) {
        throw new ApiError(
          404,
          'PLATFORM_USER_NOT_FOUND',
          'La cuenta no está disponible.',
        );
      }
      const token = createOpaqueToken();
      await database.passwordResetToken.create({
        data: {
          expiresAt: new Date(Date.now() + RESET_DURATION_MS),
          tokenHash: hashOpaqueToken(token),
          userId: user.id,
        },
      });
      const separator = config.MOBILE_RESET_URL.includes('?') ? '&' : '?';
      const resetUrl = `${config.MOBILE_RESET_URL}${separator}token=${encodeURIComponent(token)}`;
      if (recoveryMailer) {
        await recoveryMailer.send({ email: user.email, resetUrl });
      } else if (config.APP_ENV !== 'local') {
        throw new ApiError(
          503,
          'PASSWORD_RECOVERY_DELIVERY_UNAVAILABLE',
          'El correo de recuperación no está disponible.',
        );
      }
    },
  );
  registerAgendaRoutes(app, database, authenticate);
  registerPublicBookingRoutes(
    app,
    database,
    authenticate,
    publicBookingMailer,
    appointmentNotifier,
    config.APP_ENV,
    config.PUBLIC_WEB_URL,
    config,
  );
  registerNotificationRoutes(app, database, authenticate);
  registerBusinessScheduleRoutes(app, database, authenticate);
  registerClientRoutes(app, database, authenticate);
  registerInventoryRoutes(app, database, authenticate);
  registerCashRegisterRoutes(app, database, authenticate);
  registerCommissionRoutes(app, database, authenticate);
  registerProfileRoutes(app, database, authenticate);
  registerPayphoneRoutes(app, database, authenticate, config);
  registerSubscriptionPaymentRoutes(
    app,
    database,
    authenticate,
    config,
    platformPaymentProvider,
  );
  registerSriBillingRoutes(app, database, authenticate, config);
  registerProductOrderRoutes(app, database, authenticate, config);
  registerReportRoutes(app, database, authenticate);

  const publicBookingLifecycleTimer = setInterval(() => {
    void processPublicBookingLifecycle(
      database,
      publicBookingMailer,
      config.PUBLIC_WEB_URL,
      appointmentNotifier,
    ).catch((error: unknown) => app.log.error(error));
  }, 60_000);
  publicBookingLifecycleTimer.unref();
  const notificationDeliveryTimer = setInterval(() => {
    void processQueuedNotificationDeliveries(database, config).catch(
      (error: unknown) => app.log.error(error),
    );
  }, 60_000);
  notificationDeliveryTimer.unref();
  const productOrderLifecycleTimer = setInterval(() => {
    void processProductOrderLifecycle(database).catch((error: unknown) =>
      app.log.error(error),
    );
  }, 60_000);
  productOrderLifecycleTimer.unref();
  const subscriptionPaymentLifecycleTimer = setInterval(() => {
    void expireStaleSubscriptionPayments(database).catch((error: unknown) =>
      app.log.error(error),
    );
  }, 60_000);
  subscriptionPaymentLifecycleTimer.unref();
  const subscriptionLifecycleTimer = setInterval(
    () => {
      void reconcileSubscriptionLifecycle(database).catch((error: unknown) =>
        app.log.error(error),
      );
      void processSubscriptionRenewalReminders(database, config).catch(
        (error: unknown) => app.log.error(error),
      );
    },
    60 * 60 * 1000,
  );
  subscriptionLifecycleTimer.unref();
  const sriInvoiceLifecycleTimer = setInterval(() => {
    void enqueuePendingSriInvoices(database, config).catch((error: unknown) =>
      app.log.error(error),
    );
    void processSriInvoiceQueue(database, config).catch((error: unknown) =>
      app.log.error(error),
    );
    void deliverSriInvoices(database, config).catch((error: unknown) =>
      app.log.error(error),
    );
  }, 60_000);
  sriInvoiceLifecycleTimer.unref();
  void reconcileSubscriptionLifecycle(database).catch((error: unknown) =>
    app.log.error(error),
  );
  void processSubscriptionRenewalReminders(database, config).catch(
    (error: unknown) => app.log.error(error),
  );
  void enqueuePendingSriInvoices(database, config).catch((error: unknown) =>
    app.log.error(error),
  );
  void processSriInvoiceQueue(database, config).catch((error: unknown) =>
    app.log.error(error),
  );
  void deliverSriInvoices(database, config).catch((error: unknown) =>
    app.log.error(error),
  );
  app.addHook('onClose', async () => {
    clearInterval(publicBookingLifecycleTimer);
    clearInterval(notificationDeliveryTimer);
    clearInterval(productOrderLifecycleTimer);
    clearInterval(subscriptionPaymentLifecycleTimer);
    clearInterval(subscriptionLifecycleTimer);
    clearInterval(sriInvoiceLifecycleTimer);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message ?? 'Revisa los datos enviados.',
      });
    }
    if (error instanceof ApiError) {
      return reply
        .code(error.statusCode)
        .send({ code: error.code, message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Inténtalo nuevamente.',
    });
  });

  app.addHook('onClose', async () => database.$disconnect());
  return app;
}
