import {
  createDatabaseClient,
  PlatformOverrideKind,
} from '@barber-saas/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';
import type {
  InvitationMessage,
  PlatformAccessMessage,
  VerificationMessage,
} from './recovery-mailer';
import { hashPassword } from './security';
import { GRACE_DAYS, TRIAL_DAYS } from './subscription-policy';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
  const isLocalTestService =
    ['127.0.0.1', 'localhost'].includes(parsedTestDatabaseUrl.hostname) &&
    parsedTestDatabaseUrl.port === '5433' &&
    parsedTestDatabaseUrl.pathname.toLowerCase().includes('test');
  if (!isLocalTestService) {
    throw new Error(
      'TEST_DATABASE_URL debe apuntar exclusivamente a postgres-test en el puerto 5433 y a una base cuyo nombre incluya "test".',
    );
  }
}
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let registrationProfileSequence = 0;

describe('CORS', () => {
  it('autoriza PATCH durante el preflight para editar colaboradores', async () => {
    const app = await buildApi({
      config: readConfig({
        API_HOST: '127.0.0.1',
        API_PORT: '4000',
        APP_ENV: 'local',
        CORS_ORIGIN: 'http://localhost:8081',
        DATABASE_URL: 'postgresql://unused/unused',
        MOBILE_INVITATION_URL: 'barbersaas://accept-invitation',
        MOBILE_RESET_URL: 'barbersaas://reset-password',
      }),
    });

    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/v1/onboarding/collaborators/example-id',
        headers: {
          origin: 'http://localhost:8081',
          'access-control-request-method': 'PATCH',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-methods']).toContain(
        'PATCH',
      );
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.headers['x-content-type-options']).toBe('nosniff');
      expect(health.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(health.headers['strict-transport-security']).toBeUndefined();
      expect(health.headers['x-nava-query-count']).toBe('0');
      expect(Number(health.headers['x-nava-response-bytes'])).toBeGreaterThan(
        0,
      );
    } finally {
      await app.close();
    }
  });
});

describe('limitación de autenticación por IP', () => {
  it('limita registro y reenvío por separado y publica Retry-After', async () => {
    const app = await buildApi({
      config: readConfig({
        API_HOST: '127.0.0.1',
        API_PORT: '4000',
        API_TRUST_PROXY: 'true',
        APP_ENV: 'local',
        AUTH_IP_RATE_LIMIT_WINDOW_SECONDS: '60',
        AUTH_LOGIN_RATE_LIMIT_MAX: '2',
        AUTH_RECOVER_RATE_LIMIT_MAX: '2',
        AUTH_REGISTER_RATE_LIMIT_MAX: '2',
        AUTH_RESEND_RATE_LIMIT_MAX: '2',
        CORS_ORIGIN: 'http://localhost:8081',
        DATABASE_URL: 'postgresql://unused/unused',
        MOBILE_INVITATION_URL: 'barbersaas://accept-invitation',
        MOBILE_RESET_URL: 'barbersaas://reset-password',
      }),
    });
    const headers = { 'x-forwarded-for': '203.0.113.10' };

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await app.inject({
          headers,
          method: 'POST',
          payload: {},
          url: '/v1/auth/register',
        });
        expect(response.statusCode).toBe(400);
        expect(response.headers['x-ratelimit-limit']).toBe('2');
        expect(response.headers['x-ratelimit-remaining']).toBe(
          String(1 - attempt),
        );
      }

      const blockedRegister = await app.inject({
        headers,
        method: 'POST',
        payload: {},
        url: '/v1/auth/register',
      });
      expect(blockedRegister.statusCode).toBe(429);
      expect(blockedRegister.json()).toMatchObject({
        code: 'AUTH_REGISTER_RATE_LIMITED',
      });
      expect(Number(blockedRegister.headers['retry-after'])).toBeGreaterThan(0);

      const firstResend = await app.inject({
        headers,
        method: 'POST',
        payload: {},
        url: '/v1/auth/resend-verification',
      });
      expect(firstResend.statusCode).toBe(400);
      expect(firstResend.headers['x-ratelimit-remaining']).toBe('1');

      const secondResend = await app.inject({
        headers,
        method: 'POST',
        payload: {},
        url: '/v1/auth/resend-verification',
      });
      expect(secondResend.statusCode).toBe(400);

      const blockedResend = await app.inject({
        headers,
        method: 'POST',
        payload: {},
        url: '/v1/auth/resend-verification',
      });
      expect(blockedResend.statusCode).toBe(429);
      expect(blockedResend.json()).toMatchObject({
        code: 'AUTH_RESEND_RATE_LIMITED',
      });
      expect(Number(blockedResend.headers['retry-after'])).toBeGreaterThan(0);

      for (const url of ['/v1/auth/login', '/v1/auth/recover']) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await app.inject({
            headers,
            method: 'POST',
            payload: {},
            url,
          });
          expect(response.statusCode).toBe(400);
        }

        const blocked = await app.inject({
          headers,
          method: 'POST',
          payload: {},
          url,
        });
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json<{ code: string }>().code).toBe(
          url === '/v1/auth/login'
            ? 'AUTH_LOGIN_RATE_LIMITED'
            : 'AUTH_RECOVER_RATE_LIMITED',
        );
      }

      const otherIp = await app.inject({
        headers: { 'x-forwarded-for': '203.0.113.11' },
        method: 'POST',
        payload: {},
        url: '/v1/auth/register',
      });
      expect(otherIp.statusCode).toBe(400);
      expect(otherIp.headers['x-ratelimit-remaining']).toBe('1');
    } finally {
      await app.close();
    }
  });
});

function registrationProfilePayload() {
  registrationProfileSequence += 1;
  return {
    accountType: 'business',
    businessName: `Barbería de prueba ${registrationProfileSequence}`,
    city: 'Quito',
    closingTime: '18:00',
    countryCode: 'EC',
    openingTime: '09:00',
    phone: `+5939${String(registrationProfileSequence).padStart(8, '0')}`,
    privacyPolicyAccepted: true,
    timezone: 'America/Guayaquil',
  } as const;
}

function localDateForTest(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

describeWithDatabase('API con PostgreSQL', () => {
  const connectionString = testDatabaseUrl ?? 'postgresql://unused/unused';
  const database = createDatabaseClient({ connectionString });
  const config = readConfig({
    API_HOST: '127.0.0.1',
    API_PORT: '4000',
    APP_ENV: 'local',
    AUTH_REGISTER_RATE_LIMIT_MAX: '1000',
    AUTH_RESEND_RATE_LIMIT_MAX: '1000',
    CORS_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: connectionString,
    MOBILE_INVITATION_URL: 'barbersaas://accept-invitation',
    MOBILE_RESET_URL: 'barbersaas://reset-password',
    PLATFORM_ADMIN_EMAILS: 'platform@example.com',
    PLATFORM_ADMIN_PASSWORD_HASH:
      'scrypt$16384$8$1$A6C4FBINr3qyaQDaouJCtQ$R9u7ox1ELJJOHJni_JBpVpSp2WbG1NPt7Tm_8M8TWt-QKkYwRlro_MA54m-ZXYBemX_Fva0Lk7sppR3bj8P1JA',
  });
  const invitationMessages: InvitationMessage[] = [];
  const platformAccessMessages: PlatformAccessMessage[] = [];
  const verificationMessages: VerificationMessage[] = [];
  let app: Awaited<ReturnType<typeof buildApi>>;

  beforeEach(async () => {
    app ??= await buildApi({
      config,
      database,
      invitationMailer: {
        send: (message) => {
          invitationMessages.push(message);
          return Promise.resolve();
        },
      },
      platformAccessMailer: {
        send: (message) => {
          platformAccessMessages.push(message);
          return Promise.resolve();
        },
      },
      verificationMailer: {
        send: (message) => {
          verificationMessages.push(message);
          return Promise.resolve();
        },
      },
    });
    invitationMessages.length = 0;
    platformAccessMessages.length = 0;
    verificationMessages.length = 0;
    await database.platformSupportCaseEvent.deleteMany();
    await database.platformSupportCase.deleteMany();
    await database.platformOrganizationNote.deleteMany();
    await database.platformConfigurationVersion.deleteMany();
    await database.platformPrivacyRequest.deleteMany();
    await database.platformFeatureOverride.deleteMany();
    await database.platformAlert.deleteMany();
    await database.platformExport.deleteMany();
    await database.platformAuditLog.deleteMany();
    await database.platformOperator.deleteMany();
    await database.onboardingCollaborator.deleteMany();
    await database.commissionSettlementAdvance.deleteMany();
    await database.professionalAdvance.deleteMany();
    await database.commissionEntry.deleteMany();
    await database.commissionSettlement.deleteMany();
    await database.commissionRule.deleteMany();
    await database.appointmentEvent.deleteMany();
    await database.appointmentService.deleteMany();
    await database.appointment.deleteMany();
    await database.clientLabelAssignment.deleteMany();
    await database.clientNote.deleteMany();
    await database.clientLabel.deleteMany();
    await database.client.deleteMany();
    await database.cashRegisterSession.deleteMany();
    await database.stockMovement.deleteMany();
    await database.locationInventory.deleteMany();
    await database.product.deleteMany();
    await database.scheduleBlock.deleteMany();
    await database.weeklySchedule.deleteMany();
    await database.businessWeeklySchedule.deleteMany();
    await database.professionalService.deleteMany();
    await database.service.deleteMany();
    await database.serviceCategory.deleteMany();
    await database.teamInvitation.deleteMany();
    await database.auditLog.deleteMany();
    await database.memberLocation.deleteMany();
    await database.membership.deleteMany();
    await database.location.deleteMany();
    await database.organization.deleteMany();
    await database.passwordResetToken.deleteMany();
    await database.emailVerificationCode.deleteMany();
    await database.platformAdminAccessChallenge.deleteMany();
    await database.pendingRegistration.deleteMany();
    await database.accountDeletionRetention.deleteMany();
    await database.session.deleteMany();
    await database.userPortfolioItem.deleteMany();
    await database.onboardingService.deleteMany();
    await database.userRegistrationProfile.deleteMany();
    await database.user.deleteMany();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function register(email: string) {
    const profilePayload = registrationProfilePayload();
    const response = await app.inject({
      method: 'POST',
      payload: {
        ...profilePayload,
        confirmPassword: 'Clave-segura-123',
        email,
        fullName: 'Propietario de prueba',
        password: 'Clave-segura-123',
      },
      url: '/v1/auth/register',
    });
    expect(response.statusCode).toBe(201);
    const registration = response.json<{
      developmentVerificationCode: string;
      email: string;
      verificationExpiresAt: string;
    }>();
    expect(
      new Date(registration.verificationExpiresAt).getTime(),
    ).toBeGreaterThan(Date.now());
    const verification = await app.inject({
      method: 'POST',
      payload: {
        code: registration.developmentVerificationCode,
        email: registration.email,
      },
      url: '/v1/auth/verify-email',
    });
    expect(verification.statusCode).toBe(200);
    return verification.json<{ session: { token: string } }>().session.token;
  }

  async function onboard(token: string, slug: string) {
    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        location: {
          city: 'Quito',
          countryCode: 'EC',
          currencyCode: 'USD',
          name: `Sucursal ${slug}`,
          phone: '0999999999',
          slug: `${slug}-centro`,
          timezone: 'America/Guayaquil',
          whatsappPhone: '0999999999',
        },
        name: `Barbería ${slug}`,
        slug,
      },
      url: '/v1/onboarding',
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ locationId: string; organizationId: string }>();
  }

  function lastInvitationToken(): string {
    const invitationUrl = invitationMessages.at(-1)?.invitationUrl;
    expect(invitationUrl).toBeDefined();
    const token = new URL(invitationUrl ?? '').searchParams.get('token');
    expect(token).toBeTruthy();
    return token ?? '';
  }

  async function setupAgenda(slug: string) {
    const ownerToken = await register(`${slug}-owner@example.com`);
    const organization = await onboard(ownerToken, slug);
    const barberToken = await register(`${slug}-barber@example.com`);
    const invitationResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        email: `${slug}-barber@example.com`,
        fullName: `Barbero ${slug}`,
        locationId: organization.locationId,
        role: 'barber',
      },
      url: '/v1/team/invitations',
    });
    expect(invitationResponse.statusCode).toBe(201);
    const invitationToken = lastInvitationToken();
    const acceptanceResponse = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'POST',
      payload: { token: invitationToken },
      url: '/v1/team/invitations/accept',
    });
    const membershipId = acceptanceResponse.json<{
      membership: { id: string };
    }>().membership.id;
    const serviceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: { durationMinutes: 30, name: 'Corte agenda', priceCents: 1200 },
      url: '/v1/services',
    });
    const serviceId = serviceResponse.json<{ service: { id: string } }>()
      .service.id;
    await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        locationId: organization.locationId,
        membershipId,
        serviceId,
      },
      url: '/v1/services/assignments',
    });
    const scheduleResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PUT',
      payload: {
        locationId: organization.locationId,
        membershipId,
        schedules: [{ endMinute: 1020, startMinute: 540, weekday: 1 }],
      },
      url: '/v1/schedules',
    });
    expect(scheduleResponse.statusCode).toBe(200);
    return {
      barberToken,
      locationId: organization.locationId,
      membershipId,
      organizationId: organization.organizationId,
      ownerToken,
      serviceId,
    };
  }

  it('expone preferencias de notificacion predeterminadas y permite actualizar solo las no criticas', async () => {
    const token = await register('notification-preferences@example.com');
    const headers = { authorization: `Bearer ${token}` };

    const defaults = await app.inject({
      headers,
      method: 'GET',
      url: '/v1/notification-preferences',
    });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toEqual({
      preferences: expect.arrayContaining([
        expect.objectContaining({ category: 'agenda', pushEnabled: true }),
        expect.objectContaining({ category: 'billing', pushEnabled: true }),
        expect.objectContaining({ category: 'security', pushEnabled: true }),
      ]),
    });

    const updated = await app.inject({
      headers,
      method: 'PUT',
      payload: { category: 'agenda', pushEnabled: false },
      url: '/v1/notification-preferences',
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      preference: { category: 'agenda', pushEnabled: false },
    });

    const persisted = await app.inject({
      headers,
      method: 'GET',
      url: '/v1/notification-preferences',
    });
    expect(persisted.json()).toEqual({
      preferences: expect.arrayContaining([
        expect.objectContaining({ category: 'agenda', pushEnabled: false }),
      ]),
    });

    for (const category of ['billing', 'security']) {
      const disableCritical = await app.inject({
        headers,
        method: 'PUT',
        payload: { category, pushEnabled: false },
        url: '/v1/notification-preferences',
      });
      expect(disableCritical.statusCode).toBe(400);
    }
  });

  it('conserva en bandeja los avisos de agenda silenciados, excluye al actor y crea recordatorios aunque ya exista otro aviso', async () => {
    const agenda = await setupAgenda('preferencias-cola-agenda');
    const memberships = await database.membership.findMany({
      select: { role: true, userId: true },
      where: { organizationId: agenda.organizationId },
    });
    const ownerUserId = memberships.find(
      ({ role }) => role === 'OWNER',
    )?.userId;
    const barberUserId = memberships.find(
      ({ role }) => role === 'BARBER',
    )?.userId;
    expect(ownerUserId).toBeDefined();
    expect(barberUserId).toBeDefined();
    if (!ownerUserId || !barberUserId)
      throw new Error(
        'La agenda de prueba debe incluir propietario y barbero.',
      );
    await database.pushToken.create({
      data: {
        platform: 'ios',
        token: 'push-token-for-muted-agenda-recipient',
        userId: barberUserId,
      },
    });

    const muted = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'PUT',
      payload: { category: 'agenda', pushEnabled: false },
      url: '/v1/notification-preferences',
    });
    expect(muted.statusCode).toBe(200);

    const created = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        clientName: 'Cliente con avisos silenciados',
        locationId: agenda.locationId,
        professionalMembershipId: agenda.membershipId,
        serviceIds: [agenda.serviceId],
        startsAt: '2030-01-14T15:00:00.000Z',
      },
      url: '/v1/appointments',
    });
    expect(created.statusCode, created.body).toBe(201);
    const appointmentId = created.json<{ appointment: { id: string } }>()
      .appointment.id;

    const createdNotification = await database.appNotification.findFirstOrThrow(
      {
        where: {
          appointmentId,
          type: 'APPOINTMENT_CREATED',
          userId: barberUserId,
        },
      },
    );
    expect(
      (
        createdNotification.data as {
          delivery: { push: { state: string } };
        }
      ).delivery.push.state,
    ).toBe('skipped');
    expect(
      await database.appNotification.count({
        where: { appointmentId, userId: barberUserId },
      }),
    ).toBe(1);
    expect(
      await database.appNotification.count({
        where: { appointmentId, userId: ownerUserId },
      }),
    ).toBe(0);

    const reminderStartsAt = new Date(Date.now() + 20 * 60_000);
    await database.appointment.update({
      data: {
        endsAt: new Date(reminderStartsAt.getTime() + 30 * 60_000),
        startsAt: reminderStartsAt,
      },
      where: { id: appointmentId },
    });
    await app.close();
    app = await buildApi({
      config,
      database,
      invitationMailer: {
        send: (message) => {
          invitationMessages.push(message);
          return Promise.resolve();
        },
      },
      platformAccessMailer: {
        send: (message) => {
          platformAccessMessages.push(message);
          return Promise.resolve();
        },
      },
      verificationMailer: {
        send: (message) => {
          verificationMessages.push(message);
          return Promise.resolve();
        },
      },
    });

    let reminder = null;
    for (let attempt = 0; attempt < 20 && !reminder; attempt += 1) {
      reminder = await database.appNotification.findFirst({
        where: {
          appointmentId,
          type: 'APPOINTMENT_REMINDER',
          userId: barberUserId,
        },
      });
      if (!reminder)
        await new Promise((resolve) => {
          setTimeout(resolve, 25);
        });
    }
    expect(reminder?.type).toBe('APPOINTMENT_REMINDER');
  });

  it('solicita la confirmacion de cobro al completar una cita y solo la registra en Caja al aprobarla', async () => {
    const agenda = await setupAgenda('confirmacion-cobro-servicio');
    const created = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        clientName: 'Cliente pendiente de cobro',
        locationId: agenda.locationId,
        professionalMembershipId: agenda.membershipId,
        serviceIds: [agenda.serviceId],
        startsAt: '2030-01-14T15:00:00.000Z',
      },
      url: '/v1/appointments',
    });
    expect(created.statusCode, created.body).toBe(201);
    const appointmentId = created.json<{ appointment: { id: string } }>()
      .appointment.id;

    const completed = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'PATCH',
      payload: { status: 'completed' },
      url: `/v1/appointments/${appointmentId}/status`,
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(
      completed.json<{ paymentConfirmationRequested: boolean }>(),
    ).toMatchObject({ paymentConfirmationRequested: true });
    expect(
      await database.cashMovement.count({ where: { appointmentId } }),
    ).toBe(0);
    expect(
      await database.appNotification.count({
        where: {
          appointmentId,
          type: 'PAYMENT_CONFIRMATION_REQUIRED',
        },
      }),
    ).toBe(1);

    const barberConfirmations = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'GET',
      url: '/v1/appointment-payment-confirmations',
    });
    expect(barberConfirmations.statusCode).toBe(403);
    const pending = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: '/v1/appointment-payment-confirmations',
    });
    expect(pending.statusCode, pending.body).toBe(200);
    expect(
      pending.json<{
        confirmations: Array<{
          appointmentId: string;
          professionalName: string;
          totalCents: number;
        }>;
      }>().confirmations,
    ).toEqual([
      expect.objectContaining({
        appointmentId,
        professionalName: 'Propietario de prueba',
        totalCents: 1_200,
      }),
    ]);

    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: { openingAmountCents: 0 },
          url: '/v1/cash-register/open',
        })
      ).statusCode,
    ).toBe(201);
    const confirmation = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        amountCents: 1_200,
        appointmentId,
        description: 'Cobro aprobado por administracion',
        paymentMethod: 'card',
        type: 'sale',
      },
      url: '/v1/cash-register/movements',
    });
    expect(confirmation.statusCode, confirmation.body).toBe(201);
    expect(
      await database.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
      }),
    ).toMatchObject({ paymentStatus: 'PAID' });
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'GET',
          url: '/v1/appointment-payment-confirmations',
        })
      ).json<{ confirmations: unknown[] }>().confirmations,
    ).toEqual([]);
  });

  it('impide que un barbero consulte u opere Caja por API', async () => {
    const agenda = await setupAgenda('caja-restringida-barbero');
    const headers = { authorization: `Bearer ${agenda.barberToken}` };
    const responses = await Promise.all([
      app.inject({
        headers,
        method: 'GET',
        url: `/v1/cash-register/current?locationId=${agenda.locationId}`,
      }),
      app.inject({
        headers,
        method: 'GET',
        url: `/v1/cash-register/summary?locationId=${agenda.locationId}`,
      }),
      app.inject({
        headers,
        method: 'GET',
        url: `/v1/cash-register/history?locationId=${agenda.locationId}`,
      }),
      app.inject({
        headers,
        method: 'GET',
        url: `/v1/financial-records?locationId=${agenda.locationId}`,
      }),
      app.inject({
        headers,
        method: 'POST',
        payload: { openingAmountCents: 0 },
        url: '/v1/cash-register/open',
      }),
      app.inject({
        headers,
        method: 'POST',
        payload: {
          amountCents: 1_200,
          description: 'Intento no autorizado',
          paymentMethod: 'cash',
          professionalMembershipId: agenda.membershipId,
          serviceId: agenda.serviceId,
          type: 'sale',
        },
        url: '/v1/cash-register/movements',
      }),
      app.inject({
        headers,
        method: 'POST',
        payload: { closingAmountCents: 0 },
        url: '/v1/cash-register/close',
      }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([
      403, 403, 403, 403, 403, 403, 403,
    ]);
  });

  it('persiste una única respuesta de bienvenida por usuario', async () => {
    const token = await register('welcome-survey@example.com');
    const headers = { authorization: `Bearer ${token}` };

    const before = await app.inject({
      headers,
      method: 'GET',
      url: '/v1/welcome-survey-response',
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ response: null });

    const created = await app.inject({
      headers,
      method: 'POST',
      payload: { selectedOptions: ['Buscador'] },
      url: '/v1/welcome-survey-response',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      response: { selectedOptions: ['Buscador'] },
    });

    const replay = await app.inject({
      headers,
      method: 'POST',
      payload: { selectedOptions: ['Publicidad'] },
      url: '/v1/welcome-survey-response',
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      response: { selectedOptions: ['Buscador'] },
    });

    const invalid = await app.inject({
      headers,
      method: 'POST',
      payload: { selectedOptions: ['Canal no registrado'] },
      url: '/v1/welcome-survey-response',
    });
    expect(invalid.statusCode).toBe(400);

    const anonymous = await app.inject({
      method: 'GET',
      url: '/v1/welcome-survey-response',
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('crea cuenta, sesión y onboarding atómico', async () => {
    const token = await register('owner@example.com');
    const created = await onboard(token, 'barberia-principal');

    const membership = await database.membership.findFirst({
      include: { memberLocations: true },
      where: { organizationId: created.organizationId },
    });
    expect(membership?.role).toBe('OWNER');
    expect(membership?.memberLocations).toHaveLength(1);
    expect(await database.auditLog.count()).toBe(1);
  });

  it('guarda coordenadas y placeId del negocio con auditoría', async () => {
    const token = await register('maps-owner@example.com');
    const created = await onboard(token, 'maps-business');
    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'PUT',
      payload: {
        addressLine: 'Av. República y Amazonas',
        city: 'Quito',
        countryCode: 'EC',
        formattedAddress: 'Av. República y Amazonas, Quito, Ecuador',
        googlePlaceId: 'ChIJ-location-test',
        latitude: -0.19,
        longitude: -78.49,
      },
      url: '/v1/business-location',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      location: {
        googlePlaceId: 'ChIJ-location-test',
        latitude: -0.19,
        longitude: -78.49,
      },
    });

    await expect(
      database.location.findUnique({ where: { id: created.locationId } }),
    ).resolves.toMatchObject({
      formattedAddress: 'Av. República y Amazonas, Quito, Ecuador',
      googlePlaceId: 'ChIJ-location-test',
      latitude: -0.19,
      longitude: -78.49,
    });
    await expect(
      database.auditLog.findFirst({
        where: {
          action: 'location.map_updated',
          entityId: created.locationId,
        },
      }),
    ).resolves.not.toBeNull();

    const details = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/onboarding/account-details',
    });
    expect(details.json()).toMatchObject({
      businessLocation: {
        formattedAddress: 'Av. República y Amazonas, Quito, Ecuador',
        googlePlaceId: 'ChIJ-location-test',
      },
    });
  });

  it('revoca la sesión y anonimiza una cuenta solo después de validar bloqueos', async () => {
    const email = 'account-deletion@example.com';
    const firstToken = await register(email);
    const organization = await onboard(firstToken, 'account-deletion');
    const originalUser = await database.user.findUniqueOrThrow({
      where: { email },
    });

    const logout = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      url: '/v1/auth/logout',
    });
    expect(logout.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${firstToken}` },
          method: 'GET',
          url: '/v1/auth/session',
        })
      ).statusCode,
    ).toBe(401);

    const login = await app.inject({
      method: 'POST',
      payload: { email, password: 'Clave-segura-123' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode).toBe(200);
    const token = login.json<{ session: { token: string } }>().session.token;
    const wrongPassword = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'DELETE',
      payload: { confirmation: 'ELIMINAR', password: 'Clave-incorrecta-123' },
      url: '/v1/account',
    });
    expect(wrongPassword.statusCode).toBe(401);

    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: { openingAmountCents: 0 },
          url: '/v1/cash-register/open',
        })
      ).statusCode,
    ).toBe(201);
    const blockedByCash = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'DELETE',
      payload: { confirmation: 'ELIMINAR', password: 'Clave-segura-123' },
      url: '/v1/account',
    });
    expect(blockedByCash.statusCode).toBe(409);
    expect(blockedByCash.json<{ code: string }>().code).toBe(
      'ACCOUNT_HAS_OPEN_CASH_REGISTER',
    );
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: { closingAmountCents: 0 },
          url: '/v1/cash-register/close',
        })
      ).statusCode,
    ).toBe(200);

    await register('account-deletion-collaborator@example.com');
    const collaborator = await database.user.findUniqueOrThrow({
      where: { email: 'account-deletion-collaborator@example.com' },
    });
    const collaboratorMembership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'RECEPTIONIST',
        status: 'ACTIVE',
        userId: collaborator.id,
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: organization.locationId,
        membershipId: collaboratorMembership.id,
      },
    });
    const blockedByCollaborator = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'DELETE',
      payload: { confirmation: 'ELIMINAR', password: 'Clave-segura-123' },
      url: '/v1/account',
    });
    expect(blockedByCollaborator.statusCode).toBe(409);
    expect(blockedByCollaborator.json<{ code: string }>().code).toBe(
      'ACCOUNT_HAS_ACTIVE_COLLABORATORS',
    );
    await database.membership.update({
      data: { status: 'SUSPENDED' },
      where: { id: collaboratorMembership.id },
    });

    const deleted = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'DELETE',
      payload: { confirmation: 'ELIMINAR', password: 'Clave-segura-123' },
      url: '/v1/account',
    });
    expect(deleted.statusCode, deleted.body).toBe(204);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'GET',
          url: '/v1/auth/session',
        })
      ).statusCode,
    ).toBe(401);
    expect(
      await database.user.findUnique({ where: { id: originalUser.id } }),
    ).toMatchObject({
      deletedAt: expect.any(Date),
      emailVerifiedAt: null,
      fullName: 'Cuenta eliminada',
      passwordHash: null,
      phone: null,
    });
    await expect(
      database.accountDeletionRetention.findMany({
        where: { userId: originalUser.id },
      }),
    ).resolves.toHaveLength(2);
    const emailAvailability = await app.inject({
      method: 'POST',
      payload: { email },
      url: '/v1/auth/registration-availability',
    });
    expect(emailAvailability.statusCode).toBe(200);
    expect(emailAvailability.json()).toMatchObject({
      conflicts: { email: 'Ese correo ya está registrado.' },
    });
    const phoneAvailability = await app.inject({
      method: 'POST',
      payload: { phone: originalUser.phone },
      url: '/v1/auth/registration-availability',
    });
    expect(phoneAvailability.statusCode).toBe(200);
    expect(phoneAvailability.json()).toMatchObject({
      conflicts: { phone: 'Ese número telefónico ya está registrado.' },
    });
    const retryRegistration = await app.inject({
      method: 'POST',
      payload: {
        ...registrationProfilePayload(),
        confirmPassword: 'Clave-segura-123',
        email,
        fullName: 'Registro durante retenciÃ³n',
        password: 'Clave-segura-123',
        phone: originalUser.phone,
      },
      url: '/v1/auth/register',
    });
    expect(retryRegistration.statusCode).toBe(409);
    expect(retryRegistration.json<{ code: string }>().code).toBe(
      'ACCOUNT_DELETION_RETENTION_ACTIVE',
    );
    expect(
      await database.organization.findUnique({
        where: { id: organization.organizationId },
      }),
    ).toMatchObject({ deletedAt: expect.any(Date), status: 'CANCELLED' });
    expect(
      await database.location.findUnique({
        where: { id: organization.locationId },
      }),
    ).toMatchObject({ isActive: false });
    expect(
      (
        await app.inject({
          method: 'POST',
          payload: { email, password: 'Clave-segura-123' },
          url: '/v1/auth/login',
        })
      ).statusCode,
    ).toBe(401);
  });

  it('materializa el onboarding moderno una sola vez', async () => {
    const token = await register('modern-onboarding@example.com');
    const serviceResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        agendaColor: '#2464E8',
        category: {
          description: 'Servicios principales',
          name: 'Barber\u00eda',
        },
        description: 'Corte cl\u00e1sico',
        downPaymentPercentage: 0,
        durationMinutes: 30,
        imageUri: null,
        name: 'Corte moderno',
        onlineBooking: true,
        price: 15,
        priceType: 'fixed',
        showServiceTime: true,
        tax: null,
      },
      url: '/v1/onboarding/services',
    });
    expect(serviceResponse.statusCode).toBe(201);

    const firstCompletion = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      url: '/v1/onboarding/complete-account-setup',
    });
    expect(firstCompletion.statusCode).toBe(200);
    const firstResult = firstCompletion.json<{
      bookingUrl: string;
      locationId: string;
      onboardingCompletedAt: string;
      organizationId: string;
    }>();

    expect(firstResult.bookingUrl).toMatch(/^https:\/\/navacloud\.app\//u);
    expect(
      await database.organization.count({
        where: { id: firstResult.organizationId },
      }),
    ).toBe(1);
    expect(
      await database.location.count({
        where: { id: firstResult.locationId },
      }),
    ).toBe(1);
    const ownerMembership = await database.membership.findFirst({
      where: {
        organizationId: firstResult.organizationId,
        role: 'OWNER',
      },
    });
    expect(ownerMembership).not.toBeNull();
    if (!ownerMembership) {
      throw new Error('No se creó la membresía propietaria.');
    }
    expect(
      await database.businessWeeklySchedule.count({
        where: { locationId: firstResult.locationId },
      }),
    ).toBe(7);
    expect(
      await database.weeklySchedule.count({
        where: {
          locationId: firstResult.locationId,
          membershipId: ownerMembership.id,
        },
      }),
    ).toBe(7);
    expect(
      await database.professionalService.count({
        where: {
          locationId: firstResult.locationId,
          membershipId: ownerMembership.id,
        },
      }),
    ).toBe(1);
    expect(await database.onboardingService.count()).toBe(0);

    const repeatedCompletion = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      url: '/v1/onboarding/complete-account-setup',
    });
    expect(repeatedCompletion.statusCode).toBe(200);
    expect(
      repeatedCompletion.json<{ organizationId: string }>().organizationId,
    ).toBe(firstResult.organizationId);
    expect(await database.organization.count()).toBe(1);
    expect(await database.service.count()).toBe(1);
  });

  it('persiste, edita y elimina colaboradores durante el onboarding', async () => {
    const token = await register('collaborator-owner@example.com');
    const createResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        agendaColor: '#2464E8',
        canPerformServices: true,
        customRoleDescription: 'Especialista en color',
        customRoleName: 'Colorista',
        description: 'Atiende cortes y color',
        identification: '0102030405',
        name: 'Carlos',
        phone: '0991234567',
        role: 'custom',
      },
      url: '/v1/onboarding/collaborators',
    });
    expect(createResponse.statusCode).toBe(201);
    const collaborator = createResponse.json<{
      collaborator: { id: string };
    }>();

    const listResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/onboarding/collaborators',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(
      listResponse.json<{ collaborators: unknown[] }>().collaborators,
    ).toHaveLength(1);

    const updateResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'PATCH',
      payload: {
        agendaColor: '#EF4444',
        canPerformServices: true,
        customRoleDescription: 'Especialista en color',
        customRoleName: 'Colorista',
        description: 'Atiende cortes y color',
        identification: '0102030405',
        name: 'Carlos Actualizado',
        phone: '0991234567',
        role: 'custom',
      },
      url: `/v1/onboarding/collaborators/${collaborator.collaborator.id}`,
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse.json<{
        collaborator: { agendaColor: string; name: string };
      }>(),
    ).toMatchObject({
      collaborator: { agendaColor: '#EF4444', name: 'Carlos Actualizado' },
    });

    const deleteResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'DELETE',
      url: `/v1/onboarding/collaborators/${collaborator.collaborator.id}`,
    });
    expect(deleteResponse.statusCode).toBe(204);
    expect(await database.onboardingCollaborator.count()).toBe(0);
  });

  it('exige y consume una sola vez el código de verificación de correo', async () => {
    const email = 'verification-owner@example.com';
    const password = 'Clave-segura-123';
    const profilePayload = registrationProfilePayload();
    const registrationResponse = await app.inject({
      method: 'POST',
      payload: {
        ...profilePayload,
        confirmPassword: password,
        email,
        fullName: 'Cuenta pendiente',
        password,
      },
      url: '/v1/auth/register',
    });
    expect(registrationResponse.statusCode).toBe(201);
    const registration = registrationResponse.json<{
      developmentVerificationCode: string;
      verificationExpiresAt: string;
    }>();
    expect(
      new Date(registration.verificationExpiresAt).getTime(),
    ).toBeGreaterThan(Date.now());
    expect(await database.user.findUnique({ where: { email } })).toBeNull();
    expect(
      await database.pendingRegistration.findUnique({ where: { email } }),
    ).not.toBeNull();

    const loginBeforeVerification = await app.inject({
      method: 'POST',
      payload: { email, password },
      url: '/v1/auth/login',
    });
    expect(loginBeforeVerification.statusCode).toBe(401);

    const verification = await app.inject({
      method: 'POST',
      payload: { code: registration.developmentVerificationCode, email },
      url: '/v1/auth/verify-email',
    });
    expect(verification.statusCode).toBe(200);
    const verifiedUser = await database.user.findUnique({ where: { email } });
    expect(verifiedUser).toMatchObject({
      emailVerifiedAt: expect.any(Date),
      phone: profilePayload.phone,
    });
    expect(
      await database.userRegistrationProfile.findUnique({
        where: { userId: verifiedUser!.id },
      }),
    ).toMatchObject({
      accountType: 'BUSINESS',
      businessName: profilePayload.businessName,
      city: profilePayload.city,
      closingTime: profilePayload.closingTime,
      countryCode: profilePayload.countryCode,
      openingTime: profilePayload.openingTime,
      userId: verifiedUser!.id,
    });
    expect(
      await database.pendingRegistration.findUnique({ where: { email } }),
    ).toBeNull();

    const reusedCode = await app.inject({
      method: 'POST',
      payload: { code: registration.developmentVerificationCode, email },
      url: '/v1/auth/verify-email',
    });
    expect(reusedCode.statusCode).toBe(400);
  });

  it('verifica un registro sin consentimiento de privacidad ni crea ese consentimiento', async () => {
    const email = 'mobile-no-consent@example.com';
    const password = 'Clave-segura-123';
    const registrationResponse = await app.inject({
      method: 'POST',
      payload: {
        ...registrationProfilePayload(),
        confirmPassword: password,
        email,
        fullName: 'Registro móvil',
        password,
        privacyPolicyAccepted: false,
      },
      url: '/v1/auth/register',
    });
    expect(registrationResponse.statusCode).toBe(201);
    const registration = registrationResponse.json<{
      developmentVerificationCode: string;
    }>();

    const verification = await app.inject({
      method: 'POST',
      payload: { code: registration.developmentVerificationCode, email },
      url: '/v1/auth/verify-email',
    });

    expect(verification.statusCode).toBe(200);
    const user = await database.user.findUniqueOrThrow({ where: { email } });
    expect(
      await database.privacyConsent.findFirst({ where: { userId: user.id } }),
    ).toBeNull();
  });

  it('rechaza correo, teléfono y nombre de negocio repetidos', async () => {
    const password = 'Clave-segura-123';
    const firstProfile = {
      ...registrationProfilePayload(),
      businessName: 'Barbería Única',
    };
    const firstEmail = 'unique-owner@example.com';
    const firstRegistration = await app.inject({
      method: 'POST',
      payload: {
        ...firstProfile,
        confirmPassword: password,
        email: firstEmail,
        fullName: 'Cuenta única',
        password,
      },
      url: '/v1/auth/register',
    });
    expect(firstRegistration.statusCode).toBe(201);
    const verificationCode = firstRegistration.json<{
      developmentVerificationCode: string;
    }>().developmentVerificationCode;
    expect(
      (
        await app.inject({
          method: 'POST',
          payload: { code: verificationCode, email: firstEmail },
          url: '/v1/auth/verify-email',
        })
      ).statusCode,
    ).toBe(200);

    const availability = await app.inject({
      method: 'POST',
      payload: {
        businessName: 'BARBERIA UNICA',
        email: firstEmail.toUpperCase(),
        phone: `${firstProfile.phone.slice(0, 4)} ${firstProfile.phone.slice(4)}`,
      },
      url: '/v1/auth/registration-availability',
    });
    expect(availability.statusCode).toBe(200);
    expect(
      availability.json<{
        conflicts: {
          email: string;
          phone: string;
        };
      }>().conflicts,
    ).toEqual({
      email: 'Ese correo ya está registrado.',
      phone: 'Ese número telefónico ya está registrado.',
    });

    const duplicateEmail = await app.inject({
      method: 'POST',
      payload: {
        ...registrationProfilePayload(),
        confirmPassword: password,
        email: firstEmail.toUpperCase(),
        fullName: 'Otro usuario',
        password,
      },
      url: '/v1/auth/register',
    });
    expect(duplicateEmail.statusCode).toBe(409);
    expect(duplicateEmail.json<{ code: string }>().code).toBe(
      'EMAIL_ALREADY_EXISTS',
    );

    const duplicatePhone = await app.inject({
      method: 'POST',
      payload: {
        ...registrationProfilePayload(),
        confirmPassword: password,
        email: 'duplicate-phone@example.com',
        fullName: 'Teléfono repetido',
        password,
        phone: `${firstProfile.phone.slice(0, 4)} ${firstProfile.phone.slice(4)}`,
      },
      url: '/v1/auth/register',
    });
    expect(duplicatePhone.statusCode).toBe(409);
    expect(duplicatePhone.json<{ code: string }>().code).toBe(
      'PHONE_ALREADY_EXISTS',
    );

    const duplicateBusiness = await app.inject({
      method: 'POST',
      payload: {
        ...registrationProfilePayload(),
        businessName: 'BARBERIA UNICA',
        confirmPassword: password,
        email: 'duplicate-business@example.com',
        fullName: 'Negocio repetido',
        password,
      },
      url: '/v1/auth/register',
    });
    expect(duplicateBusiness.statusCode).toBe(201);
    expect(duplicateBusiness.json<{ code: string }>().code).toBe(undefined);
  });

  it('bloquea la verificación después de cinco códigos incorrectos', async () => {
    const email = 'verification-limit@example.com';
    const password = 'Clave-segura-123';
    const registrationPayload = {
      ...registrationProfilePayload(),
      confirmPassword: password,
      email,
      fullName: 'Cuenta con límite',
      password,
    };
    const registrationResponse = await app.inject({
      method: 'POST',
      payload: registrationPayload,
      url: '/v1/auth/register',
    });
    expect(registrationResponse.statusCode).toBe(201);
    const registration = registrationResponse.json<{
      developmentVerificationCode: string;
    }>();
    const wrongCode =
      registration.developmentVerificationCode === '000000'
        ? '000001'
        : '000000';

    for (let attempt = 1; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        payload: { code: wrongCode, email },
        url: '/v1/auth/verify-email',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ code: string }>().code).toBe(
        'INVALID_VERIFICATION_CODE',
      );
    }

    const fifthAttempt = await app.inject({
      method: 'POST',
      payload: { code: wrongCode, email },
      url: '/v1/auth/verify-email',
    });
    expect(fifthAttempt.statusCode).toBe(429);
    expect(fifthAttempt.json<{ code: string }>().code).toBe(
      'VERIFICATION_RATE_LIMITED',
    );

    const correctCodeWhileLocked = await app.inject({
      method: 'POST',
      payload: { code: registration.developmentVerificationCode, email },
      url: '/v1/auth/verify-email',
    });
    expect(correctCodeWhileLocked.statusCode).toBe(429);

    const resendWhileLocked = await app.inject({
      method: 'POST',
      payload: { email },
      url: '/v1/auth/resend-verification',
    });
    expect(resendWhileLocked.statusCode).toBe(429);

    const registerWhileLocked = await app.inject({
      method: 'POST',
      payload: registrationPayload,
      url: '/v1/auth/register',
    });
    expect(registerWhileLocked.statusCode).toBe(429);
    expect(await database.user.findUnique({ where: { email } })).toBeNull();
    expect(
      await database.pendingRegistration.findUnique({ where: { email } }),
    ).toMatchObject({
      failedAttempts: 5,
      lockedUntil: expect.any(Date),
    });
  });

  it('aísla la organización usando la identidad de cada sesión', async () => {
    const firstToken = await register('first@example.com');
    const first = await onboard(firstToken, 'tenant-uno');
    const secondToken = await register('second@example.com');
    const second = await onboard(secondToken, 'tenant-dos');

    const response = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'GET',
      url: `/v1/organizations/current?organizationId=${second.organizationId}`,
    });
    const body = response.json<{
      organization: { id: string; name: string };
    }>();

    expect(response.statusCode).toBe(200);
    expect(body.organization.id).toBe(first.organizationId);
    expect(body.organization.id).not.toBe(second.organizationId);
    expect(response.body).not.toContain('Barbería tenant-dos');
  });

  it('rechaza una segunda organización mientras no exista selector de contexto', async () => {
    const firstToken = await register('single-context@example.com');
    await onboard(firstToken, 'contexto-principal');
    const secondOwnerToken = await register('second-context-owner@example.com');
    const secondOrganization = await onboard(
      secondOwnerToken,
      'contexto-secundario',
    );
    const invitationResponse = await app.inject({
      headers: { authorization: `Bearer ${secondOwnerToken}` },
      method: 'POST',
      payload: {
        email: 'single-context@example.com',
        fullName: 'Barbero segundo contexto',
        locationId: secondOrganization.locationId,
        role: 'barber',
      },
      url: '/v1/team/invitations',
    });
    expect(invitationResponse.statusCode).toBe(201);
    const invitationToken = lastInvitationToken();

    const acceptanceResponse = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: { token: invitationToken },
      url: '/v1/team/invitations/accept',
    });

    expect(acceptanceResponse.statusCode).toBe(409);
    expect(acceptanceResponse.json<{ code: string }>().code).toBe(
      'MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED',
    );
  });

  it('registra y acepta desde una invitación sin crear perfil de negocio', async () => {
    const ownerToken = await register('web-invitation-owner@example.com');
    const organization = await onboard(ownerToken, 'web-invitation');
    const invitedEmail = 'web-invitation-member@example.com';
    const invitationResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        email: invitedEmail,
        fullName: 'Colaborador desde web',
        locationId: organization.locationId,
        role: 'barber',
      },
      url: '/v1/team/invitations',
    });
    expect(invitationResponse.statusCode).toBe(201);
    const invitationToken = lastInvitationToken();

    const invalidRegistration = await app.inject({
      method: 'POST',
      payload: {
        confirmPassword: 'Clave-segura-123',
        email: 'otro-correo@example.com',
        fullName: 'Otro correo',
        password: 'Clave-segura-123',
        privacyPolicyAccepted: true,
        token: invitationToken,
      },
      url: '/v1/auth/invitation-register',
    });
    expect(invalidRegistration.statusCode).toBe(400);
    expect(invalidRegistration.json<{ code: string }>().code).toBe(
      'INVALID_INVITATION',
    );

    const registration = await app.inject({
      method: 'POST',
      payload: {
        confirmPassword: 'Clave-segura-123',
        email: invitedEmail,
        fullName: 'Colaborador desde web',
        password: 'Clave-segura-123',
        privacyPolicyAccepted: true,
        token: invitationToken,
      },
      url: '/v1/auth/invitation-register',
    });
    expect(registration.statusCode).toBe(201);
    const verification = registration.json<{
      developmentVerificationCode: string;
      email: string;
    }>();
    const verified = await app.inject({
      method: 'POST',
      payload: {
        code: verification.developmentVerificationCode,
        email: verification.email,
      },
      url: '/v1/auth/verify-email',
    });
    expect(verified.statusCode).toBe(200);
    const barberToken = verified.json<{ session: { token: string } }>().session
      .token;
    const acceptance = await app.inject({
      headers: {
        authorization: `Bearer ${barberToken}`,
      },
      method: 'POST',
      payload: { token: invitationToken },
      url: '/v1/team/invitations/accept',
    });
    expect(acceptance.statusCode).toBe(200);
    const accountDetails = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'GET',
      url: '/v1/onboarding/account-details',
    });
    expect(accountDetails.statusCode).toBe(200);
    expect(
      accountDetails.json<{ bookingUrl: string | null }>().bookingUrl,
    ).toMatch(/^https:\/\/navacloud\.app\//u);

    const invitedUser = await database.user.findUniqueOrThrow({
      where: { email: invitedEmail },
    });
    expect(
      await database.userRegistrationProfile.findUnique({
        where: { userId: invitedUser.id },
      }),
    ).toBeNull();
    expect(
      await database.membership.findFirst({
        where: {
          organizationId: organization.organizationId,
          userId: invitedUser.id,
        },
      }),
    ).toMatchObject({ status: 'ACTIVE' });
  });

  it('expone suscripción simulada y protege el cambio a cuenta individual', async () => {
    const ownerToken = await register('settings-owner@example.com');
    const organization = await onboard(ownerToken, 'settings-account');
    expect(
      await database.subscription.findUnique({
        where: { organizationId: organization.organizationId },
      }),
    ).toMatchObject({ status: 'TRIAL' });
    const createdSubscription = await database.subscription.findUnique({
      where: { organizationId: organization.organizationId },
    });
    expect(createdSubscription).not.toBeNull();
    const periodStart = createdSubscription?.currentPeriodStart.getTime() ?? 0;
    const trialEnd = createdSubscription?.trialEndsAt?.getTime() ?? 0;
    const periodEnd = createdSubscription?.currentPeriodEnd.getTime() ?? 0;
    const dayMilliseconds = 24 * 60 * 60 * 1000;
    expect(trialEnd - periodStart).toBe(TRIAL_DAYS * dayMilliseconds);
    expect(periodEnd - periodStart).toBe(TRIAL_DAYS * dayMilliseconds);
    expect(createdSubscription?.graceEndsAt).toBeNull();

    const subscriptionResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(subscriptionResponse.statusCode).toBe(200);
    expect(
      subscriptionResponse.json<{
        current: {
          featureFlags: { inventory: boolean; multiLocation: boolean };
          planCode: string;
          status: string;
        };
        plans: Array<{ available: boolean; code: string }>;
        usage: { locations: number; teamMembers: number };
      }>(),
    ).toMatchObject({
      current: {
        featureFlags: { inventory: true, multiLocation: true },
        planCode: 'local',
        status: 'trial',
      },
      plans: expect.arrayContaining([
        expect.objectContaining({ available: true, code: 'free' }),
        expect.objectContaining({ available: true, code: 'essential' }),
        expect.objectContaining({ available: true, code: 'local' }),
        expect.objectContaining({ available: true, code: 'multi' }),
      ]),
      usage: { locations: 1, teamMembers: 1 },
    });

    await database.platformFeatureOverride.create({
      data: {
        booleanValue: true,
        createdByUserId: (
          await database.membership.findFirstOrThrow({
            where: {
              organizationId: organization.organizationId,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          })
        ).userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        key: 'team',
        kind: PlatformOverrideKind.FEATURE,
        organizationId: organization.organizationId,
        reason: 'Validar entitlement efectivo en Mobile',
      },
    });
    const overriddenSubscriptionResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(
      overriddenSubscriptionResponse.json<{
        current: {
          featureFlags: { team: boolean };
          limits: { locations: number };
        };
      }>().current,
    ).toMatchObject({
      featureFlags: { team: true },
      limits: { locations: 3 },
    });

    await database.subscription.update({
      data: {
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        graceEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        trialEndsAt: null,
      },
      where: { organizationId: organization.organizationId },
    });
    const graceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(
      graceResponse.json<{
        current: { planCode: string; readOnly: boolean; status: string };
      }>().current,
    ).toMatchObject({
      planCode: 'local',
      readOnly: false,
      status: 'past_due',
    });
    await database.subscription.update({
      data: { graceEndsAt: new Date(Date.now() - 1_000) },
      where: { organizationId: organization.organizationId },
    });
    const automaticSuspension = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(
      automaticSuspension.json<{
        current: { readOnly: boolean; status: string };
      }>().current,
    ).toMatchObject({ readOnly: false, status: 'free' });
    const limitResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Segunda sucursal',
        phone: '0999999999',
        slug: 'segunda-sucursal',
        timezone: 'America/Guayaquil',
      },
      url: '/v1/locations',
    });
    expect(limitResponse.statusCode).toBe(409);
    expect(limitResponse.json<{ code: string }>().code).toBe(
      'PLAN_LIMIT_REACHED',
    );
    expect(
      await database.location.count({
        where: { organizationId: organization.organizationId },
      }),
    ).toBe(1);

    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${ownerToken}` },
          method: 'POST',
          payload: { status: 'active' },
          url: '/v1/subscription/simulate',
        })
      ).statusCode,
    ).toBe(200);

    const serviceBeforeSuspension = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 30,
        name: 'Servicio conservado',
        priceCents: 1_200,
      },
      url: '/v1/services',
    });
    expect(serviceBeforeSuspension.statusCode).toBe(201);
    const suspended = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: { status: 'suspended' },
      url: '/v1/subscription/simulate',
    });
    expect(suspended.statusCode).toBe(200);
    expect(
      suspended.json<{ current: { readOnly: boolean } }>().current.readOnly,
    ).toBe(true);

    const servicesInReadOnly = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/services',
    });
    expect(servicesInReadOnly.statusCode).toBe(200);
    expect(servicesInReadOnly.body).toContain('Servicio conservado');
    const blockedWrite = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 30,
        name: 'Servicio bloqueado',
        priceCents: 1_400,
      },
      url: '/v1/services',
    });
    expect(blockedWrite.statusCode).toBe(423);
    expect(blockedWrite.json<{ code: string }>().code).toBe(
      'SUBSCRIPTION_READ_ONLY',
    );

    const reactivated = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: { status: 'active' },
      url: '/v1/subscription/simulate',
    });
    expect(reactivated.statusCode).toBe(200);
    const serviceAfterReactivation = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 30,
        name: 'Servicio reactivado',
        priceCents: 1_400,
      },
      url: '/v1/services',
    });
    expect(serviceAfterReactivation.statusCode).toBe(201);
    expect(
      (
        await database.auditLog.findMany({
          select: { action: true },
          where: { organizationId: organization.organizationId },
        })
      ).map(({ action }) => action),
    ).toEqual(
      expect.arrayContaining([
        'subscription.reactivated_simulation',
        'subscription.suspended_simulation',
      ]),
    );

    const professionalResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: { accountType: 'professional' },
      url: '/v1/onboarding/account-type',
    });
    expect(professionalResponse.statusCode).toBe(200);
    expect(
      professionalResponse.json<{ accountType: string }>().accountType,
    ).toBe('professional');

    const businessResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: { accountType: 'business' },
      url: '/v1/onboarding/account-type',
    });
    expect(businessResponse.statusCode).toBe(200);

    const invitationResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        email: 'settings-invited@example.com',
        fullName: 'Invitado pendiente',
        locationId: organization.locationId,
        role: 'receptionist',
      },
      url: '/v1/team/invitations',
    });
    expect(invitationResponse.statusCode).toBe(201);

    const blockedResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: { accountType: 'professional' },
      url: '/v1/onboarding/account-type',
    });
    expect(blockedResponse.statusCode).toBe(409);
    expect(blockedResponse.json<{ code: string }>().code).toBe(
      'PROFESSIONAL_ACCOUNT_REQUIRES_SOLO_OPERATION',
    );
  });

  it('habilita inventario y reportes completos en Nava Esencial', async () => {
    const ownerToken = await register('essential-entitlements@example.com');
    const organization = await onboard(ownerToken, 'essential-entitlements');
    const [essentialPlan, freePlan] = await Promise.all([
      database.plan.findUniqueOrThrow({ where: { code: 'essential' } }),
      database.plan.findUniqueOrThrow({ where: { code: 'free' } }),
    ]);
    await database.subscription.update({
      data: {
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currentPeriodStart: new Date(),
        graceEndsAt: null,
        planId: essentialPlan.id,
        status: 'ACTIVE',
        trialEndsAt: null,
      },
      where: { organizationId: organization.organizationId },
    });

    const essentialSubscription = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(essentialSubscription.statusCode).toBe(200);
    expect(
      essentialSubscription.json<{
        current: {
          featureFlags: { fullReports: boolean; inventory: boolean };
          planCode: string;
        };
      }>().current,
    ).toMatchObject({
      featureFlags: { fullReports: true, inventory: true },
      planCode: 'essential',
    });
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${ownerToken}` },
          method: 'GET',
          url: '/v1/inventory',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${ownerToken}` },
          method: 'GET',
          url: '/v1/reports/business-summary?range=today',
        })
      ).statusCode,
    ).toBe(200);

    await database.subscription.update({
      data: { planId: freePlan.id, status: 'FREE' },
      where: { organizationId: organization.organizationId },
    });
    for (const url of [
      '/v1/inventory',
      '/v1/reports/business-summary?range=today',
    ]) {
      const response = await app.inject({
        headers: { authorization: `Bearer ${ownerToken}` },
        method: 'GET',
        url,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json<{ code: string }>().code).toBe(
        'PLAN_FEATURE_NOT_INCLUDED',
      );
    }
  });

  it('vence planes activos, aplica gracia y suspende nuevas escrituras', async () => {
    const ownerToken = await register('active-expiry-owner@example.com');
    const organization = await onboard(ownerToken, 'active-expiry');
    const activationResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: { status: 'active' },
      url: '/v1/subscription/simulate',
    });
    expect(activationResponse.statusCode).toBe(200);

    const activatedSubscription = await database.subscription.findUnique({
      where: { organizationId: organization.organizationId },
    });
    expect(activatedSubscription?.trialEndsAt).toBeNull();
    expect(
      (activatedSubscription?.graceEndsAt?.getTime() ?? 0) -
        (activatedSubscription?.currentPeriodEnd.getTime() ?? 0),
    ).toBe(GRACE_DAYS * 24 * 60 * 60 * 1000);

    const expiredPeriodEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await database.subscription.update({
      data: {
        currentPeriodEnd: expiredPeriodEnd,
        graceEndsAt: null,
        status: 'ACTIVE',
      },
      where: { organizationId: organization.organizationId },
    });

    const graceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(graceResponse.statusCode).toBe(200);
    const grace = graceResponse.json<{
      current: { graceEndsAt: string; readOnly: boolean; status: string };
    }>().current;
    expect(grace).toMatchObject({ readOnly: false, status: 'past_due' });
    expect(new Date(grace.graceEndsAt).getTime()).toBe(
      expiredPeriodEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
    );

    await database.subscription.update({
      data: { graceEndsAt: new Date(Date.now() - 1_000) },
      where: { organizationId: organization.organizationId },
    });
    const suspendedResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(suspendedResponse.statusCode).toBe(200);
    expect(
      suspendedResponse.json<{
        current: { readOnly: boolean; status: string };
      }>().current,
    ).toMatchObject({ readOnly: false, status: 'free' });

    const blockedWrite = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 30,
        name: 'Servicio fuera de vigencia',
        priceCents: 1_400,
      },
      url: '/v1/services',
    });
    expect(blockedWrite.statusCode).toBe(201);
  });
  it('configura equipo, servicios y horarios con auditoría', async () => {
    const ownerToken = await register('phase2-owner@example.com');
    const organization = await onboard(ownerToken, 'fase-dos');
    const subscription = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/subscription',
    });
    expect(
      subscription.json<{ current: { limits: { teamMembers: number } } }>()
        .current.limits.teamMembers,
    ).toBe(12);

    const invitationResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        email: 'phase2-barber@example.com',
        fullName: 'Barbero Fase Dos',
        locationId: organization.locationId,
        role: 'barber',
      },
      url: '/v1/team/invitations',
    });
    expect(invitationResponse.statusCode).toBe(201);
    const invitationToken = lastInvitationToken();
    expect(invitationMessages.at(-1)?.email).toBe('phase2-barber@example.com');
    const barberMembershipId = invitationResponse.json<{
      member: { id: string; status: string };
    }>().member.id;
    expect(
      invitationResponse.json<{ member: { status: string } }>().member.status,
    ).toBe('invited');
    const teamBeforeAcceptance = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/team',
    });
    expect(teamBeforeAcceptance.statusCode).toBe(200);
    expect(
      teamBeforeAcceptance
        .json<{ members: Array<{ id: string }> }>()
        .members.some(({ id }) => id === barberMembershipId),
    ).toBe(false);
    expect(
      teamBeforeAcceptance.json<{
        pendingInvitations: Array<{
          activationStatus: string;
          email: string;
        }>;
      }>().pendingInvitations,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activationStatus: 'pending_acceptance',
          email: 'phase2-barber@example.com',
        }),
      ]),
    );

    const categoryResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: { name: 'Cabello', sortOrder: 1 },
      url: '/v1/service-categories',
    });
    expect(categoryResponse.statusCode).toBe(201);
    const categoryId = categoryResponse.json<{ category: { id: string } }>()
      .category.id;

    const invalidServiceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 17,
        name: 'Duración inválida',
        priceCents: 900,
      },
      url: '/v1/services',
    });
    expect(invalidServiceResponse.statusCode).toBe(400);

    const serviceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        categoryId,
        durationMinutes: 30,
        name: 'Corte clásico',
        priceCents: 1200,
      },
      url: '/v1/services',
    });
    expect(serviceResponse.statusCode).toBe(201);
    const serviceId = serviceResponse.json<{ service: { id: string } }>()
      .service.id;

    const updateServiceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: {
        categoryId,
        description: 'Servicio actualizado desde gestión',
        durationMinutes: 45,
        name: 'Corte clásico actualizado',
        onlineBooking: false,
        priceCents: 1500,
      },
      url: `/v1/services/${serviceId}`,
    });
    expect(updateServiceResponse.statusCode).toBe(200);
    expect(
      updateServiceResponse.json<{
        service: { durationMinutes: number; onlineBooking: boolean };
      }>().service,
    ).toMatchObject({ durationMinutes: 45, onlineBooking: false });

    const assignmentResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        customDurationMinutes: 35,
        customPriceCents: 1400,
        locationId: organization.locationId,
        membershipId: barberMembershipId,
        serviceId,
      },
      url: '/v1/services/assignments',
    });
    expect(assignmentResponse.statusCode, assignmentResponse.body).toBe(201);

    const scheduleResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PUT',
      payload: {
        locationId: organization.locationId,
        membershipId: barberMembershipId,
        schedules: [
          { endMinute: 720, startMinute: 540, weekday: 1 },
          { endMinute: 1020, startMinute: 780, weekday: 1 },
        ],
      },
      url: '/v1/schedules',
    });
    expect(scheduleResponse.statusCode).toBe(200);

    const archiveServiceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'DELETE',
      url: `/v1/services/${serviceId}`,
    });
    expect(archiveServiceResponse.statusCode).toBe(204);
    const servicesAfterArchive = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/services',
    });
    expect(
      servicesAfterArchive
        .json<{ services: Array<{ id: string }> }>()
        .services.some(({ id }) => id === serviceId),
    ).toBe(false);

    const reactivateServiceResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        categoryId,
        description: 'Servicio reactivado desde gestión',
        durationMinutes: 40,
        name: 'Corte clásico actualizado',
        onlineBooking: true,
        priceCents: 1450,
      },
      url: '/v1/services',
    });
    expect(reactivateServiceResponse.statusCode).toBe(201);
    expect(
      reactivateServiceResponse.json<{ service: { id: string } }>().service.id,
    ).toBe(serviceId);

    const barberToken = await register('phase2-barber@example.com');
    const accessBeforeAcceptance = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'GET',
      url: '/v1/team',
    });
    expect(accessBeforeAcceptance.statusCode).toBe(403);

    await database.user.update({
      data: { emailVerifiedAt: null },
      where: { email: 'phase2-barber@example.com' },
    });
    const unverifiedAcceptanceResponse = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'POST',
      payload: { token: invitationToken },
      url: '/v1/team/invitations/accept',
    });
    expect(unverifiedAcceptanceResponse.statusCode).toBe(403);
    expect(unverifiedAcceptanceResponse.json<{ code: string }>().code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    await database.user.update({
      data: { emailVerifiedAt: new Date() },
      where: { email: 'phase2-barber@example.com' },
    });

    const acceptanceResponse = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'POST',
      payload: { token: invitationToken },
      url: '/v1/team/invitations/accept',
    });
    expect(acceptanceResponse.statusCode).toBe(200);
    expect(
      acceptanceResponse.json<{ membership: { id: string } }>().membership.id,
    ).toBe(barberMembershipId);
    expect(
      await database.professionalService.findUnique({
        where: {
          membershipId_serviceId_locationId: {
            locationId: organization.locationId,
            membershipId: barberMembershipId,
            serviceId,
          },
        },
      }),
    ).not.toBeNull();
    const reusedInvitationResponse = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'POST',
      payload: { token: invitationToken },
      url: '/v1/team/invitations/accept',
    });
    expect(reusedInvitationResponse.statusCode).toBe(400);
    expect(reusedInvitationResponse.json<{ code: string }>().code).toBe(
      'INVALID_INVITATION',
    );

    const teamAfterAcceptance = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/team',
    });
    expect(
      teamAfterAcceptance
        .json<{ members: Array<{ id: string }> }>()
        .members.some(({ id }) => id === barberMembershipId),
    ).toBe(true);
    const forbiddenGlobalReport = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'GET',
      url: '/v1/reports/business-summary?range=today',
    });
    expect(forbiddenGlobalReport.statusCode).toBe(403);
    expect(
      teamAfterAcceptance.json<{
        pendingInvitations: Array<{ email: string }>;
      }>().pendingInvitations,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'phase2-barber@example.com' }),
      ]),
    );

    const blockResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        endsAt: '2030-01-15T17:00:00.000Z',
        locationId: organization.locationId,
        membershipId: barberMembershipId,
        reason: 'Capacitación',
        startsAt: '2030-01-15T14:00:00.000Z',
      },
      url: '/v1/schedule-blocks',
    });
    expect(blockResponse.statusCode).toBe(201);

    const teamForBarber = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'GET',
      url: '/v1/team',
    });
    expect(teamForBarber.statusCode).toBe(200);
    const visibleMembers = teamForBarber.json<{ members: { id: string }[] }>()
      .members;
    expect(visibleMembers.map(({ id }) => id)).toEqual([barberMembershipId]);

    const schedulesForBarber = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'GET',
      url: '/v1/schedules',
    });
    expect(schedulesForBarber.statusCode).toBe(200);
    const visibleSchedules = schedulesForBarber.json<{
      schedules: { membershipId: string }[];
    }>().schedules;
    expect(visibleSchedules).toHaveLength(2);
    expect(
      visibleSchedules.every(
        ({ membershipId }) => membershipId === barberMembershipId,
      ),
    ).toBe(true);
    expect(
      schedulesForBarber.json<{ blocks: unknown[] }>().blocks,
    ).toHaveLength(1);

    const actions = await database.auditLog.findMany({
      select: { action: true },
      where: { organizationId: organization.organizationId },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'team.invitation.created',
        'team.invitation.accepted',
        'service_category.created',
        'service.created',
        'service.updated',
        'service.archived',
        'service.reactivated',
        'professional_service.assigned',
        'weekly_schedule.replaced',
        'schedule_block.created',
      ]),
    );
  });

  it('reasigna las sucursales de un receptionist activo', async () => {
    const ownerToken = await register('reassignment-owner@example.com');
    const organization = await onboard(ownerToken, 'reasignacion-recepcion');
    const receptionistToken = await register(
      'reassignment-receptionist@example.com',
    );
    const secondLocation = await database.location.create({
      data: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Sucursal Norte',
        organizationId: organization.organizationId,
        phone: '0999999998',
        slug: 'reasignacion-recepcion-norte',
        timezone: 'America/Guayaquil',
        whatsappPhone: '0999999998',
      },
    });
    const manager = await database.user.create({
      data: {
        email: 'reassignment-manager@example.com',
        fullName: 'Gerente Norte',
      },
    });
    const managerMembership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'MANAGER',
        userId: manager.id,
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: secondLocation.id,
        membershipId: managerMembership.id,
      },
    });
    const invitationResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        email: 'reassignment-receptionist@example.com',
        fullName: 'Recepcionista reasignada',
        locationId: organization.locationId,
        role: 'receptionist',
      },
      url: '/v1/team/invitations',
    });
    expect(invitationResponse.statusCode).toBe(201);
    const membershipId = invitationResponse.json<{ member: { id: string } }>()
      .member.id;
    const acceptanceResponse = await app.inject({
      headers: { authorization: `Bearer ${receptionistToken}` },
      method: 'POST',
      payload: { token: lastInvitationToken() },
      url: '/v1/team/invitations/accept',
    });
    expect(acceptanceResponse.statusCode).toBe(200);
    const receptionistUserId = (
      await database.membership.findUniqueOrThrow({
        select: { userId: true },
        where: { id: membershipId },
      })
    ).userId;
    const ownerUserId = (
      await database.membership.findFirstOrThrow({
        select: { userId: true },
        where: {
          organizationId: organization.organizationId,
          role: 'OWNER',
        },
      })
    ).userId;

    const locationsResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/team/locations',
    });
    expect(locationsResponse.statusCode).toBe(200);
    expect(
      locationsResponse.json<{ locations: Array<{ id: string }> }>(),
    ).toMatchObject({
      locations: [{ id: organization.locationId }, { id: secondLocation.id }],
    });

    const reassignmentResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: {
        commissionPercentage: null,
        fullName: 'Recepcionista reasignada',
        locationIds: [secondLocation.id],
        role: 'manager',
      },
      url: `/v1/team/members/${membershipId}`,
    });

    expect(reassignmentResponse.statusCode).toBe(200);
    expect(
      await database.memberLocation.findMany({
        orderBy: { locationId: 'asc' },
        where: { membershipId },
      }),
    ).toEqual([expect.objectContaining({ locationId: secondLocation.id })]);

    const notifications = await database.appNotification.findMany({
      select: { body: true, type: true, userId: true },
      where: { organizationId: organization.organizationId },
    });
    const teamUpdateNotifications = notifications.filter(
      ({ type }) => String(type) === 'TEAM_MEMBER_UPDATED',
    );
    expect(teamUpdateNotifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.stringContaining('actualiz\u00f3'),
          type: 'TEAM_MEMBER_UPDATED',
          userId: receptionistUserId,
        }),
        expect.objectContaining({
          type: 'TEAM_MEMBER_UPDATED',
          userId: manager.id,
        }),
      ]),
    );
    expect(teamUpdateNotifications).toHaveLength(2);
    expect(teamUpdateNotifications).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TEAM_MEMBER_UPDATED',
          userId: ownerUserId,
        }),
      ]),
    );
  });

  it('permite convertir recepci\u00f3n en profesional durante la demo activa', async () => {
    const ownerToken = await register('trial-role-owner@example.com');
    const organization = await onboard(ownerToken, 'trial-role-change');
    const receptionist = await database.user.create({
      data: {
        email: 'trial-role-receptionist@example.com',
        fullName: 'Recepcionista Demo',
      },
    });
    const membership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'RECEPTIONIST',
        userId: receptionist.id,
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: organization.locationId,
        membershipId: membership.id,
      },
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: {
        commissionPercentage: 45,
        fullName: 'Profesional Demo',
        locationIds: [organization.locationId],
        role: 'barber',
      },
      url: `/v1/team/members/${membership.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ member: { role: string } }>().member.role).toBe(
      'barber',
    );
    await expect(
      database.membership.findUniqueOrThrow({ where: { id: membership.id } }),
    ).resolves.toMatchObject({ role: 'BARBER' });
  });

  it('notifica al profesional cuando se reemplaza su horario semanal', async () => {
    const agenda = await setupAgenda('schedule-update-notification');
    await database.appNotification.deleteMany({
      where: { organizationId: agenda.organizationId },
    });
    const [{ userId: barberUserId }, { userId: ownerUserId }] =
      await Promise.all([
        database.membership.findUniqueOrThrow({
          select: { userId: true },
          where: { id: agenda.membershipId },
        }),
        database.membership.findFirstOrThrow({
          select: { userId: true },
          where: {
            organizationId: agenda.organizationId,
            role: 'OWNER',
          },
        }),
      ]);

    const response = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'PUT',
      payload: {
        locationId: agenda.locationId,
        membershipId: agenda.membershipId,
        schedules: [{ endMinute: 1080, startMinute: 600, weekday: 2 }],
      },
      url: '/v1/schedules',
    });

    expect(response.statusCode).toBe(200);
    const scheduleUpdateNotifications = (
      await database.appNotification.findMany({
        select: { type: true, userId: true },
        where: { organizationId: agenda.organizationId },
      })
    ).filter(({ type }) => String(type) === 'SCHEDULE_UPDATED');
    expect(scheduleUpdateNotifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SCHEDULE_UPDATED',
          userId: barberUserId,
        }),
      ]),
    );
    expect(scheduleUpdateNotifications).toHaveLength(1);
    expect(scheduleUpdateNotifications).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SCHEDULE_UPDATED',
          userId: ownerUserId,
        }),
      ]),
    );
  });

  it('guarda asignaciones informativas para un administrador', async () => {
    const ownerToken = await register('manager-location-owner@example.com');
    const organization = await onboard(ownerToken, 'manager-location');
    const secondLocation = await database.location.create({
      data: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Sucursal Norte',
        organizationId: organization.organizationId,
        phone: '0999999998',
        slug: 'manager-location-norte',
        timezone: 'America/Guayaquil',
        whatsappPhone: '0999999998',
      },
    });
    const manager = await database.user.create({
      data: {
        email: 'manager-location@example.com',
        fullName: 'Administradora de sucursal',
      },
    });
    const membership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'MANAGER',
        userId: manager.id,
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: organization.locationId,
        membershipId: membership.id,
      },
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: {
        commissionPercentage: null,
        fullName: 'Administradora de sucursal',
        locationIds: [secondLocation.id],
        role: 'manager',
      },
      url: `/v1/team/members/${membership.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(
      await database.memberLocation.findMany({
        where: { membershipId: membership.id },
      }),
    ).toEqual([expect.objectContaining({ locationId: secondLocation.id })]);
  });

  it('rechaza asignaciones directas cuando el negocio queda en Free', async () => {
    const ownerToken = await register('free-location-owner@example.com');
    const organization = await onboard(ownerToken, 'free-location');
    const receptionist = await database.user.create({
      data: {
        email: 'free-location-receptionist@example.com',
        fullName: 'Recepcionista Free',
      },
    });
    const membership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'RECEPTIONIST',
        userId: receptionist.id,
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: organization.locationId,
        membershipId: membership.id,
      },
    });
    const freePlan = await database.plan.findUniqueOrThrow({
      where: { code: 'free' },
    });
    await database.subscription.update({
      data: {
        planId: freePlan.id,
        status: 'FREE',
        trialEndsAt: null,
      },
      where: { organizationId: organization.organizationId },
    });

    const teamResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'GET',
      url: '/v1/team',
    });
    expect(teamResponse.statusCode).toBe(200);
    expect(
      teamResponse.json<{
        assignmentCapabilities: {
          canEditAssignments: boolean;
          reason: string | null;
        };
      }>().assignmentCapabilities,
    ).toEqual({
      canEditAssignments: false,
      maxActiveLocations: 1,
      reason: 'plan_team_not_available',
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: {
        commissionPercentage: null,
        fullName: 'Recepcionista Free',
        locationIds: [organization.locationId],
        role: 'receptionist',
      },
      url: `/v1/team/members/${membership.id}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe(
      'PLAN_TEAM_NOT_AVAILABLE',
    );
  });

  it('asigna servicios activos al agregar una sucursal a un profesional', async () => {
    const ownerToken = await register('barber-location-owner@example.com');
    const organization = await onboard(ownerToken, 'barber-location');
    const secondLocation = await database.location.create({
      data: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Sucursal Norte',
        organizationId: organization.organizationId,
        phone: '0999999998',
        slug: 'barber-location-norte',
        timezone: 'America/Guayaquil',
        whatsappPhone: '0999999998',
      },
    });
    const barber = await database.user.create({
      data: {
        email: 'barber-location@example.com',
        fullName: 'Profesional Norte',
      },
    });
    const membership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'BARBER',
        userId: barber.id,
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: organization.locationId,
        membershipId: membership.id,
      },
    });
    const service = await database.service.create({
      data: {
        durationMinutes: 30,
        name: 'Corte Norte',
        organizationId: organization.organizationId,
        priceCents: 1200,
      },
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: {
        commissionPercentage: 40,
        fullName: 'Profesional Norte',
        locationIds: [organization.locationId, secondLocation.id],
        role: 'barber',
      },
      url: `/v1/team/members/${membership.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(
      await database.professionalService.findUnique({
        where: {
          membershipId_serviceId_locationId: {
            locationId: secondLocation.id,
            membershipId: membership.id,
            serviceId: service.id,
          },
        },
      }),
    ).not.toBeNull();
    expect(
      await database.weeklySchedule.count({
        where: { locationId: secondLocation.id, membershipId: membership.id },
      }),
    ).toBe(0);
  });

  it('sincroniza el catálogo del propietario al crear una sucursal', async () => {
    const ownerToken = await register('owner-new-location@example.com');
    const organization = await onboard(ownerToken, 'owner-new-location');
    const firstService = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 30,
        name: 'Corte inicial',
        priceCents: 1200,
      },
      url: '/v1/services',
    });
    expect(firstService.statusCode).toBe(201);
    const firstServiceId = firstService.json<{ service: { id: string } }>()
      .service.id;

    const locationResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Sucursal Centro',
        phone: '0999999997',
        slug: 'owner-new-location-sur',
        timezone: 'America/Guayaquil',
      },
      url: '/v1/locations',
    });
    expect(locationResponse.statusCode, locationResponse.body).toBe(201);
    const locationId = locationResponse.json<{ location: { id: string } }>()
      .location.id;
    const owner = await database.membership.findFirstOrThrow({
      where: { organizationId: organization.organizationId, role: 'OWNER' },
    });
    expect(
      await database.professionalService.findUnique({
        where: {
          membershipId_serviceId_locationId: {
            locationId,
            membershipId: owner.id,
            serviceId: firstServiceId,
          },
        },
      }),
    ).not.toBeNull();

    const secondService = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 45,
        name: 'Barba completa',
        priceCents: 1500,
      },
      url: '/v1/services',
    });
    expect(secondService.statusCode).toBe(201);
    const secondServiceId = secondService.json<{ service: { id: string } }>()
      .service.id;
    expect(
      await database.professionalService.count({
        where: { membershipId: owner.id, serviceId: secondServiceId },
      }),
    ).toBe(2);
  });

  it('permite retirar manualmente un servicio de un profesional en una sucursal', async () => {
    const ownerToken = await register(
      'barber-service-removal-owner@example.com',
    );
    const organization = await onboard(ownerToken, 'barber-service-removal');
    const barber = await database.user.create({
      data: {
        email: 'barber-service-removal@example.com',
        fullName: 'Profesional de prueba',
      },
    });
    const membership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'BARBER',
        userId: barber.id,
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: organization.locationId,
        membershipId: membership.id,
      },
    });
    const service = await database.service.create({
      data: {
        durationMinutes: 30,
        name: 'Coloración',
        organizationId: organization.organizationId,
        priceCents: 2500,
      },
    });
    await database.professionalService.create({
      data: {
        locationId: organization.locationId,
        membershipId: membership.id,
        serviceId: service.id,
      },
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'DELETE',
      payload: {
        locationId: organization.locationId,
        membershipId: membership.id,
        serviceId: service.id,
      },
      url: '/v1/services/assignments',
    });

    expect(response.statusCode).toBe(204);
    expect(
      await database.professionalService.findUnique({
        where: {
          membershipId_serviceId_locationId: {
            locationId: organization.locationId,
            membershipId: membership.id,
            serviceId: service.id,
          },
        },
      }),
    ).toBeNull();
  });

  it('impide retirar una sucursal de un profesional con citas futuras', async () => {
    const ownerToken = await register('barber-removal-owner@example.com');
    const organization = await onboard(ownerToken, 'barber-removal');
    const secondLocation = await database.location.create({
      data: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Sucursal Norte',
        organizationId: organization.organizationId,
        phone: '0999999997',
        slug: 'barber-removal-norte',
        timezone: 'America/Guayaquil',
        whatsappPhone: '0999999997',
      },
    });
    const barber = await database.user.create({
      data: {
        email: 'barber-removal@example.com',
        fullName: 'Profesional Norte',
      },
    });
    const membership = await database.membership.create({
      data: {
        organizationId: organization.organizationId,
        role: 'BARBER',
        userId: barber.id,
      },
    });
    await database.memberLocation.createMany({
      data: [
        {
          locationId: organization.locationId,
          membershipId: membership.id,
        },
        { locationId: secondLocation.id, membershipId: membership.id },
      ],
    });
    await database.appointment.create({
      data: {
        clientName: 'Cliente con reserva',
        endsAt: new Date('2031-01-14T16:30:00.000Z'),
        locationId: secondLocation.id,
        organizationId: organization.organizationId,
        professionalMembershipId: membership.id,
        startsAt: new Date('2031-01-14T16:00:00.000Z'),
      },
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'PATCH',
      payload: {
        commissionPercentage: 40,
        fullName: 'Profesional Norte',
        locationIds: [organization.locationId],
        role: 'barber',
      },
      url: `/v1/team/members/${membership.id}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'MEMBER_LOCATION_HAS_FUTURE_APPOINTMENTS',
    });
    expect(
      await database.memberLocation.findUnique({
        where: {
          membershipId_locationId: {
            locationId: secondLocation.id,
            membershipId: membership.id,
          },
        },
      }),
    ).not.toBeNull();
  });

  it('archiva una sucursal sin borrar sus citas históricas', async () => {
    const ownerToken = await register('location-archive-owner@example.com');
    const organization = await onboard(ownerToken, 'location-archive');
    const secondLocation = await database.location.create({
      data: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Sucursal Norte',
        organizationId: organization.organizationId,
        phone: '0999999996',
        slug: 'location-archive-norte',
        timezone: 'America/Guayaquil',
        whatsappPhone: '0999999996',
      },
    });
    const ownerMembership = await database.membership.findFirstOrThrow({
      where: {
        organizationId: organization.organizationId,
        role: 'OWNER',
      },
    });
    await database.appointment.create({
      data: {
        clientName: 'Cliente histórico',
        endsAt: new Date('2025-01-14T16:30:00.000Z'),
        locationId: secondLocation.id,
        organizationId: organization.organizationId,
        professionalMembershipId: ownerMembership.id,
        startsAt: new Date('2025-01-14T16:00:00.000Z'),
        status: 'COMPLETED',
      },
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      url: `/v1/locations/${secondLocation.id}/archive`,
    });

    expect(response.statusCode).toBe(200);
    expect(
      await database.location.findUnique({ where: { id: secondLocation.id } }),
    ).toMatchObject({ isActive: false });
    expect(
      await database.appointment.count({
        where: { locationId: secondLocation.id },
      }),
    ).toBe(1);
  });

  it.each([
    ['la última sucursal activa', 'LAST_ACTIVE_LOCATION'],
    ['una caja abierta', 'LOCATION_CASH_REGISTER_OPEN'],
    ['citas futuras', 'LOCATION_HAS_FUTURE_APPOINTMENTS'],
  ])('rechaza archivar %s', async (blocker, expectedCode) => {
    const testSlug = expectedCode.toLowerCase().replace(/_/gu, '-');
    const ownerToken = await register(
      `location-archive-blocker-${expectedCode.toLowerCase()}@example.com`,
    );
    const organization = await onboard(
      ownerToken,
      `location-archive-blocker-${testSlug}`,
    );
    const ownerMembership = await database.membership.findFirstOrThrow({
      where: {
        organizationId: organization.organizationId,
        role: 'OWNER',
      },
    });
    const targetLocation =
      blocker === 'la última sucursal activa'
        ? { id: organization.locationId }
        : await database.location.create({
            data: {
              city: 'Quito',
              countryCode: 'EC',
              currencyCode: 'USD',
              name: 'Sucursal Norte',
              organizationId: organization.organizationId,
              phone: '0999999995',
              slug: `location-blocker-${testSlug}`,
              timezone: 'America/Guayaquil',
              whatsappPhone: '0999999995',
            },
          });
    if (blocker === 'una caja abierta') {
      await database.cashRegisterSession.create({
        data: {
          locationId: targetLocation.id,
          openingAmountCents: 0,
          organizationId: organization.organizationId,
          ownerUserId: ownerMembership.userId,
          responsibleMembershipId: ownerMembership.id,
          responsibleName: 'Propietario',
        },
      });
    }
    if (blocker === 'citas futuras') {
      await database.appointment.create({
        data: {
          clientName: 'Cliente con reserva',
          endsAt: new Date('2031-01-14T16:30:00.000Z'),
          locationId: targetLocation.id,
          organizationId: organization.organizationId,
          professionalMembershipId: ownerMembership.id,
          startsAt: new Date('2031-01-14T16:00:00.000Z'),
        },
      });
    }

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      url: `/v1/locations/${targetLocation.id}/archive`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: expectedCode });
    expect(
      await database.location.findUnique({ where: { id: targetLocation.id } }),
    ).toMatchObject({ isActive: true });
  });

  it('restaura una sucursal archivada y conserva sus asignaciones', async () => {
    const ownerToken = await register('location-restore-owner@example.com');
    const organization = await onboard(ownerToken, 'location-restore');
    const secondLocation = await database.location.create({
      data: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        isActive: false,
        name: 'Sucursal Norte',
        organizationId: organization.organizationId,
        phone: '0999999994',
        slug: 'location-restore-norte',
        timezone: 'America/Guayaquil',
        whatsappPhone: '0999999994',
      },
    });
    const ownerMembership = await database.membership.findFirstOrThrow({
      where: {
        organizationId: organization.organizationId,
        role: 'OWNER',
      },
    });
    await database.memberLocation.create({
      data: { locationId: secondLocation.id, membershipId: ownerMembership.id },
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      url: `/v1/locations/${secondLocation.id}/restore`,
    });

    expect(response.statusCode).toBe(200);
    expect(
      await database.location.findUnique({ where: { id: secondLocation.id } }),
    ).toMatchObject({ isActive: true });
    expect(
      await database.memberLocation.findUnique({
        where: {
          membershipId_locationId: {
            locationId: secondLocation.id,
            membershipId: ownerMembership.id,
          },
        },
      }),
    ).not.toBeNull();
  });

  it('administra el horario general y lo aplica a la disponibilidad', async () => {
    const agenda = await setupAgenda('horario-negocio');
    const initialResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: '/v1/business-schedule',
    });
    expect(initialResponse.statusCode).toBe(200);
    const initial = initialResponse.json<{
      bookingSlotIntervalMinutes: number;
      days: {
        endMinute: number;
        isOpen: boolean;
        startMinute: number;
        weekday: number;
      }[];
      locationId: string;
    }>();
    expect(initial.locationId).toBe(agenda.locationId);
    expect(initial.bookingSlotIntervalMinutes).toBe(5);
    expect(initial.days).toHaveLength(7);
    expect(initial.days).toEqual(
      expect.arrayContaining([
        {
          endMinute: 1080,
          isOpen: true,
          startMinute: 540,
          weekday: 1,
        },
      ]),
    );

    const closedMonday = initial.days.map((day) =>
      day.weekday === 1 ? { ...day, isOpen: false } : day,
    );
    const forbiddenResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'PUT',
      payload: {
        bookingSlotIntervalMinutes: 10,
        days: closedMonday,
        locationId: agenda.locationId,
      },
      url: '/v1/business-schedule',
    });
    expect(forbiddenResponse.statusCode).toBe(403);

    const updateResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'PUT',
      payload: {
        bookingSlotIntervalMinutes: 10,
        days: closedMonday,
        locationId: agenda.locationId,
      },
      url: '/v1/business-schedule',
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse
        .json<{ days: { isOpen: boolean; weekday: number }[] }>()
        .days.find(({ weekday }) => weekday === 1)?.isOpen,
    ).toBe(false);
    expect(
      updateResponse.json<{ bookingSlotIntervalMinutes: number }>()
        .bookingSlotIntervalMinutes,
    ).toBe(10);

    const adjustedAvailability = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      query: {
        date: '2030-01-15',
        locationId: agenda.locationId,
        membershipId: agenda.membershipId,
        serviceIds: agenda.serviceId,
      },
      url: '/v1/availability',
    });
    expect(adjustedAvailability.statusCode).toBe(200);
    const adjustedStarts = adjustedAvailability
      .json<{ slots: Array<{ startsAt: string }> }>()
      .slots.slice(0, 3)
      .map((slot) => Date.parse(slot.startsAt));
    expect(adjustedStarts[1]! - adjustedStarts[0]!).toBe(10 * 60_000);
    expect(adjustedStarts[2]! - adjustedStarts[1]!).toBe(10 * 60_000);

    const availability = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      query: {
        date: '2030-01-14',
        locationId: agenda.locationId,
        membershipId: agenda.membershipId,
        serviceIds: agenda.serviceId,
      },
      url: '/v1/availability',
    });
    expect(availability.statusCode).toBe(200);
    expect(availability.json<{ slots: unknown[] }>().slots).toHaveLength(0);

    const appointment = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        clientName: 'Cliente fuera de horario',
        clientPhone: '0999999999',
        locationId: agenda.locationId,
        professionalMembershipId: agenda.membershipId,
        serviceIds: [agenda.serviceId],
        startsAt: '2030-01-14T15:00:00.000Z',
      },
      url: '/v1/appointments',
    });
    expect(appointment.statusCode).toBe(400);
    expect(appointment.json<{ code: string }>().code).toBe(
      'OUTSIDE_BUSINESS_HOURS',
    );

    const audit = await database.auditLog.findFirst({
      where: {
        action: 'business_weekly_schedule.replaced',
        locationId: agenda.locationId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('devuelve en Agenda solamente horarios que pueden reservarse', async () => {
    const agenda = await setupAgenda('agenda-sin-ocupados-sinteticos');
    await database.service.update({
      data: { durationMinutes: 60 },
      where: { id: agenda.serviceId },
    });
    const created = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        clientName: 'Cliente de una hora',
        locationId: agenda.locationId,
        professionalMembershipId: agenda.membershipId,
        serviceIds: [agenda.serviceId],
        startsAt: '2030-01-14T15:30:00.000Z',
      },
      url: '/v1/appointments',
    });
    expect(created.statusCode, created.body).toBe(201);

    const availability = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      query: {
        date: '2030-01-14',
        locationId: agenda.locationId,
        membershipId: agenda.membershipId,
        serviceIds: agenda.serviceId,
      },
      url: '/v1/availability',
    });

    expect(availability.statusCode).toBe(200);
    expect(availability.json()).not.toHaveProperty('unavailableSlots');
    expect(
      availability.json<{ durationMinutes: number }>().durationMinutes,
    ).toBe(60);
  });

  it('muestra al administrador las citas de la sucursal elegida y limita al barbero a las propias', async () => {
    const agenda = await setupAgenda('agenda-multi-sucursal-visible');
    const ownerMembership = await database.membership.findFirstOrThrow({
      where: {
        organizationId: agenda.organizationId,
        role: 'OWNER',
      },
    });
    const secondLocation = await database.location.create({
      data: {
        city: 'Quito',
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Sucursal agenda norte',
        organizationId: agenda.organizationId,
        phone: '0999999922',
        slug: 'agenda-multi-sucursal-visible-norte',
        timezone: 'America/Guayaquil',
        whatsappPhone: '0999999922',
      },
    });
    await database.memberLocation.create({
      data: {
        locationId: secondLocation.id,
        membershipId: agenda.membershipId,
      },
    });
    const [barberAppointment, ownerAppointment] = await Promise.all([
      database.appointment.create({
        data: {
          clientName: 'Cliente reserva web barbero',
          endsAt: new Date('2030-01-14T16:30:00.000Z'),
          locationId: secondLocation.id,
          organizationId: agenda.organizationId,
          professionalMembershipId: agenda.membershipId,
          source: 'PUBLIC_BOOKING',
          startsAt: new Date('2030-01-14T16:00:00.000Z'),
          status: 'CONFIRMED',
        },
      }),
      database.appointment.create({
        data: {
          clientName: 'Cliente reserva web propietario',
          endsAt: new Date('2030-01-14T17:30:00.000Z'),
          locationId: secondLocation.id,
          organizationId: agenda.organizationId,
          professionalMembershipId: ownerMembership.id,
          source: 'PUBLIC_BOOKING',
          startsAt: new Date('2030-01-14T17:00:00.000Z'),
          status: 'CONFIRMED',
        },
      }),
    ]);
    const query = `from=2030-01-14&to=2030-01-14&locationId=${secondLocation.id}`;

    const ownerResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: `/v1/appointments?${query}`,
    });
    expect(ownerResponse.statusCode, ownerResponse.body).toBe(200);
    expect(
      ownerResponse
        .json<{ appointments: { id: string }[] }>()
        .appointments.map(({ id }) => id),
    ).toEqual([barberAppointment.id, ownerAppointment.id]);

    const barberResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'GET',
      url: `/v1/appointments?${query}&membershipId=${ownerMembership.id}`,
    });
    expect(barberResponse.statusCode, barberResponse.body).toBe(200);
    expect(
      barberResponse
        .json<{ appointments: { id: string }[] }>()
        .appointments.map(({ id }) => id),
    ).toEqual([barberAppointment.id]);
  });

  it('evita doble reserva bajo concurrencia y publica el evento', async () => {
    const agenda = await setupAgenda('agenda-concurrente');
    const availability = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      query: {
        date: '2030-01-14',
        locationId: agenda.locationId,
        membershipId: agenda.membershipId,
        serviceIds: agenda.serviceId,
      },
      url: '/v1/availability',
    });
    expect(availability.statusCode).toBe(200);
    const startsAt = availability.json<{
      durationMinutes: number;
      slots: { startsAt: string }[];
    }>();
    expect(startsAt.durationMinutes).toBe(30);
    expect(startsAt.slots.length).toBeGreaterThan(0);
    const payload = {
      clientName: 'Cliente simultáneo',
      locationId: agenda.locationId,
      professionalMembershipId: agenda.membershipId,
      serviceIds: [agenda.serviceId],
      startsAt: startsAt.slots[0]?.startsAt,
    };
    const responses = await Promise.all([
      app.inject({
        headers: { authorization: `Bearer ${agenda.ownerToken}` },
        method: 'POST',
        payload,
        url: '/v1/appointments',
      }),
      app.inject({
        headers: { authorization: `Bearer ${agenda.ownerToken}` },
        method: 'POST',
        payload,
        url: '/v1/appointments',
      }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
      201, 409,
    ]);
    const created = responses
      .find(({ statusCode }) => statusCode === 201)
      ?.json<{
        appointment: { endsAt: string; startsAt: string };
      }>().appointment;
    expect(
      new Date(created?.endsAt ?? 0).getTime() -
        new Date(created?.startsAt ?? 0).getTime(),
    ).toBe(30 * 60_000);

    const eventsResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'GET',
      query: { after: '0' },
      url: '/v1/appointment-events',
    });
    expect(eventsResponse.statusCode).toBe(200);
    expect(
      eventsResponse.json<{ events: { type: string }[] }>().events,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'created' })]),
    );
  });

  it('respeta bloqueos y jornada; reprogramar y cancelar libera el horario', async () => {
    const agenda = await setupAgenda('agenda-ciclo');
    const blockedStartsAt = '2030-01-14T14:00:00.000Z';
    await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        endsAt: '2030-01-14T15:00:00.000Z',
        locationId: agenda.locationId,
        membershipId: agenda.membershipId,
        reason: 'Reunión',
        startsAt: blockedStartsAt,
      },
      url: '/v1/schedule-blocks',
    });
    const basePayload = {
      clientName: 'Cliente agenda',
      locationId: agenda.locationId,
      professionalMembershipId: agenda.membershipId,
      serviceIds: [agenda.serviceId],
    };
    const blockedResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { ...basePayload, startsAt: blockedStartsAt },
      url: '/v1/appointments',
    });
    expect(blockedResponse.statusCode).toBe(409);
    expect(blockedResponse.json<{ message: string }>().message).toContain(
      'bloqueo',
    );

    const outsideResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { ...basePayload, startsAt: '2030-01-14T13:00:00.000Z' },
      url: '/v1/appointments',
    });
    expect(outsideResponse.statusCode).toBe(400);

    const createResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { ...basePayload, startsAt: '2030-01-14T15:00:00.000Z' },
      url: '/v1/appointments',
    });
    expect(createResponse.statusCode, createResponse.body).toBe(201);
    const appointmentId = createResponse.json<{
      appointment: { id: string };
    }>().appointment.id;

    const rescheduleResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'PATCH',
      payload: { startsAt: '2030-01-14T16:00:00.000Z' },
      url: `/v1/appointments/${appointmentId}/reschedule`,
    });
    expect(rescheduleResponse.statusCode).toBe(200);
    expect(
      rescheduleResponse.json<{ appointment: { startsAt: string } }>()
        .appointment.startsAt,
    ).toBe('2030-01-14T16:00:00.000Z');

    const cancelResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { reason: 'Solicitud del cliente' },
      url: `/v1/appointments/${appointmentId}/cancel`,
    });
    expect(cancelResponse.statusCode).toBe(200);
    const replacementResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { ...basePayload, startsAt: '2030-01-14T16:00:00.000Z' },
      url: '/v1/appointments',
    });
    expect(replacementResponse.statusCode).toBe(201);
  });

  it('registra ventas del propietario sin exigir una regla de comision', async () => {
    const agenda = await setupAgenda('venta-propietario-sin-comision');
    const ownerMembership = await database.membership.findFirstOrThrow({
      where: {
        organizationId: agenda.organizationId,
        role: 'OWNER',
      },
    });
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: {
            locationId: agenda.locationId,
            membershipId: ownerMembership.id,
            serviceId: agenda.serviceId,
          },
          url: '/v1/services/assignments',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: { openingAmountCents: 0 },
          url: '/v1/cash-register/open',
        })
      ).statusCode,
    ).toBe(201);

    const sale = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        amountCents: 1_200,
        description: 'Servicio atendido por propietario',
        paymentMethod: 'cash',
        professionalMembershipId: ownerMembership.id,
        serviceId: agenda.serviceId,
        type: 'sale',
      },
      url: '/v1/cash-register/movements',
    });
    expect(sale.statusCode, sale.body).toBe(201);
    const movementId = sale.json<{ movement: { id: string } }>().movement.id;
    expect(
      await database.commissionEntry.findUnique({
        where: { cashMovementId: movementId },
      }),
    ).toBeNull();
  });

  it('genera comisiones idempotentes al cobrar citas y ventas manuales', async () => {
    const agenda = await setupAgenda('comisiones-caja');
    await database.commissionRule.create({
      data: {
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        organizationId: agenda.organizationId,
        professionalMembershipId: agenda.membershipId,
        type: 'SERVICE_PERCENTAGE',
        value: 25,
      },
    });
    const created = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        clientName: 'Cliente comisionable',
        locationId: agenda.locationId,
        professionalMembershipId: agenda.membershipId,
        serviceIds: [agenda.serviceId],
        startsAt: '2030-01-14T15:00:00.000Z',
      },
      url: '/v1/appointments',
    });
    expect(created.statusCode).toBe(201);
    const appointmentId = created.json<{ appointment: { id: string } }>()
      .appointment.id;

    const completed = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'PATCH',
      payload: { status: 'completed' },
      url: `/v1/appointments/${appointmentId}/status`,
    });
    expect(completed.statusCode).toBe(200);
    expect(await database.commissionEntry.count()).toBe(0);

    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: { openingAmountCents: 0 },
          url: '/v1/cash-register/open',
        })
      ).statusCode,
    ).toBe(201);
    const appointmentSale = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        amountCents: 1_200,
        appointmentId,
        description: 'Cobro completo de cita',
        paymentMethod: 'cash',
        type: 'sale',
      },
      url: '/v1/cash-register/movements',
    });
    expect(appointmentSale.statusCode).toBe(201);
    expect(
      await database.commissionEntry.findFirst({
        where: { appointmentId },
      }),
    ).toMatchObject({
      baseAmountCents: 1_200,
      commissionAmountCents: 300,
      professionalMembershipId: agenda.membershipId,
      status: 'PENDING',
    });

    const repeatedCompletion = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'PATCH',
      payload: { status: 'completed' },
      url: `/v1/appointments/${appointmentId}/status`,
    });
    expect(repeatedCompletion.statusCode).toBe(200);
    expect(
      await database.commissionEntry.count({ where: { appointmentId } }),
    ).toBe(1);

    const paidFirst = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        clientName: 'Cliente cobrado primero',
        locationId: agenda.locationId,
        professionalMembershipId: agenda.membershipId,
        serviceIds: [agenda.serviceId],
        startsAt: '2030-01-14T16:00:00.000Z',
      },
      url: '/v1/appointments',
    });
    expect(paidFirst.statusCode).toBe(201);
    const paidFirstAppointmentId = paidFirst.json<{
      appointment: { id: string };
    }>().appointment.id;
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: {
            amountCents: 1_200,
            appointmentId: paidFirstAppointmentId,
            description: 'Cobro antes de completar',
            paymentMethod: 'cash',
            type: 'sale',
          },
          url: '/v1/cash-register/movements',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      await database.commissionEntry.count({
        where: { appointmentId: paidFirstAppointmentId },
      }),
    ).toBe(0);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'PATCH',
          payload: { status: 'completed' },
          url: `/v1/appointments/${paidFirstAppointmentId}/status`,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await database.commissionEntry.findFirst({
        where: { appointmentId: paidFirstAppointmentId },
      }),
    ).toMatchObject({ commissionAmountCents: 300 });

    const manualSale = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        amountCents: 2_000,
        description: 'Servicio vendido sin cita',
        paymentMethod: 'card',
        professionalMembershipId: agenda.membershipId,
        serviceId: agenda.serviceId,
        type: 'sale',
      },
      url: '/v1/cash-register/movements',
    });
    expect(manualSale.statusCode).toBe(201);
    const manualMovementId = manualSale.json<{
      movement: { id: string };
    }>().movement.id;
    const manualEntry = await database.commissionEntry.findUnique({
      where: { cashMovementId: manualMovementId },
    });
    expect(manualEntry).toMatchObject({
      appointmentId: null,
      baseAmountCents: 2_000,
      commissionAmountCents: 500,
      professionalMembershipId: agenda.membershipId,
      status: 'PENDING',
    });
    expect(manualEntry?.calculationSnapshot).toMatchObject({
      serviceId: agenda.serviceId,
      source: 'manual_sale',
    });
  });

  it('reserva, aprueba y paga anticipos dentro de una liquidación auditable', async () => {
    const agenda = await setupAgenda('anticipos-liquidaciones');
    await database.commissionRule.create({
      data: {
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        organizationId: agenda.organizationId,
        professionalMembershipId: agenda.membershipId,
        type: 'SERVICE_PERCENTAGE',
        value: 25,
      },
    });
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: { openingAmountCents: 10_000 },
          url: '/v1/cash-register/open',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: {
            amountCents: 10_000,
            description: 'Venta para liquidación',
            paymentMethod: 'cash',
            professionalMembershipId: agenda.membershipId,
            serviceId: agenda.serviceId,
            type: 'sale',
          },
          url: '/v1/cash-register/movements',
        })
      ).statusCode,
    ).toBe(201);

    const forbiddenAdvance = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'POST',
      payload: {
        amountCents: 3_000,
        paymentMethod: 'cash',
        professionalMembershipId: agenda.membershipId,
      },
      url: '/v1/commissions/advances',
    });
    expect(forbiddenAdvance.statusCode).toBe(403);

    const advanceResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        amountCents: 3_000,
        notes: 'Anticipo solicitado',
        paymentMethod: 'cash',
        professionalMembershipId: agenda.membershipId,
        reference: 'ANT-001',
      },
      url: '/v1/commissions/advances',
    });
    expect(advanceResponse.statusCode, advanceResponse.body).toBe(201);
    const advanceId = advanceResponse.json<{
      advance: { id: string };
    }>().advance.id;
    const reportWithCashAdvance = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: '/v1/reports/business-summary?range=today',
    });
    expect(reportWithCashAdvance.statusCode).toBe(200);
    expect(
      reportWithCashAdvance.json<{
        expenses: { collaboratorPaymentsCents: number };
        sales: { servicesCents: number };
      }>(),
    ).toMatchObject({
      expenses: { collaboratorPaymentsCents: 3_000 },
      sales: { servicesCents: 10_000 },
    });

    const today = localDateForTest(new Date(), 'America/Guayaquil');
    const settlementResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        periodEnd: today,
        periodStart: today,
        professionalMembershipId: agenda.membershipId,
      },
      url: '/v1/commissions/settlements',
    });
    expect(settlementResponse.statusCode).toBe(201);
    const settlement = settlementResponse.json<{
      settlement: {
        advanceDeductionCents: number;
        id: string;
        status: string;
        totalPayableCents: number;
      };
    }>().settlement;
    expect(settlement).toMatchObject({
      advanceDeductionCents: 2_500,
      status: 'draft',
      totalPayableCents: 0,
    });
    expect(
      await database.professionalAdvance.findUnique({
        where: { id: advanceId },
      }),
    ).toMatchObject({
      deductedAmountCents: 0,
      reservedAmountCents: 2_500,
      status: 'PENDING',
    });

    const approved = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {},
      url: `/v1/commissions/settlements/${settlement.id}/approve`,
    });
    expect(approved.statusCode).toBe(200);
    expect(
      await database.professionalAdvance.findUnique({
        where: { id: advanceId },
      }),
    ).toMatchObject({
      deductedAmountCents: 2_500,
      reservedAmountCents: 0,
      status: 'PARTIALLY_DEDUCTED',
    });

    const paid = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {},
      url: `/v1/commissions/settlements/${settlement.id}/pay`,
    });
    expect(paid.statusCode).toBe(200);
    expect(
      paid.json<{ settlement: { status: string } }>().settlement.status,
    ).toBe('paid');
    expect(
      await database.cashMovement.count({
        where: { type: 'COMMISSION_SETTLEMENT' },
      }),
    ).toBe(0);
    expect(
      await database.auditLog.count({
        where: {
          entityId: settlement.id,
          entityType: 'commission_settlement',
        },
      }),
    ).toBe(3);
  });

  it('registra un único reverso de comisión bajo solicitudes concurrentes', async () => {
    const agenda = await setupAgenda('reverso-comision');
    await database.commissionRule.create({
      data: {
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        organizationId: agenda.organizationId,
        professionalMembershipId: agenda.membershipId,
        type: 'SERVICE_PERCENTAGE',
        value: 25,
      },
    });
    await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { openingAmountCents: 0 },
      url: '/v1/cash-register/open',
    });
    const sale = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        amountCents: 4_000,
        description: 'Venta posteriormente anulada',
        paymentMethod: 'cash',
        professionalMembershipId: agenda.membershipId,
        serviceId: agenda.serviceId,
        type: 'sale',
      },
      url: '/v1/cash-register/movements',
    });
    const movementId = sale.json<{ movement: { id: string } }>().movement.id;
    const original = await database.commissionEntry.findUniqueOrThrow({
      where: { cashMovementId: movementId },
    });
    const forbidden = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'POST',
      payload: { reason: 'No autorizado' },
      url: `/v1/commissions/entries/${original.id}/reverse`,
    });
    expect(forbidden.statusCode).toBe(403);
    const responses = await Promise.all([
      app.inject({
        headers: { authorization: `Bearer ${agenda.ownerToken}` },
        method: 'POST',
        payload: { reason: 'Devolución al cliente' },
        url: `/v1/commissions/entries/${original.id}/reverse`,
      }),
      app.inject({
        headers: { authorization: `Bearer ${agenda.ownerToken}` },
        method: 'POST',
        payload: { reason: 'Devolución al cliente' },
        url: `/v1/commissions/entries/${original.id}/reverse`,
      }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    expect(
      await database.commissionEntry.count({
        where: { reversalOfEntryId: original.id },
      }),
    ).toBe(1);
    expect(
      await database.commissionEntry.findUnique({ where: { id: original.id } }),
    ).toMatchObject({ status: 'REVERSED' });
    expect(
      await database.commissionEntry.findUnique({
        where: { reversalOfEntryId: original.id },
      }),
    ).toMatchObject({
      baseAmountCents: -4_000,
      commissionAmountCents: -1_000,
      status: 'PENDING',
    });
    expect(
      await database.auditLog.count({
        where: { action: 'commission_entry.reversed', entityId: original.id },
      }),
    ).toBe(1);
  });

  it('libera reservas al cancelar borradores y permite revertir anticipos sin descuentos', async () => {
    const agenda = await setupAgenda('cancelacion-anticipos');
    await database.commissionRule.create({
      data: {
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        organizationId: agenda.organizationId,
        professionalMembershipId: agenda.membershipId,
        type: 'SERVICE_PERCENTAGE',
        value: 25,
      },
    });
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: { openingAmountCents: 0 },
          url: '/v1/cash-register/open',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${agenda.ownerToken}` },
          method: 'POST',
          payload: {
            amountCents: 8_000,
            description: 'Venta para cancelar liquidación',
            paymentMethod: 'transfer',
            professionalMembershipId: agenda.membershipId,
            serviceId: agenda.serviceId,
            type: 'sale',
          },
          url: '/v1/cash-register/movements',
        })
      ).statusCode,
    ).toBe(201);
    const advanceResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        amountCents: 1_500,
        paymentMethod: 'transfer',
        professionalMembershipId: agenda.membershipId,
        reference: 'TRX-TEST',
      },
      url: '/v1/commissions/advances',
    });
    expect(advanceResponse.statusCode, advanceResponse.body).toBe(201);
    const advanceId = advanceResponse.json<{
      advance: { id: string };
    }>().advance.id;
    const reportWithTransferAdvance = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: '/v1/reports/business-summary?range=today',
    });
    expect(reportWithTransferAdvance.statusCode).toBe(200);
    expect(
      reportWithTransferAdvance.json<{
        expenses: { collaboratorPaymentsCents: number };
        sales: { servicesCents: number };
      }>(),
    ).toMatchObject({
      expenses: { collaboratorPaymentsCents: 1_500 },
      sales: { servicesCents: 8_000 },
    });
    const today = localDateForTest(new Date(), 'America/Guayaquil');
    const settlementResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: {
        periodEnd: today,
        periodStart: today,
        professionalMembershipId: agenda.membershipId,
      },
      url: '/v1/commissions/settlements',
    });
    expect(settlementResponse.statusCode).toBe(201);
    const settlementId = settlementResponse.json<{
      settlement: { id: string };
    }>().settlement.id;
    expect(
      await database.professionalAdvance.findUnique({
        where: { id: advanceId },
      }),
    ).toMatchObject({ reservedAmountCents: 1_500 });

    const cancelled = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { reason: 'Período incorrecto' },
      url: `/v1/commissions/settlements/${settlementId}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(
      await database.professionalAdvance.findUnique({
        where: { id: advanceId },
      }),
    ).toMatchObject({ deductedAmountCents: 0, reservedAmountCents: 0 });
    expect(
      await database.commissionSettlementAdvance.findFirst({
        where: { advanceId, settlementId },
      }),
    ).toMatchObject({ status: 'RELEASED' });
    expect(
      await database.commissionEntry.findFirst({
        where: { organizationId: agenda.organizationId },
      }),
    ).toMatchObject({ settlementId: null, status: 'PENDING' });

    const reversed = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'POST',
      payload: { reason: 'Transferencia no realizada' },
      url: `/v1/commissions/advances/${advanceId}/reverse`,
    });
    expect(reversed.statusCode).toBe(200);
    expect(
      reversed.json<{ advance: { status: string } }>().advance.status,
    ).toBe('reversed');
    const reportAfterAdvanceReversal = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: '/v1/reports/business-summary?range=today',
    });
    expect(
      reportAfterAdvanceReversal.json<{
        expenses: { collaboratorPaymentsCents: number };
      }>().expenses.collaboratorPaymentsCents,
    ).toBe(0);
  });

  it('consolida el control diario con zona horaria, permisos y CSV', async () => {
    const agenda = await setupAgenda('reporte-diario');
    const ownerMembership = await database.membership.findFirstOrThrow({
      where: {
        organizationId: agenda.organizationId,
        role: 'OWNER',
      },
    });
    const completedAppointment = await database.appointment.create({
      data: {
        clientName: 'Cliente atendido',
        endsAt: new Date('2026-08-03T06:00:00.000Z'),
        locationId: agenda.locationId,
        organizationId: agenda.organizationId,
        paymentStatus: 'PAID',
        professionalMembershipId: agenda.membershipId,
        reservesSlot: false,
        services: {
          create: {
            durationMinutes: 30,
            priceCents: 1_200,
            serviceId: agenda.serviceId,
            serviceName: 'Corte agenda',
          },
        },
        startsAt: new Date('2026-08-03T05:30:00.000Z'),
        status: 'COMPLETED',
      },
    });
    await database.appointment.createMany({
      data: [
        {
          clientName: 'Cliente cancelado',
          endsAt: new Date('2026-08-03T07:00:00.000Z'),
          locationId: agenda.locationId,
          organizationId: agenda.organizationId,
          professionalMembershipId: agenda.membershipId,
          reservesSlot: false,
          startsAt: new Date('2026-08-03T06:30:00.000Z'),
          status: 'CANCELLED',
        },
        {
          clientName: 'Cliente ausente',
          endsAt: new Date('2026-08-03T08:00:00.000Z'),
          locationId: agenda.locationId,
          organizationId: agenda.organizationId,
          professionalMembershipId: agenda.membershipId,
          reservesSlot: false,
          startsAt: new Date('2026-08-03T07:30:00.000Z'),
          status: 'NO_SHOW',
        },
        {
          clientName: 'Fuera por zona horaria',
          endsAt: new Date('2026-08-03T05:00:00.000Z'),
          locationId: agenda.locationId,
          organizationId: agenda.organizationId,
          professionalMembershipId: agenda.membershipId,
          reservesSlot: false,
          startsAt: new Date('2026-08-03T04:30:00.000Z'),
          status: 'COMPLETED',
        },
      ],
    });
    const product = await database.product.create({
      data: {
        name: 'Cera de reporte',
        organizationId: agenda.organizationId,
        salePriceCents: 1_500,
        stockTrackingEnabled: false,
      },
    });
    const cashSession = await database.cashRegisterSession.create({
      data: {
        closedAt: new Date('2026-08-03T09:00:00.000Z'),
        closingAmountCents: 6_200,
        differenceCents: 200,
        expectedAmountCents: 6_000,
        locationId: agenda.locationId,
        openedAt: new Date('2026-08-03T05:00:00.000Z'),
        openingAmountCents: 1_000,
        organizationId: agenda.organizationId,
        ownerUserId: ownerMembership.userId,
        responsibleMembershipId: ownerMembership.id,
        responsibleName: 'Propietario de prueba',
        status: 'CLOSED',
      },
    });
    await database.cashMovement.createMany({
      data: [
        {
          amountCents: 2_000,
          appointmentId: completedAppointment.id,
          cashRegisterSessionId: cashSession.id,
          createdAt: new Date('2026-08-03T06:00:00.000Z'),
          createdByUserId: ownerMembership.userId,
          description: 'Corte cobrado',
          paymentMethod: 'CASH',
          professionalMembershipId: agenda.membershipId,
          serviceId: agenda.serviceId,
          type: 'SALE',
        },
        {
          amountCents: 3_000,
          cashRegisterSessionId: cashSession.id,
          createdAt: new Date('2026-08-03T07:00:00.000Z'),
          createdByUserId: ownerMembership.userId,
          description: 'Dos ceras',
          paymentMethod: 'CARD',
          productId: product.id,
          productQuantity: 2,
          type: 'SALE',
        },
        {
          amountCents: 4_000,
          cashRegisterSessionId: cashSession.id,
          createdAt: new Date('2026-08-03T04:30:00.000Z'),
          createdByUserId: ownerMembership.userId,
          description: 'Venta del día local anterior',
          paymentMethod: 'TRANSFER',
          type: 'SALE',
        },
        {
          amountCents: 900,
          cashRegisterSessionId: cashSession.id,
          createdAt: new Date('2026-08-03T08:00:00.000Z'),
          createdByUserId: ownerMembership.userId,
          description: 'Venta revertida',
          paymentMethod: 'CASH',
          reversalReason: 'Error de registro',
          reversedAt: new Date('2026-08-03T08:30:00.000Z'),
          reversedByUserId: ownerMembership.userId,
          type: 'SALE',
        },
        {
          amountCents: 700,
          cashRegisterSessionId: cashSession.id,
          createdAt: new Date('2026-08-03T08:15:00.000Z'),
          createdByUserId: ownerMembership.userId,
          description: 'Compra de toallas',
          paymentMethod: 'CASH',
          type: 'EXPENSE',
        },
      ],
    });
    const commissionCashMovement = await database.cashMovement.findFirstOrThrow(
      {
        where: {
          cashRegisterSessionId: cashSession.id,
          description: 'Corte cobrado',
        },
      },
    );
    await database.commissionEntry.create({
      data: {
        baseAmountCents: 2_000,
        cashMovementId: commissionCashMovement.id,
        calculationSnapshot: { source: 'daily-report-test' },
        commissionAmountCents: 500,
        locationId: agenda.locationId,
        occurredAt: new Date('2026-08-03T06:30:00.000Z'),
        organizationId: agenda.organizationId,
        professionalMembershipId: agenda.membershipId,
      },
    });

    const reportResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: `/v1/reports/daily?from=2026-08-03&to=2026-08-03&locationId=${agenda.locationId}`,
    });
    expect(reportResponse.statusCode).toBe(200);
    const report = reportResponse.json<{
      appointments: {
        attended: number;
        cancelled: number;
        noShow: number;
        paid: number;
        paidScheduledValueCents: number;
        total: number;
      };
      cashClosures: {
        closingAmountCents: number;
        count: number;
        differenceCents: number;
        expectedAmountCents: number;
      };
      collections: {
        cardCents: number;
        cashCents: number;
        totalCents: number;
        transferCents: number;
      };
      expenses: Array<{
        amountCents: number;
        count: number;
        description: string;
      }>;
      products: Array<{ name: string; quantity: number; revenueCents: number }>;
      services: Array<{
        name: string;
        quantity: number;
        revenueCents: number;
      }>;
      professionals: Array<{
        commissionCents: number;
        completedAppointments: number;
        saleCount: number;
        salesCents: number;
      }>;
      sales: {
        averageTicketCents: number;
        grossCents: number;
        transactionCount: number;
      };
    }>();
    expect(report.appointments).toEqual({
      attended: 1,
      cancelled: 1,
      noShow: 1,
      paid: 1,
      paidScheduledValueCents: 1_200,
      total: 3,
    });
    expect(report.sales).toEqual({
      averageTicketCents: 2_500,
      grossCents: 5_000,
      transactionCount: 2,
    });
    expect(report.collections).toMatchObject({
      cardCents: 3_000,
      cashCents: 2_000,
      totalCents: 5_000,
      transferCents: 0,
    });
    expect(report.professionals).toEqual([
      expect.objectContaining({
        commissionCents: 500,
        completedAppointments: 1,
        saleCount: 1,
        salesCents: 2_000,
      }),
    ]);
    expect(report.products).toEqual([
      expect.objectContaining({
        name: 'Cera de reporte',
        quantity: 2,
        revenueCents: 3_000,
      }),
    ]);
    expect(report.services).toEqual([
      expect.objectContaining({
        name: 'Corte agenda',
        quantity: 1,
        revenueCents: 2_000,
      }),
    ]);
    expect(report.expenses).toEqual([
      { amountCents: 700, count: 1, description: 'Compra de toallas' },
    ]);
    expect(report.cashClosures).toEqual({
      closingAmountCents: 6_200,
      count: 1,
      differenceCents: 200,
      expectedAmountCents: 6_000,
    });

    const csvResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'GET',
      url: `/v1/reports/daily?from=2026-08-03&to=2026-08-03&locationId=${agenda.locationId}&format=csv`,
    });
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.body).toContain('Cera de reporte');
    expect(csvResponse.body).toContain('Compra de toallas');
    expect(csvResponse.body).toContain('Propietario de prueba');

    const forbiddenResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.barberToken}` },
      method: 'GET',
      url: '/v1/reports/daily?range=today',
    });
    expect(forbiddenResponse.statusCode).toBe(403);
  });

  it('controla inventario, descuenta ventas concurrentes y repone una reversión', async () => {
    const token = await register('inventory-owner@example.com');
    const organization = await onboard(token, 'inventario-prueba');
    const created = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        costCents: 400,
        initialStock: 3,
        locationId: organization.locationId,
        minimumStock: 2,
        name: 'Pomada mate',
        salePriceCents: 1_000,
        sku: 'POM-MATE',
        stockTrackingEnabled: true,
      },
      url: '/v1/inventory/products',
    });
    expect(created.statusCode).toBe(201);
    const productId = created.json<{ product: { id: string } }>().product.id;

    const purchased = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        locationId: organization.locationId,
        notes: 'Compra a proveedor',
        productId,
        quantityDelta: 2,
        type: 'purchase',
        unitCostCents: 400,
      },
      url: '/v1/inventory/adjustments',
    });
    expect(purchased.statusCode).toBe(201);
    expect(
      purchased.json<{ movement: { resultingQuantity: number } }>().movement
        .resultingQuantity,
    ).toBe(5);

    const edited = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'PATCH',
      payload: {
        initialStock: 5,
        locationId: organization.locationId,
      },
      url: `/v1/inventory/products/${productId}`,
    });
    expect(edited.statusCode).toBe(200);
    expect(
      edited.json<{ product: { quantityOnHand: number } }>().product
        .quantityOnHand,
    ).toBe(5);

    const secondToken = await register('inventory-other@example.com');
    await onboard(secondToken, 'inventario-aislado');
    const forbiddenProduct = await app.inject({
      headers: { authorization: `Bearer ${secondToken}` },
      method: 'PATCH',
      payload: { minimumStock: 20 },
      url: `/v1/inventory/products/${productId}`,
    });
    expect(forbiddenProduct.statusCode).toBe(404);

    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: { openingAmountCents: 1_000 },
          url: '/v1/cash-register/open',
        })
      ).statusCode,
    ).toBe(201);
    const saleRequest = () =>
      app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: 'POST',
        payload: {
          amountCents: 3_000,
          description: 'Venta de tres pomadas',
          paymentMethod: 'cash',
          productId,
          productQuantity: 3,
          type: 'sale',
        },
        url: '/v1/cash-register/movements',
      });
    const concurrentSales = await Promise.all([saleRequest(), saleRequest()]);
    expect(concurrentSales.map(({ statusCode }) => statusCode).sort()).toEqual([
      201, 409,
    ]);
    const successfulSale = concurrentSales.find(
      ({ statusCode }) => statusCode === 201,
    );
    const cashMovementId = successfulSale!.json<{
      movement: { id: string };
    }>().movement.id;

    const lowStock = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: `/v1/inventory?locationId=${organization.locationId}&lowStockOnly=true`,
    });
    expect(lowStock.statusCode).toBe(200);
    expect(
      lowStock.json<{
        products: Array<{
          id: string;
          isLowStock: boolean;
          quantityOnHand: number;
        }>;
      }>().products,
    ).toEqual([
      expect.objectContaining({
        id: productId,
        isLowStock: true,
        quantityOnHand: 2,
      }),
    ]);

    const report = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/reports/business-summary?range=today',
    });
    expect(report.statusCode).toBe(200);
    expect(
      report.json<{
        sales: { grossCents: number; productsCents: number };
      }>().sales,
    ).toMatchObject({ grossCents: 3_000, productsCents: 3_000 });

    const reversed = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: { reason: 'Venta registrada por duplicado' },
      url: `/v1/inventory/product-sales/${cashMovementId}/reverse`,
    });
    expect(reversed.statusCode).toBe(200);
    expect(
      reversed.json<{ resultingQuantity: number }>().resultingQuantity,
    ).toBe(5);
    const repeatedReversal = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: { reason: 'Segundo intento de reversión' },
      url: `/v1/inventory/product-sales/${cashMovementId}/reverse`,
    });
    expect(repeatedReversal.statusCode).toBe(409);

    const cashSummary = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/cash-register/summary',
    });
    expect(
      cashSummary.json<{ totals: { expectedCash: number; sales: number } }>()
        .totals,
    ).toMatchObject({ expectedCash: 1_000, sales: 0 });
    const reportAfterReversal = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/reports/business-summary?range=today',
    });
    expect(
      reportAfterReversal.json<{
        sales: { grossCents: number; productsCents: number };
      }>().sales,
    ).toMatchObject({ grossCents: 0, productsCents: 0 });
    const movementHistory = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: `/v1/inventory/movements?locationId=${organization.locationId}&productId=${productId}`,
    });
    expect(movementHistory.statusCode).toBe(200);
    const movementRows = movementHistory.json<{
      rows: Array<{ cashMovementReversedAt: string | null; type: string }>;
    }>().rows;
    expect(movementRows.map(({ type }) => type)).toEqual([
      'return',
      'sale',
      'purchase',
      'opening',
    ]);
    expect(movementRows[1]?.cashMovementReversedAt).toBeTruthy();

    const untrackedProductResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        costCents: 200,
        initialStock: 0,
        locationId: organization.locationId,
        minimumStock: 0,
        name: 'Servicio de aplicación',
        salePriceCents: 500,
        stockTrackingEnabled: false,
      },
      url: '/v1/inventory/products',
    });
    expect(untrackedProductResponse.statusCode).toBe(201);
    const untrackedProductId = untrackedProductResponse.json<{
      product: { id: string };
    }>().product.id;
    const untrackedSaleResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        amountCents: 1_000,
        description: 'Dos aplicaciones de producto',
        paymentMethod: 'cash',
        productId: untrackedProductId,
        productQuantity: 2,
        type: 'sale',
      },
      url: '/v1/cash-register/movements',
    });
    expect(untrackedSaleResponse.statusCode).toBe(201);
    const untrackedCashMovementId = untrackedSaleResponse.json<{
      movement: { id: string };
    }>().movement.id;
    const untrackedReversal = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: { reason: 'Anulación sin control de existencias' },
      url: `/v1/inventory/product-sales/${untrackedCashMovementId}/reverse`,
    });
    expect(untrackedReversal.statusCode).toBe(200);
    expect(
      untrackedReversal.json<{ resultingQuantity: number | null }>()
        .resultingQuantity,
    ).toBeNull();
    expect(
      await database.stockMovement.count({
        where: { productId: untrackedProductId },
      }),
    ).toBe(0);

    const actions = await database.auditLog.findMany({
      select: { action: true },
      where: { organizationId: organization.organizationId },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'inventory.product_created',
        'inventory.stock_adjusted',
        'inventory.product_sale_reversed',
      ]),
    );
  });

  it('audita caja, conserva el efectivo esperado y expone cierres en historial', async () => {
    const token = await register('cash-register@example.com');
    const organization = await onboard(token, 'caja-prueba');
    const opened = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: { openingAmountCents: 1_000 },
      url: '/v1/cash-register/open',
    });
    expect(opened.statusCode).toBe(201);

    const movement = async (
      type: 'deposit' | 'expense' | 'other_income' | 'sale' | 'withdrawal',
      paymentMethod: 'card' | 'cash' | 'transfer',
      amountCents: number,
    ) =>
      app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: 'POST',
        payload: {
          amountCents,
          description: `${type} de prueba`,
          paymentMethod,
          type,
        },
        url: '/v1/cash-register/movements',
      });
    expect((await movement('sale', 'cash', 2_000)).statusCode).toBe(400);
    expect((await movement('deposit', 'cash', 800)).statusCode).toBe(201);
    expect((await movement('other_income', 'transfer', 200)).statusCode).toBe(
      201,
    );
    expect((await movement('expense', 'transfer', 500)).statusCode).toBe(201);
    expect((await movement('withdrawal', 'cash', 300)).statusCode).toBe(201);

    const expenseReport = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/reports/movements?kind=expenses&range=today',
    });
    expect(expenseReport.statusCode).toBe(200);
    expect(
      expenseReport.json<{
        pagination: { total: number };
        rows: Array<{ amountCents: number; description: string }>;
      }>(),
    ).toMatchObject({
      pagination: { total: 1 },
      rows: [{ amountCents: 500, description: 'expense de prueba' }],
    });
    const depositReport = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/reports/movements?kind=deposits&range=today',
    });
    expect(depositReport.statusCode).toBe(200);
    expect(
      depositReport.json<{
        pagination: { total: number };
        rows: Array<{ amountCents: number; type: string }>;
        totalAmountCents: number;
      }>(),
    ).toMatchObject({
      pagination: { total: 2 },
      rows: expect.arrayContaining([
        expect.objectContaining({ amountCents: 800, type: 'deposit' }),
        expect.objectContaining({ amountCents: 200, type: 'other_income' }),
      ]),
      totalAmountCents: 1_000,
    });
    const depositsCsv = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/reports/movements?format=csv&kind=deposits&range=today',
    });
    expect(depositsCsv.statusCode).toBe(200);
    expect(depositsCsv.headers['content-type']).toContain('text/csv');
    expect(depositsCsv.body).toContain('deposit de prueba');
    expect(depositsCsv.body).toContain('other_income de prueba');
    const salesCsv = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/reports/movements?format=csv&kind=sales&range=today',
    });
    expect(salesCsv.statusCode).toBe(200);
    expect(salesCsv.headers['content-type']).toContain('text/csv');
    expect(salesCsv.body).not.toContain('sale de prueba');

    const businessSummary = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/reports/business-summary?range=today',
    });
    expect(businessSummary.statusCode).toBe(200);
    expect(
      businessSummary.json<{
        details: {
          expenses: Array<{
            amountCents: number;
            count: number;
            description: string;
          }>;
          otherIncome: Array<{
            amountCents: number;
            count: number;
            description: string;
          }>;
        };
        expenses: { operatingCents: number; totalCents: number };
        income: {
          otherIncomeCents: number;
          salesCents: number;
          totalCents: number;
        };
        netResultCents: number;
        sales: {
          grossCents: number;
          transactionCount: number;
          uncategorizedCents: number;
        };
        withdrawalsCents: number;
      }>(),
    ).toMatchObject({
      details: {
        expenses: [
          { amountCents: 500, count: 1, description: 'expense de prueba' },
        ],
        otherIncome: expect.arrayContaining([
          { amountCents: 800, count: 1, description: 'deposit de prueba' },
          {
            amountCents: 200,
            count: 1,
            description: 'other_income de prueba',
          },
        ]),
      },
      expenses: { operatingCents: 500, totalCents: 500 },
      income: {
        otherIncomeCents: 1_000,
        salesCents: 0,
        totalCents: 1_000,
      },
      netResultCents: 500,
      sales: {
        grossCents: 0,
        transactionCount: 0,
        uncategorizedCents: 0,
      },
      withdrawalsCents: 300,
    });

    const summary = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/cash-register/summary',
    });
    expect(summary.statusCode).toBe(200);
    expect(
      summary.json<{ totals: { expectedCash: number } }>().totals.expectedCash,
    ).toBe(1_500);

    const closed = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: { closingAmountCents: 1_400, note: 'Faltante comprobado' },
      url: '/v1/cash-register/close',
    });
    expect(closed.statusCode).toBe(200);
    expect(
      closed.json<{ session: { differenceCents: number } }>().session
        .differenceCents,
    ).toBe(-100);

    const history = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/cash-register/history',
    });
    expect(history.json<{ sessions: unknown[] }>().sessions).toHaveLength(1);
    const sessionId = closed.json<{ session: { id: string } }>().session.id;
    const detail = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: `/v1/cash-register/sessions/${sessionId}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(
      detail.json<{
        movements: unknown[];
        session: {
          closingAmountCents: number | null;
          closingNote: string | null;
        };
        totals: {
          cashSales: number;
          deposits: number;
          expectedCash: number;
          otherIncome: number;
          sales: number;
        };
      }>(),
    ).toMatchObject({
      movements: expect.any(Array),
      session: {
        closingAmountCents: 1_400,
        closingNote: 'Faltante comprobado',
      },
      totals: {
        cashSales: 0,
        deposits: 800,
        expectedCash: 1_500,
        otherIncome: 200,
        sales: 0,
      },
    });
    const actions = await database.auditLog.findMany({
      select: { action: true },
      where: { organizationId: organization.organizationId },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'cash_register.opened',
        'cash_movement.created',
        'cash_register.closed',
      ]),
    );
  });

  it('opera pilotos desde el panel interno con acceso exclusivo y soporte sin suplantación', async () => {
    const ownerToken = await register('pilot-owner@example.com');
    const pilot = await onboard(ownerToken, 'piloto-plataforma');
    const platformAccountToken = await register('platform@example.com');
    const outsiderToken = await register('not-platform@example.com');
    let platformToken: string;

    const denied = await app.inject({
      headers: { authorization: `Bearer ${outsiderToken}` },
      method: 'GET',
      url: '/v1/platform/session',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe(
      'PLATFORM_ADMIN_REQUIRED',
    );

    const session = await app.inject({
      headers: { authorization: `Bearer ${platformAccountToken}` },
      method: 'GET',
      url: '/v1/platform/session',
    });
    expect(session.statusCode).toBe(403);
    expect(session.json<{ code: string }>().code).toBe(
      'PLATFORM_ACCESS_CODE_REQUIRED',
    );

    const login = await app.inject({
      method: 'POST',
      payload: {
        email: 'platform@example.com',
        password: 'Clave-plataforma-123',
      },
      url: '/v1/platform/login',
    });
    expect(login.statusCode).toBe(200);
    expect(login.body).not.toContain('code');
    platformToken = login.json<{ challengeToken: string }>().challengeToken;
    expect(platformAccessMessages).toHaveLength(1);
    expect(platformAccessMessages[0]?.email).toBe('platform@example.com');
    expect(
      new Date(login.json<{ expiresAt: string }>().expiresAt).getTime() -
        Date.now(),
    ).toBeLessThanOrEqual(5 * 60 * 1000);

    const expiredChallenge =
      await database.platformAdminAccessChallenge.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });
    await database.platformAdminAccessChallenge.update({
      data: { expiresAt: new Date(Date.now() - 1_000) },
      where: { id: expiredChallenge.id },
    });
    const expiredCode = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: { code: platformAccessMessages[0]?.code },
      url: '/v1/platform/verify-access-code',
    });
    expect(expiredCode.statusCode).toBe(400);
    expect(expiredCode.json<{ code: string }>().code).toBe(
      'PLATFORM_ACCESS_CODE_EXPIRED',
    );

    const replacementLogin = await app.inject({
      method: 'POST',
      payload: {
        email: 'platform@example.com',
        password: 'Clave-plataforma-123',
      },
      url: '/v1/platform/login',
    });
    expect(replacementLogin.statusCode).toBe(200);
    platformToken = replacementLogin.json<{ challengeToken: string }>()
      .challengeToken;
    const accessCode = platformAccessMessages[1]?.code;
    expect(accessCode).toMatch(/^\d{6}$/u);
    const invalidCode = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: { code: accessCode === '000000' ? '000001' : '000000' },
      url: '/v1/platform/verify-access-code',
    });
    expect(invalidCode.statusCode).toBe(400);
    expect(invalidCode.json<{ code: string }>().code).toBe(
      'INVALID_PLATFORM_ACCESS_CODE',
    );
    const verifiedChallengeToken = platformToken;
    const verifiedSession = await app.inject({
      headers: { authorization: `Bearer ${verifiedChallengeToken}` },
      method: 'POST',
      payload: { code: accessCode },
      url: '/v1/platform/verify-access-code',
    });
    expect(verifiedSession.statusCode).toBe(200);
    const replayedCode = await app.inject({
      headers: { authorization: `Bearer ${verifiedChallengeToken}` },
      method: 'POST',
      payload: { code: accessCode },
      url: '/v1/platform/verify-access-code',
    });
    expect(replayedCode.statusCode).toBe(400);
    expect(replayedCode.json<{ code: string }>().code).toBe(
      'PLATFORM_ACCESS_CODE_USED',
    );
    platformToken = verifiedSession.json<{
      session: { token: string };
    }>().session.token;

    const verifiedPlatformSession = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/session',
    });
    expect(verifiedPlatformSession.statusCode).toBe(200);

    const owner = await database.user.findUniqueOrThrow({
      where: { email: 'pilot-owner@example.com' },
    });
    await database.welcomeSurveyResponse.create({
      data: {
        selectedOptions: ['Buscador'],
        userId: owner.id,
      },
    });
    const welcomeSurveyResponses = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/welcome-survey-responses?search=pilot-owner',
    });
    expect(welcomeSurveyResponses.statusCode).toBe(200);
    expect(welcomeSurveyResponses.json()).toMatchObject({
      pagination: { page: 1, total: 1 },
      responses: [
        {
          selectedOptions: ['Buscador'],
          user: { email: 'pilot-owner@example.com', id: owner.id },
        },
      ],
    });

    await database.appNotification.create({
      data: {
        body: 'No se expone en el panel.',
        data: {
          delivery: {
            email: { attempts: 3, state: 'failed' },
            push: { attempts: 0, state: 'pending' },
          },
        },
        organizationId: pilot.organizationId,
        title: 'Aviso de prueba',
        type: 'APPOINTMENT_CREATED',
        userId: owner.id,
      },
    });

    const overview = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/overview',
    });
    expect(overview.statusCode).toBe(200);
    expect(
      overview.json<{
        activation: { organizations: number };
        notificationFailures: number;
      }>(),
    ).toMatchObject({
      activation: { organizations: 1 },
      notificationFailures: 1,
    });

    const organizations = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/organizations?status=trial&search=piloto',
    });
    expect(organizations.statusCode).toBe(200);
    const organizationsBody = organizations.json<{
      organizations: Array<{
        id: string;
        owner: { email: string };
        plan: string;
      }>;
    }>();
    expect(organizationsBody.organizations).toHaveLength(1);
    expect(organizationsBody.organizations[0]?.owner.email).toContain('***');
    expect(JSON.stringify(organizationsBody)).not.toContain('password');

    const organizationDetail = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: `/v1/platform/organizations/${pilot.organizationId}`,
    });
    expect(organizationDetail.statusCode).toBe(200);
    expect(organizationDetail.body).toContain('appointmentsLast30Days');
    expect(organizationDetail.body).toContain('openCashRegisters');
    expect(organizationDetail.body).not.toContain('pilot-owner@example.com');
    expect(organizationDetail.body).not.toContain('encryptedToken');

    for (const resource of [
      'bookings',
      'orders',
      'cash-health',
      'commissions-health',
      'inventory-health',
      'payphone-health',
    ]) {
      const operationalView = await app.inject({
        headers: { authorization: `Bearer ${platformToken}` },
        method: 'GET',
        url: `/v1/platform/${resource}?organizationId=${pilot.organizationId}`,
      });
      expect(operationalView.statusCode, resource).toBe(200);
      expect(operationalView.body).not.toContain('pilot-owner@example.com');
      expect(operationalView.body).not.toContain('encryptedToken');
    }

    const operators = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/operators',
    });
    expect(operators.statusCode).toBe(200);
    expect(operators.body).toContain('super_admin');

    const createdOperator = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: {
        email: 'not-platform@example.com',
        isActive: true,
        role: 'support',
      },
      url: '/v1/platform/operators',
    });
    expect(createdOperator.statusCode).toBe(201);
    const createdOperatorBody = createdOperator.json<{
      operator: { id: string; isActive: boolean; role: string; userId: string };
    }>();
    expect(createdOperatorBody.operator.role).toBe('support');
    expect(createdOperatorBody.operator.isActive).toBe(false);

    const reusedApplicationPassword = await app.inject({
      method: 'POST',
      payload: {
        email: 'not-platform@example.com',
        password: 'Clave-segura-123',
      },
      url: '/v1/platform/login',
    });
    expect(reusedApplicationPassword.statusCode).toBe(401);

    const pendingActivation = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: { isActive: true, role: 'support' },
      url: `/v1/platform/operators/${createdOperatorBody.operator.id}`,
    });
    expect(pendingActivation.statusCode).toBe(409);
    expect(pendingActivation.json<{ code: string }>().code).toBe(
      'PLATFORM_OPERATOR_PASSWORD_NOT_CONFIGURED',
    );

    await database.platformOperator.update({
      data: { isActive: true },
      where: { userId: createdOperatorBody.operator.userId },
    });
    const pendingPasswordLogin = await app.inject({
      method: 'POST',
      payload: {
        email: 'not-platform@example.com',
        password: 'Clave-panel-segura-456',
      },
      url: '/v1/platform/login',
    });
    expect(pendingPasswordLogin.statusCode).toBe(409);
    expect(pendingPasswordLogin.json<{ code: string }>().code).toBe(
      'PLATFORM_OPERATOR_PASSWORD_NOT_CONFIGURED',
    );

    await database.platformOperator.update({
      data: {
        adminPasswordHash: await hashPassword('Clave-panel-segura-456'),
        adminPasswordSetAt: new Date(),
      },
      where: { userId: createdOperatorBody.operator.userId },
    });

    const activatedOperator = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: { isActive: true, role: 'support' },
      url: `/v1/platform/operators/${createdOperatorBody.operator.id}`,
    });
    expect(activatedOperator.statusCode).toBe(200);

    const supportLogin = await app.inject({
      method: 'POST',
      payload: {
        email: 'not-platform@example.com',
        password: 'Clave-panel-segura-456',
      },
      url: '/v1/platform/login',
    });
    expect(supportLogin.statusCode).toBe(200);
    const supportVerification = await app.inject({
      headers: {
        authorization: `Bearer ${supportLogin.json<{ challengeToken: string }>().challengeToken}`,
      },
      method: 'POST',
      payload: { code: platformAccessMessages[2]?.code },
      url: '/v1/platform/verify-access-code',
    });
    expect(supportVerification.statusCode).toBe(200);
    const supportToken = supportVerification.json<{
      session: { token: string };
    }>().session.token;
    const deniedForSupport = await app.inject({
      headers: { authorization: `Bearer ${supportToken}` },
      method: 'PATCH',
      payload: {
        action: 'suspend',
        reason: 'Soporte no debe poder suspender una organización.',
      },
      url: `/v1/platform/organizations/${pilot.organizationId}`,
    });
    expect(deniedForSupport.statusCode).toBe(403);
    expect(deniedForSupport.json<{ code: string }>().code).toBe(
      'PLATFORM_PERMISSION_REQUIRED',
    );

    const promotedOperator = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: { isActive: true, role: 'super_admin' },
      url: `/v1/platform/operators/${createdOperatorBody.operator.id}`,
    });
    expect(promotedOperator.statusCode).toBe(200);
    const configurationDraft = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: {
        key: 'support.default_sla_hours',
        reason: 'Definir SLA inicial para las incidencias del piloto.',
        value: { hours: 12 },
      },
      url: '/v1/platform/configurations',
    });
    expect(configurationDraft.statusCode).toBe(201);
    const configurationId = configurationDraft.json<{ id: string }>().id;
    const sameActorApproval = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: { reason: 'Intento de autoaprobación que debe bloquearse.' },
      url: `/v1/platform/configurations/${configurationId}/publish`,
    });
    expect(sameActorApproval.statusCode).toBe(409);
    const approvedConfiguration = await app.inject({
      headers: { authorization: `Bearer ${supportToken}` },
      method: 'POST',
      payload: { reason: 'Segundo operador valida el SLA del piloto.' },
      url: `/v1/platform/configurations/${configurationId}/publish`,
    });
    expect(approvedConfiguration.statusCode).toBe(200);
    const replacementDraft = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: {
        key: 'support.default_sla_hours',
        reason: 'Probar una segunda versión antes del rollback.',
        value: { hours: 18 },
      },
      url: '/v1/platform/configurations',
    });
    const replacementId = replacementDraft.json<{ id: string }>().id;
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${supportToken}` },
          method: 'POST',
          payload: { reason: 'Aprobar temporalmente la segunda versión.' },
          url: `/v1/platform/configurations/${replacementId}/publish`,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${platformToken}` },
          method: 'POST',
          payload: { reason: 'Restaurar el SLA previamente aprobado.' },
          url: `/v1/platform/configurations/${configurationId}/rollback`,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await database.platformConfigurationVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { value: true },
        where: {
          key: 'support.default_sla_hours',
          status: 'PUBLISHED',
        },
      }),
    ).toMatchObject({ value: { hours: 12 } });

    const sessions = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/sessions',
    });
    expect(sessions.statusCode).toBe(200);
    expect(
      sessions.json<{ sessions: unknown[] }>().sessions.length,
    ).toBeGreaterThan(0);

    const createdCase = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: {
        category: 'notificaciones',
        description: 'El propietario solicita revisar la entrega de avisos.',
        organizationId: pilot.organizationId,
        priority: 'high',
        title: 'Avisos sin entregar al piloto',
      },
      url: '/v1/platform/support-cases',
    });
    expect(createdCase.statusCode).toBe(201);
    const supportCaseId = createdCase.json<{ id: string }>().id;
    const storedCase = await database.platformSupportCase.findUniqueOrThrow({
      where: { id: supportCaseId },
    });
    expect(storedCase.slaDueAt).not.toBeNull();
    expect(
      Math.round(
        ((storedCase.slaDueAt?.getTime() ?? 0) -
          storedCase.createdAt.getTime()) /
          3_600_000,
      ),
    ).toBe(12);
    const updatedCase = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: {
        assignedToUserId: createdOperatorBody.operator.userId,
        note: 'Diagnóstico iniciado y asignado al operador de turno.',
        slaDueAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress',
      },
      url: `/v1/platform/support-cases/${supportCaseId}`,
    });
    expect(updatedCase.statusCode).toBe(200);
    const cases = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: `/v1/platform/support-cases?organizationId=${pilot.organizationId}`,
    });
    expect(cases.statusCode).toBe(200);
    expect(cases.body).toContain('in_progress');
    expect(cases.body).toContain('running');

    const pendingRegistration = await database.pendingRegistration.create({
      data: {
        codeHash: '0'.repeat(64),
        email: 'pending-admin@example.com',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        fullName: 'Cuenta pendiente',
        marketingOptIn: true,
        passwordHash: 'hash-de-prueba',
        privacyPolicyAccepted: true,
      },
    });
    const onboarding = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/onboarding',
    });
    expect(onboarding.statusCode).toBe(200);
    expect(onboarding.body).toContain('progressPercent');
    expect(onboarding.body).not.toContain('pilot-owner@example.com');
    expect(onboarding.body).not.toContain('pending-admin@example.com');

    const verificationMessageCountBeforeResend = verificationMessages.length;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const resend = await app.inject({
        headers: { authorization: `Bearer ${platformToken}` },
        method: 'POST',
        payload: {
          reason: 'Soporte confirma el reenvío solicitado por el titular.',
        },
        url: `/v1/platform/onboarding/pending/${pendingRegistration.id}/resend-verification`,
      });
      expect(resend.statusCode).toBe(200);
    }
    expect(verificationMessages).toHaveLength(
      verificationMessageCountBeforeResend + 3,
    );
    expect(verificationMessages.at(-1)?.email).toBe(
      'pending-admin@example.com',
    );
    expect(
      await database.pendingRegistration.findUnique({
        where: { id: pendingRegistration.id },
      }),
    ).toMatchObject({ marketingOptIn: true, privacyPolicyAccepted: true });
    const blockedResend = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: {
        reason: 'Cuarto reenvío dentro de la misma ventana de seguridad.',
      },
      url: `/v1/platform/onboarding/pending/${pendingRegistration.id}/resend-verification`,
    });
    expect(blockedResend.statusCode).toBe(429);
    expect(blockedResend.json<{ code: string }>().code).toBe(
      'PLATFORM_VERIFICATION_RESEND_RATE_LIMITED',
    );

    const commercialNote = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: {
        category: 'commercial',
        note: 'Piloto autorizado para seguimiento comercial prioritario.',
      },
      url: `/v1/platform/organizations/${pilot.organizationId}/notes`,
    });
    expect(commercialNote.statusCode).toBe(201);

    const reducedTrial = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: {
        action: 'reduce_trial',
        days: 1,
        reason: 'Ajuste solicitado para validar la reducción controlada.',
      },
      url: `/v1/platform/organizations/${pilot.organizationId}`,
    });
    expect(reducedTrial.statusCode).toBe(200);

    const notificationErrors = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: `/v1/platform/notification-errors?organizationId=${pilot.organizationId}`,
    });
    expect(notificationErrors.statusCode).toBe(200);
    expect(
      notificationErrors.json<{ errors: Array<{ channel: string }> }>().errors,
    ).toEqual([expect.objectContaining({ channel: 'email' })]);
    expect(notificationErrors.body).not.toContain('No se expone en el panel.');

    const alerts = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: `/v1/platform/alerts?organizationId=${pilot.organizationId}&status=all`,
    });
    expect(alerts.statusCode).toBe(200);
    const notificationAlert = alerts
      .json<{ alerts: Array<{ id: string; type: string }> }>()
      .alerts.find(({ type }) => type === 'notification_failed');
    expect(notificationAlert).toBeDefined();
    const resolvedAlert = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: {
        note: 'Entrega revisada por soporte del piloto.',
        status: 'resolved',
      },
      url: `/v1/platform/alerts/${notificationAlert?.id}`,
    });
    expect(resolvedAlert.statusCode).toBe(200);

    const systemHealth = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: '/v1/platform/system-health',
    });
    expect(systemHealth.statusCode).toBe(200);
    expect(
      systemHealth.json<{ components: { api: { status: string } } }>()
        .components.api.status,
    ).toBe('operational');

    const changePlan = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: {
        action: 'change_plan',
        planCode: 'local',
        reason: 'Piloto autorizado para validar múltiples sucursales.',
      },
      url: `/v1/platform/organizations/${pilot.organizationId}`,
    });
    expect(changePlan.statusCode).toBe(200);
    expect(
      (
        await database.subscription.findUniqueOrThrow({
          include: { plan: true },
          where: { organizationId: pilot.organizationId },
        })
      ).plan.code,
    ).toBe('local');

    const suspended = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: {
        action: 'suspend',
        reason: 'Suspensión controlada durante soporte del piloto.',
      },
      url: `/v1/platform/organizations/${pilot.organizationId}`,
    });
    expect(suspended.statusCode).toBe(200);
    const blockedWrite = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: 'POST',
      payload: {
        durationMinutes: 30,
        name: 'Servicio bloqueado',
        priceCents: 900,
      },
      url: '/v1/services',
    });
    expect(blockedWrite.statusCode).toBe(423);

    const diagnostics = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'POST',
      payload: {
        reason: 'Diagnóstico solicitado por el propietario del piloto.',
      },
      url: `/v1/platform/organizations/${pilot.organizationId}/support`,
    });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.body).toContain('No se creó una sesión');
    expect(diagnostics.body).not.toContain('pilot-owner@example.com');
    expect(diagnostics.body).not.toContain('token');
    expect(diagnostics.body).not.toContain('password');

    const reactivated = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'PATCH',
      payload: {
        action: 'reactivate',
        reason: 'Incidencia resuelta y acceso restaurado al piloto.',
      },
      url: `/v1/platform/organizations/${pilot.organizationId}`,
    });
    expect(reactivated.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${ownerToken}` },
          method: 'POST',
          payload: {
            durationMinutes: 30,
            name: 'Servicio restaurado',
            priceCents: 900,
          },
          url: '/v1/services',
        })
      ).statusCode,
    ).toBe(201);

    const audit = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: `/v1/platform/audit?organizationId=${pilot.organizationId}`,
    });
    expect(audit.statusCode).toBe(200);
    expect(
      audit
        .json<{ logs: Array<{ action: string }> }>()
        .logs.map(({ action }) => action),
    ).toEqual(
      expect.arrayContaining([
        'platform.organization.change_plan',
        'platform.organization.reactivate',
        'platform.organization.support_accessed',
        'platform.organization.suspend',
      ]),
    );

    const exportQuery = new URLSearchParams({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      organizationId: pilot.organizationId,
      to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const auditExport = await app.inject({
      headers: { authorization: `Bearer ${platformToken}` },
      method: 'GET',
      url: `/v1/platform/exports/audit.csv?${exportQuery.toString()}`,
    });
    expect(auditExport.statusCode).toBe(200);
    expect(auditExport.headers['content-type']).toContain('text/csv');
    expect(auditExport.body).toContain('platform.organization.change_plan');
    expect(await database.platformExport.count()).toBe(1);
  });

  it('recorre autenticación, onboarding, reserva pública y cierre de sesión de extremo a extremo', async () => {
    const suffix = `${Date.now()}-${registrationProfileSequence + 1}`;
    const email = `critical-journey-${suffix}@example.com`;
    const password = 'Clave-segura-123';
    const profile = registrationProfilePayload();
    const registration = await app.inject({
      method: 'POST',
      payload: {
        ...profile,
        confirmPassword: password,
        email,
        fullName: 'Propietario E2E',
        password,
      },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    const registrationBody = registration.json<{
      developmentVerificationCode: string;
    }>();

    const loginBeforeVerification = await app.inject({
      method: 'POST',
      payload: { email, password },
      url: '/v1/auth/login',
    });
    expect(loginBeforeVerification.statusCode).toBe(401);

    const verified = await app.inject({
      method: 'POST',
      payload: {
        code: registrationBody.developmentVerificationCode,
        email,
      },
      url: '/v1/auth/verify-email',
    });
    expect(verified.statusCode).toBe(200);
    let accessToken = verified.json<{ session: { token: string } }>().session
      .token;

    const onboardingService = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'POST',
      payload: {
        agendaColor: '#2464E8',
        category: {
          description: 'Servicios de la prueba crítica',
          name: 'Barbería',
        },
        description: 'Servicio creado por el recorrido automatizado.',
        downPaymentPercentage: 0,
        durationMinutes: 30,
        imageUri: null,
        name: 'Corte E2E',
        onlineBooking: true,
        price: 15,
        priceType: 'fixed',
        showServiceTime: true,
        tax: null,
      },
      url: '/v1/onboarding/services',
    });
    expect(onboardingService.statusCode).toBe(201);

    const completed = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'POST',
      url: '/v1/onboarding/complete-account-setup',
    });
    expect(completed.statusCode).toBe(200);
    const bookingUrl = completed.json<{ bookingUrl: string }>().bookingUrl;
    const publicBookingToken = new URL(bookingUrl).pathname.split('/').at(-1)!;

    const redirect = await app.inject({
      method: 'GET',
      url: `/v1/public/${publicBookingToken}`,
    });
    expect(redirect.statusCode).toBe(200);
    const redirectPath = redirect.json<{ redirectPath: string }>().redirectPath;
    const catalog = await app.inject({
      method: 'GET',
      url: `/v1/public${redirectPath}`,
    });
    expect(catalog.statusCode).toBe(200);
    const catalogBody = catalog.json<{
      location: { slug: string; timezone: string };
      professionals: Array<{ id: string }>;
      services: Array<{ id: string; name: string }>;
    }>();
    expect(catalogBody.professionals).toHaveLength(1);
    expect(catalogBody.services).toEqual([
      expect.objectContaining({ name: 'Corte E2E' }),
    ]);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const localDate = localDateForTest(tomorrow, catalogBody.location.timezone);
    const membershipId = catalogBody.professionals[0]!.id;
    const serviceId = catalogBody.services[0]!.id;
    const availability = await app.inject({
      method: 'GET',
      url: `/v1/public/${publicBookingToken}/${catalogBody.location.slug}/availability?date=${localDate}&membershipId=${membershipId}&serviceIds=${serviceId}`,
    });
    expect(availability.statusCode).toBe(200);
    const slots = availability.json<{
      slots: Array<{ startsAt: string }>;
    }>().slots;
    expect(slots.length).toBeGreaterThan(0);

    const booking = await app.inject({
      headers: { 'idempotency-key': `critical-journey-${suffix}` },
      method: 'POST',
      payload: {
        email: `client-${suffix}@example.com`,
        fullName: 'Cliente E2E',
        membershipId,
        phone: '+593999999999',
        policyAccepted: true,
        serviceIds: [serviceId],
        startsAt: slots[0]!.startsAt,
      },
      url: `/v1/public/${publicBookingToken}/${catalogBody.location.slug}/bookings`,
    });
    expect(booking.statusCode).toBe(201);
    const bookingBody = booking.json<{
      bookingId: string;
      developmentVerificationCode: string;
    }>();

    const bookingVerification = await app.inject({
      method: 'POST',
      payload: { code: bookingBody.developmentVerificationCode },
      url: `/v1/public/bookings/${bookingBody.bookingId}/verify`,
    });
    expect(bookingVerification.statusCode).toBe(200);
    const managementToken = bookingVerification.json<{
      managementToken: string;
    }>().managementToken;

    const cancelled = await app.inject({
      method: 'POST',
      payload: { reason: 'Limpieza del recorrido E2E.' },
      url: `/v1/public/booking/${managementToken}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().appointment.status).toBe('cancelled');

    const logout = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'POST',
      url: '/v1/auth/logout',
    });
    expect(logout.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          headers: { authorization: `Bearer ${accessToken}` },
          method: 'GET',
          url: '/v1/auth/session',
        })
      ).statusCode,
    ).toBe(401);

    const loginAgain = await app.inject({
      method: 'POST',
      payload: { email, password },
      url: '/v1/auth/login',
    });
    expect(loginAgain.statusCode).toBe(200);
    accessToken = loginAgain.json<{ session: { token: string } }>().session
      .token;
    const accountDeletion = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'DELETE',
      payload: { confirmation: 'ELIMINAR', password },
      url: '/v1/account',
    });
    expect(accountDeletion.statusCode).toBe(204);
  });
});
