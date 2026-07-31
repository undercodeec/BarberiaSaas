import { createDatabaseClient } from '@barber-saas/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';
import type { InvitationMessage } from './recovery-mailer';

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
  } as const;
}

describeWithDatabase('API con PostgreSQL', () => {
  const connectionString = testDatabaseUrl ?? 'postgresql://unused/unused';
  const database = createDatabaseClient({ connectionString });
  const config = readConfig({
    API_HOST: '127.0.0.1',
    API_PORT: '4000',
    APP_ENV: 'local',
    CORS_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: connectionString,
    MOBILE_INVITATION_URL: 'barbersaas://accept-invitation',
    MOBILE_RESET_URL: 'barbersaas://reset-password',
  });
  const invitationMessages: InvitationMessage[] = [];
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
    });
    invitationMessages.length = 0;
    await database.onboardingCollaborator.deleteMany();
    await database.appointmentEvent.deleteMany();
    await database.appointmentService.deleteMany();
    await database.appointment.deleteMany();
    await database.clientLabelAssignment.deleteMany();
    await database.clientNote.deleteMany();
    await database.clientLabel.deleteMany();
    await database.client.deleteMany();
    await database.cashRegisterSession.deleteMany();
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
    await database.pendingRegistration.deleteMany();
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
      ownerToken,
      serviceId,
    };
  }

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

    expect(firstResult.bookingUrl).toMatch(/^https:\/\/book\.nava\.app\//u);
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
          businessName: string;
          email: string;
          phone: string;
        };
      }>().conflicts,
    ).toEqual({
      businessName: 'Ese nombre de negocio ya está en uso.',
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
    expect(duplicateBusiness.statusCode).toBe(409);
    expect(duplicateBusiness.json<{ code: string }>().code).toBe(
      'BUSINESS_NAME_ALREADY_EXISTS',
    );
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

  it('configura equipo, servicios y horarios con auditoría', async () => {
    const ownerToken = await register('phase2-owner@example.com');
    const organization = await onboard(ownerToken, 'fase-dos');

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
    expect(assignmentResponse.statusCode).toBe(201);

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

    const barberToken = await register('phase2-barber@example.com');
    const accessBeforeAcceptance = await app.inject({
      headers: { authorization: `Bearer ${barberToken}` },
      method: 'GET',
      url: '/v1/team',
    });
    expect(accessBeforeAcceptance.statusCode).toBe(403);

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
        'professional_service.assigned',
        'weekly_schedule.replaced',
        'schedule_block.created',
      ]),
    );
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
      days: {
        endMinute: number;
        isOpen: boolean;
        startMinute: number;
        weekday: number;
      }[];
      locationId: string;
    }>();
    expect(initial.locationId).toBe(agenda.locationId);
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
      payload: { days: closedMonday, locationId: agenda.locationId },
      url: '/v1/business-schedule',
    });
    expect(forbiddenResponse.statusCode).toBe(403);

    const updateResponse = await app.inject({
      headers: { authorization: `Bearer ${agenda.ownerToken}` },
      method: 'PUT',
      payload: { days: closedMonday, locationId: agenda.locationId },
      url: '/v1/business-schedule',
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse
        .json<{ days: { isOpen: boolean; weekday: number }[] }>()
        .days.find(({ weekday }) => weekday === 1)?.isOpen,
    ).toBe(false);

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
    expect(createResponse.statusCode).toBe(201);
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
      type: 'expense' | 'sale' | 'withdrawal',
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
    expect((await movement('sale', 'cash', 2_000)).statusCode).toBe(201);
    expect((await movement('expense', 'transfer', 500)).statusCode).toBe(201);
    expect((await movement('withdrawal', 'cash', 300)).statusCode).toBe(201);

    const summary = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/v1/cash-register/summary',
    });
    expect(summary.statusCode).toBe(200);
    expect(
      summary.json<{ totals: { expectedCash: number } }>().totals.expectedCash,
    ).toBe(2_700);

    const closed = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: { closingAmountCents: 2_600, note: 'Faltante comprobado' },
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
        totals: { cashSales: number; expectedCash: number; sales: number };
      }>(),
    ).toMatchObject({
      movements: expect.any(Array),
      session: {
        closingAmountCents: 2_600,
        closingNote: 'Faltante comprobado',
      },
      totals: { cashSales: 2_000, expectedCash: 2_700, sales: 2_000 },
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
});
