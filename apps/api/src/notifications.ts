import {
  AppNotificationType,
  MembershipRole,
  MembershipStatus,
  NotificationCategory,
  type DatabaseClient,
} from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import nodemailer from 'nodemailer';

import type { ApiConfig } from './config';
import { sendFcmNotifications } from './fcm';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

export type AppointmentNotificationKind =
  'created' | 'cancelled' | 'rescheduled';
export interface OperationalNotification {
  readonly actorUserId?: string;
  readonly appointmentId?: string;
  readonly body: string;
  readonly data: Record<string, string>;
  readonly organizationId: string;
  readonly title: string;
  readonly type: AppNotificationType;
  readonly userIds: readonly string[];
}
export interface AppointmentNotifier {
  notify(
    appointmentId: string,
    kind: AppointmentNotificationKind,
    actorUserId?: string,
  ): Promise<void>;
  notifyPaymentConfirmation?(
    appointmentId: string,
    actorUserId?: string,
  ): Promise<void>;
  notifyReminder?(appointmentId: string): Promise<void>;
  notifyOperational?(input: OperationalNotification): Promise<void>;
}

const notificationPathSchema = z.object({ notificationId: z.uuid() });
const pushTokenSchema = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  token: z.string().trim().min(10).max(255),
});
const notificationPreferenceSchema = z.object({
  category: z.enum([
    'agenda',
    'cash',
    'inventory',
    'team',
    'reviews',
    'subscription',
    'billing',
    'security',
  ]),
  pushEnabled: z.boolean(),
});
const notificationCategories = [
  'agenda',
  'cash',
  'inventory',
  'team',
  'reviews',
  'subscription',
  'billing',
  'security',
] as const;
const protectedNotificationCategories = new Set(['billing', 'security']);

const notificationCategoryByType: Record<
  AppNotificationType,
  NotificationCategory
> = {
  [AppNotificationType.APPOINTMENT_CREATED]: NotificationCategory.AGENDA,
  [AppNotificationType.APPOINTMENT_CANCELLED]: NotificationCategory.AGENDA,
  [AppNotificationType.APPOINTMENT_REMINDER]: NotificationCategory.AGENDA,
  [AppNotificationType.APPOINTMENT_RESCHEDULED]: NotificationCategory.AGENDA,
  [AppNotificationType.CASH_REGISTER_CLOSED]: NotificationCategory.CASH,
  [AppNotificationType.CASH_REGISTER_VARIANCE]: NotificationCategory.CASH,
  [AppNotificationType.LOW_STOCK]: NotificationCategory.INVENTORY,
  [AppNotificationType.PAYMENT_CONFIRMATION_REQUIRED]:
    NotificationCategory.CASH,
  [AppNotificationType.REVIEW_NEGATIVE]: NotificationCategory.REVIEWS,
  [AppNotificationType.SUBSCRIPTION_RENEWAL]: NotificationCategory.SUBSCRIPTION,
  [AppNotificationType.TEAM_MEMBER_ACCEPTED]: NotificationCategory.TEAM,
  [AppNotificationType.TEAM_MEMBER_UPDATED]: NotificationCategory.TEAM,
  [AppNotificationType.SCHEDULE_UPDATED]: NotificationCategory.TEAM,
};

export function notificationCategoryForType(
  type: AppNotificationType,
): NotificationCategory {
  return notificationCategoryByType[type];
}

function isCriticalNotification(type: AppNotificationType) {
  const category = notificationCategoryForType(type);
  return (
    category === NotificationCategory.BILLING ||
    category === NotificationCategory.SECURITY
  );
}

export async function isPushEnabledForRecipient(
  database: DatabaseClient,
  userId: string,
  type: AppNotificationType,
) {
  if (isCriticalNotification(type)) return true;
  const preference = await database.notificationPreference.findUnique({
    where: {
      userId_category: {
        category: notificationCategoryForType(type),
        userId,
      },
    },
  });
  return preference?.pushEnabled !== false;
}

function notificationCategory(value: string): NotificationCategory {
  return value.toUpperCase() as NotificationCategory;
}

// Las notificaciones son avisos temporales, no un historial permanente. La
// limpieza ocurre al consultar la bandeja, por lo que no depende de que el
// cliente móvil esté actualizado ni de un proceso externo adicional.
const NOTIFICATION_RETENTION_DAYS = 30;

function notificationExpirationDate(now = new Date()) {
  const expirationDate = new Date(now);
  expirationDate.setUTCDate(
    expirationDate.getUTCDate() - NOTIFICATION_RETENTION_DAYS,
  );
  return expirationDate;
}

function copyFor(kind: AppointmentNotificationKind, clientName: string) {
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

function appointmentDate(startsAt: Date, timeZone: string) {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(startsAt);
}

export function createAppointmentNotifier(
  database: DatabaseClient,
  config: ApiConfig,
): AppointmentNotifier {
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
          include: { user: { select: { email: true, id: true } } },
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
        if (!recipients.length) return;
        const content = copyFor(kind, appointment.clientName);
        const data = {
          appointmentId: appointment.id,
          appointmentStartsAt: appointment.startsAt.toISOString(),
          locationId: appointment.locationId,
          route: '/agenda',
          type: kind,
        };
        await database.appNotification.createMany({
          data: recipients.map((recipient) => ({
            appointmentId: appointment.id,
            body: content.body,
            data,
            organizationId: appointment.organizationId,
            title: content.title,
            type: content.type,
            userId: recipient.id,
          })),
        });
        const details = `${appointment.clientName} · ${appointment.professional.user.fullName}\n${appointmentDate(appointment.startsAt, appointment.location.timezone)}`;
        if (transporter && config.SMTP_FROM)
          await Promise.allSettled(
            recipients.map((recipient) =>
              transporter.sendMail({
                from: config.SMTP_FROM,
                subject: `${content.title} · ${appointment.organization.name}`,
                text: `${content.body}\n\n${details}`,
                to: recipient.email,
              }),
            ),
          );
        const tokens = await database.pushToken.findMany({
          where: {
            userId: { in: recipients.map((recipient) => recipient.id) },
          },
        });
        await sendFcmNotifications({
          body: content.body,
          config,
          data,
          title: content.title,
          tokens: tokens.map((token) => token.token),
        });
      } catch {
        // Delivery is best-effort and never invalidates an appointment.
      }
    },
  };
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/notification-preferences', async (request) => {
    const { user } = await authenticate(database, request);
    const savedPreferences = await database.notificationPreference.findMany({
      where: { userId: user.id },
    });
    const preferencesByCategory = new Map(
      savedPreferences.map((preference) => [preference.category, preference]),
    );
    return {
      preferences: notificationCategories.map((category) => ({
        category,
        pushEnabled:
          preferencesByCategory.get(notificationCategory(category))
            ?.pushEnabled ?? true,
      })),
    };
  });
  app.put('/v1/notification-preferences', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = notificationPreferenceSchema.parse(request.body);
    if (
      protectedNotificationCategories.has(input.category) &&
      !input.pushEnabled
    )
      return reply.status(400).send({
        code: 'NOTIFICATION_PREFERENCE_PROTECTED',
        message:
          'Las notificaciones de seguridad y facturación no se pueden desactivar.',
      });
    const category = notificationCategory(input.category);
    const preference = await database.notificationPreference.upsert({
      create: { category, pushEnabled: input.pushEnabled, userId: user.id },
      update: { pushEnabled: input.pushEnabled },
      where: { userId_category: { category, userId: user.id } },
    });
    return {
      preference: {
        category: preference.category.toLowerCase(),
        pushEnabled: preference.pushEnabled,
      },
    };
  });
  app.get('/v1/notifications', async (request) => {
    const { user } = await authenticate(database, request);
    await database.appNotification.deleteMany({
      where: {
        createdAt: { lt: notificationExpirationDate() },
        userId: user.id,
      },
    });
    const notifications = await database.appNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      // Una notificación leída deja de ocupar la bandeja inmediatamente. Se
      // conserva hasta que venza la retención para una limpieza controlada.
      where: { readAt: null, userId: user.id },
    });
    return {
      notifications: notifications.map((notification) => ({
        ...notification,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
        type: notification.type.toLowerCase(),
      })),
    };
  });
  app.post('/v1/notifications/:notificationId/read', async (request) => {
    const { user } = await authenticate(database, request);
    const { notificationId } = notificationPathSchema.parse(request.params);
    await database.appNotification.updateMany({
      data: { readAt: new Date() },
      where: { id: notificationId, readAt: null, userId: user.id },
    });
    return { message: 'Notificación actualizada.' };
  });
  app.post('/v1/notifications/read-all', async (request) => {
    const { user } = await authenticate(database, request);
    await database.appNotification.updateMany({
      data: { readAt: new Date() },
      where: { readAt: null, userId: user.id },
    });
    return { message: 'Notificaciones actualizadas.' };
  });
  app.put('/v1/push-tokens', async (request) => {
    const { user } = await authenticate(database, request);
    const input = pushTokenSchema.parse(request.body);
    await database.pushToken.upsert({
      create: { platform: input.platform, token: input.token, userId: user.id },
      update: { platform: input.platform, userId: user.id },
      where: { token: input.token },
    });
    return { message: 'Dispositivo registrado.' };
  });
  app.delete('/v1/push-tokens/:token', async (request) => {
    const { user } = await authenticate(database, request);
    const token = z
      .string()
      .min(10)
      .max(255)
      .parse((request.params as { token?: string }).token);
    await database.pushToken.deleteMany({ where: { token, userId: user.id } });
    return { message: 'Dispositivo revocado.' };
  });
}
