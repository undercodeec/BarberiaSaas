import {
  AppNotificationType,
  MembershipRole,
  MembershipStatus,
  SubscriptionStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import nodemailer from 'nodemailer';

import type { ApiConfig } from './config';
import type { AppointmentNotifier } from './notifications';

const REMINDER_LEAD_MS = 5 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_URL = 'https://navacloud.app/suscripciones';

export async function processSubscriptionRenewalReminders(
  database: DatabaseClient,
  config: ApiConfig,
  now = new Date(),
  notifier: AppointmentNotifier | null = null,
) {
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
  const subscriptions = await database.subscription.findMany({
    include: { organization: true, plan: true },
    where: {
      currentPeriodEnd: {
        gt: now,
        lte: new Date(now.getTime() + REMINDER_LEAD_MS),
      },
      plan: { monthlyPriceCents: { gt: 0 } },
      renewalReminderSentAt: null,
      status: SubscriptionStatus.ACTIVE,
    },
  });
  let sent = 0;
  for (const subscription of subscriptions) {
    const owners = await database.membership.findMany({
      include: { user: { select: { email: true, id: true } } },
      where: {
        organizationId: subscription.organizationId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!owners.length) continue;
    const endsAt = new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: subscription.organization.defaultTimezone,
    }).format(subscription.currentPeriodEnd);
    const commercialTimezone = subscription.organization.defaultTimezone;
    try {
      if (transporter && config.SMTP_FROM) {
        await Promise.all(
          owners.map(({ user }) =>
            transporter.sendMail({
              from: config.SMTP_FROM!,
              subject: `Tu suscripción Nava vence el ${endsAt}`,
              text: [
                `Tu plan ${subscription.plan.name} para ${subscription.organization.name} vence el ${endsAt} (${commercialTimezone}).`,
                '',
                'Las renovaciones de Nava son manuales. Renueva antes del vencimiento para mantener las funciones de tu plan.',
                '',
                `Renovar ahora: ${SUBSCRIPTION_URL}`,
              ].join('\n'),
              to: user.email,
            }),
          ),
        );
      }
      await notifier?.notifyOperational?.({
        body: `Tu plan ${subscription.plan.name} vence el ${endsAt}. Renueva para mantener las funciones activas.`,
        data: { route: '/subscription', type: 'subscription_renewal' },
        organizationId: subscription.organizationId,
        title: 'Tu suscripción Nava vence pronto',
        type: AppNotificationType.SUBSCRIPTION_RENEWAL,
        userIds: owners.map(({ user }) => user.id),
      });
      const updated = await database.subscription.updateMany({
        data: { renewalReminderSentAt: now },
        where: { id: subscription.id, renewalReminderSentAt: null },
      });
      sent += updated.count;
    } catch {
      // No se marca como enviado: el proceso horario volverá a intentarlo.
    }
  }
  return sent;
}
