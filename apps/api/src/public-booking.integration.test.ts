import { randomUUID } from 'node:crypto';

import {
  AppointmentStatus,
  MembershipRole,
  MembershipStatus,
  UnconfirmedBookingAction,
  createDatabaseClient,
} from '@barber-saas/database';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';
import {
  processPublicBookingLifecycle,
  type PublicBookingMailer,
} from './public-booking';
import { createOpaqueToken, hashOpaqueToken } from './security';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

integrationDescribe('reservas públicas', () => {
  const database = createDatabaseClient({
    connectionString: testDatabaseUrl!,
  });
  const suffix = randomUUID().slice(0, 8);
  const organizationSlug = `public-${suffix}`;
  const clientPhone = `+59399${String(Date.now()).slice(-7)}`;
  let app: FastifyInstance;
  let organizationId = '';
  let locationId = '';
  let membershipId = '';
  let serviceId = '';
  let userId = '';
  let accessToken = '';
  let lastVerificationCode = '';
  let reminderMessages = 0;
  const mailer: PublicBookingMailer = {
    async sendCancellation() {},
    async sendConfirmation() {},
    async sendReminder() {
      reminderMessages += 1;
    },
    async sendVerification(message) {
      lastVerificationCode = message.code;
    },
  };

  beforeAll(async () => {
    const user = await database.user.create({
      data: {
        profileBio: 'Especialistas en cortes y cuidado de tu estilo.',
        profilePhotoData: 'data:image/jpeg;base64,cGVyZmls',
        email: `owner-${suffix}@example.com`,
        emailVerifiedAt: new Date(),
        fullName: 'Profesional Público',
      },
    });
    userId = user.id;
    const organization = await database.organization.create({
      data: {
        defaultTimezone: 'UTC',
        name: `Negocio ${suffix}`,
        slug: organizationSlug,
      },
    });
    organizationId = organization.id;
    const location = await database.location.create({
      data: {
        formattedAddress: 'Av. República y Amazonas, Quito, Ecuador',
        latitude: -0.19,
        longitude: -78.49,
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Principal',
        organizationId,
        phone: '+593999999999',
        slug: 'principal',
        timezone: 'UTC',
        whatsappPhone: '+593999999999',
      },
    });
    locationId = location.id;
    const membership = await database.membership.create({
      data: {
        organizationId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
        userId,
      },
    });
    membershipId = membership.id;
    await database.userRegistrationProfile.create({
      data: {
        accountType: 'BUSINESS',
        businessName: `Negocio ${suffix}`,
        businessNameKey: `negocio-${suffix}`,
        city: 'Quito',
        countryCode: 'EC',
        coverImageUri: 'data:image/jpeg;base64,aGVsbG8=',
        facebookUrl: 'https://facebook.com/nava-test',
        instagramUrl: 'https://instagram.com/nava-test',
        openingTime: '09:00',
        closingTime: '18:00',
        phoneKey: `+59398${String(Date.now()).slice(-7)}`,
        userId,
      },
    });
    await database.memberLocation.create({
      data: { locationId, membershipId },
    });
    const service = await database.service.create({
      data: {
        durationMinutes: 30,
        imageData: 'data:image/jpeg;base64,c2VydmljaW8=',
        name: `Corte ${suffix}`,
        onlineBooking: true,
        organizationId,
        priceCents: 1200,
      },
    });
    serviceId = service.id;
    await database.professionalService.create({
      data: { locationId, membershipId, serviceId },
    });
    const product = await database.product.create({
      data: {
        imageData: 'data:image/jpeg;base64,cHJvZHVjdG8=',
        name: `Cera ${suffix}`,
        organizationId,
        salePriceCents: 1800,
      },
    });
    await database.locationInventory.create({
      data: {
        locationId,
        productId: product.id,
        quantityOnHand: 3,
      },
    });

    for (let weekday = 0; weekday < 7; weekday += 1) {
      await database.businessWeeklySchedule.create({
        data: {
          endMinute: 1080,
          isOpen: true,
          locationId,
          organizationId,
          startMinute: 540,
          weekday,
        },
      });
      await database.weeklySchedule.create({
        data: {
          endMinute: 1080,
          locationId,
          membershipId,
          startMinute: 540,
          weekday,
        },
      });
    }
    accessToken = createOpaqueToken();
    await database.session.create({
      data: {
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        tokenHash: hashOpaqueToken(accessToken),
        userId,
      },
    });
    app = await buildApi({
      config: readConfig({
        API_HOST: '127.0.0.1',
        API_PORT: '4000',
        APP_ENV: 'local',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: testDatabaseUrl!,
      }),
      database,
      publicBookingMailer: mailer,
    });
  });

  afterAll(async () => {
    await app?.close();
    await database.appointment.deleteMany({ where: { organizationId } });
    await database.client.deleteMany({ where: { organizationId } });
    await database.professionalService.deleteMany({ where: { locationId } });
    await database.weeklySchedule.deleteMany({ where: { locationId } });
    await database.businessWeeklySchedule.deleteMany({
      where: { locationId },
    });
    await database.memberLocation.deleteMany({ where: { locationId } });
    await database.service.deleteMany({ where: { organizationId } });
    await database.location.deleteMany({ where: { organizationId } });
    await database.membership.deleteMany({ where: { organizationId } });
    await database.organization.deleteMany({ where: { id: organizationId } });
    await database.session.deleteMany({ where: { userId } });
    await database.user.deleteMany({ where: { id: userId } });
    await database.$disconnect();
  });

  function futureSlot(dayOffset: number, hour: number) {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + dayOffset);
    value.setUTCHours(hour, 0, 0, 0);
    return value.toISOString();
  }

  async function createAndVerifyBooking(
    idempotencyKey: string,
    startsAt: string,
    email: string,
  ) {
    const createResponse = await app.inject({
      headers: { 'idempotency-key': idempotencyKey },
      method: 'POST',
      payload: {
        email,
        fullName: 'Cliente Público',
        membershipId,
        phone: clientPhone,
        policyAccepted: true,
        serviceIds: [serviceId],
        startsAt,
      },
      url: `/v1/public/${organizationSlug}/principal/bookings`,
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json<{
      bookingId: string;
      verificationRequired: boolean;
    }>();
    expect(created.verificationRequired).toBe(true);
    expect(lastVerificationCode).toMatch(/^\d{6}$/u);

    const repeated = await app.inject({
      headers: { 'idempotency-key': idempotencyKey },
      method: 'POST',
      payload: {
        email,
        fullName: 'Cliente Público',
        membershipId,
        phone: clientPhone,
        policyAccepted: true,
        serviceIds: [serviceId],
        startsAt,
      },
      url: `/v1/public/${organizationSlug}/principal/bookings`,
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<{ bookingId: string }>().bookingId).toBe(
      created.bookingId,
    );

    const verifyResponse = await app.inject({
      method: 'POST',
      payload: { code: lastVerificationCode },
      url: `/v1/public/bookings/${created.bookingId}/verify`,
    });
    expect(verifyResponse.statusCode).toBe(200);
    return verifyResponse.json<{
      managementToken: string;
      managementUrl: string;
    }>();
  }

  it('publica catálogo, evita duplicados y permite gestionar una cita', async () => {
    const catalog = await app.inject({
      method: 'GET',
      url: `/v1/public/${organizationSlug}/principal`,
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().location).toMatchObject({
      formattedAddress: 'Av. República y Amazonas, Quito, Ecuador',
      latitude: -0.19,
      longitude: -78.49,
    });
    expect(catalog.json().organization.profilePhotoData).toBe(
      'data:image/jpeg;base64,cGVyZmls',
    );
    expect(catalog.json().organization.coverImageUri).toBe(
      'data:image/jpeg;base64,aGVsbG8=',
    );
    expect(catalog.json().organization.description).toBe(
      'Especialistas en cortes y cuidado de tu estilo.',
    );
    expect(catalog.json().organization.facebookUrl).toBe(
      'https://facebook.com/nava-test',
    );
    expect(catalog.json().organization.instagramUrl).toBe(
      'https://instagram.com/nava-test',
    );
    expect(catalog.json().professionals).toHaveLength(1);
    expect(catalog.json().services).toHaveLength(1);

    expect(catalog.json().services[0].imageData).toBe(
      'data:image/jpeg;base64,c2VydmljaW8=',
    );
    expect(catalog.json().products).toEqual([
      expect.objectContaining({
        imageData: 'data:image/jpeg;base64,cHJvZHVjdG8=',
        isAvailable: true,
      }),
    ]);
    const availability = await app.inject({
      method: 'GET',
      url: `/v1/public/${organizationSlug}/principal/availability?date=${futureSlot(3, 9).slice(0, 10)}&membershipId=${membershipId}&serviceIds=${serviceId}`,
    });
    expect(availability.statusCode).toBe(200);
    const availabilityBody = availability.json<{
      durationMinutes: number;
      slots: ReadonlyArray<{ startsAt: string }>;
    }>();
    const slotStartTimes = availabilityBody.slots
      .slice(0, 3)
      .map((slot) => Date.parse(slot.startsAt));
    expect(availabilityBody.durationMinutes).toBe(30);
    expect(slotStartTimes[1]! - slotStartTimes[0]!).toBe(30 * 60_000);
    expect(slotStartTimes[2]! - slotStartTimes[1]!).toBe(30 * 60_000);

    const startsAt = futureSlot(3, 10);
    const management = await createAndVerifyBooking(
      `public-booking-${randomUUID()}`,
      startsAt,
      `client-${suffix}@example.com`,
    );
    const queuedNotification = await database.appNotification.findFirst({
      orderBy: { createdAt: 'desc' },
      where: { organizationId, type: 'APPOINTMENT_CREATED' },
    });
    expect(queuedNotification).not.toBeNull();
    expect(queuedNotification?.data).toMatchObject({
      delivery: {
        email: { attempts: 0, state: 'skipped' },
        push: { attempts: 1, state: 'skipped' },
      },
      route: '/agenda',
      type: 'created',
    });
    expect(management.managementToken.length).toBeGreaterThan(32);

    const managed = await app.inject({
      method: 'GET',
      url: `/v1/public/booking/${management.managementToken}`,
    });
    expect(managed.statusCode).toBe(200);
    expect(managed.json().appointment.status).toBe('confirmed');
    expect(managed.json().appointment.services).toHaveLength(1);

    const rescheduledAt = futureSlot(4, 11);
    const rescheduled = await app.inject({
      method: 'POST',
      payload: { startsAt: rescheduledAt },
      url: `/v1/public/booking/${management.managementToken}/reschedule`,
    });
    expect(rescheduled.statusCode).toBe(200);
    expect(rescheduled.json().appointment.startsAt).toBe(rescheduledAt);

    const cancelled = await app.inject({
      method: 'POST',
      payload: { reason: 'Cambio de planes' },
      url: `/v1/public/booking/${management.managementToken}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().appointment.status).toBe('cancelled');

    const cannotReactivate = await app.inject({
      method: 'POST',
      payload: { startsAt: futureSlot(6, 13) },
      url: `/v1/public/booking/${management.managementToken}/reschedule`,
    });
    expect(cannotReactivate.statusCode).toBe(409);
    expect(cannotReactivate.json().code).toBe('PUBLIC_BOOKING_NOT_ACTIVE');
  });

  it('publica una reseña verificada y permite ocultarla', async () => {
    const management = await createAndVerifyBooking(
      `public-review-${randomUUID()}`,
      futureSlot(5, 12),
      `review-${suffix}@example.com`,
    );
    const access = await database.publicBookingAccess.findUniqueOrThrow({
      where: {
        managementTokenHash: hashOpaqueToken(management.managementToken),
      },
    });
    await database.appointment.update({
      data: {
        reservesSlot: false,
        status: AppointmentStatus.COMPLETED,
      },
      where: { id: access.appointmentId },
    });
    const reviewResponse = await app.inject({
      method: 'POST',
      payload: { comment: 'Muy buen servicio', rating: 5 },
      url: `/v1/public/booking/${management.managementToken}/review`,
    });
    expect(reviewResponse.statusCode).toBe(201);
    const reviewId = reviewResponse.json().review.id as string;

    const catalog = await app.inject({
      method: 'GET',
      url: `/v1/public/${organizationSlug}/principal`,
    });
    expect(catalog.json().reviews).toHaveLength(1);

    const hidden = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'PATCH',
      payload: { isVisible: false },
      url: `/v1/reviews/${reviewId}/visibility`,
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().review.isVisible).toBe(false);
  });

  it('solicita reconfirmación y cancela al vencer la política configurada', async () => {
    const management = await createAndVerifyBooking(
      `public-reminder-${randomUUID()}`,
      futureSlot(6, 14),
      `reminder-${suffix}@example.com`,
    );
    const access = await database.publicBookingAccess.findUniqueOrThrow({
      where: {
        managementTokenHash: hashOpaqueToken(management.managementToken),
      },
    });
    await database.organization.update({
      data: {
        bookingConfirmationDeadlineMinutes: 1440,
        bookingReminderMinutes: 10_080,
        bookingUnconfirmedAction: UnconfirmedBookingAction.CANCEL,
      },
      where: { id: organizationId },
    });
    await database.appointment.update({
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
      where: { id: access.appointmentId },
    });

    await processPublicBookingLifecycle(database, mailer);
    const awaiting = await database.appointment.findUniqueOrThrow({
      where: { id: access.appointmentId },
    });
    expect(awaiting.status).toBe(AppointmentStatus.AWAITING_CONFIRMATION);
    expect(reminderMessages).toBeGreaterThan(0);

    await database.appointment.update({
      data: {
        attendanceConfirmationDeadlineAt: new Date(Date.now() - 60_000),
      },
      where: { id: access.appointmentId },
    });
    await processPublicBookingLifecycle(database, mailer);
    const cancelled = await database.appointment.findUniqueOrThrow({
      where: { id: access.appointmentId },
    });
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);
    expect(cancelled.reservesSlot).toBe(false);
  });

  it('oculta al profesional solo en su sucursal y rechaza nuevas reservas publicas', async () => {
    const disabled = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'PATCH',
      payload: { locationId, onlineBookingEnabled: false },
      url: `/v1/team/members/${membershipId}/online-booking`,
    });
    expect(disabled.statusCode).toBe(200);
    expect(
      disabled.json<{ onlineBookingEnabled: boolean }>().onlineBookingEnabled,
    ).toBe(false);

    const catalog = await app.inject({
      method: 'GET',
      url: `/v1/public/${organizationSlug}/principal`,
    });
    expect(catalog.statusCode).toBe(200);
    expect(
      catalog.json<{ professionals: Array<{ id: string }> }>().professionals,
    ).not.toContainEqual(expect.objectContaining({ id: membershipId }));

    const availability = await app.inject({
      method: 'GET',
      url: `/v1/public/${organizationSlug}/principal/availability?date=${futureSlot(7, 9).slice(0, 10)}&membershipId=${membershipId}&serviceIds=${serviceId}`,
    });
    expect(availability.statusCode).toBe(404);

    const newBooking = await app.inject({
      headers: { 'idempotency-key': `unavailable-${randomUUID()}` },
      method: 'POST',
      payload: {
        email: `unavailable-${suffix}@example.com`,
        fullName: 'Cliente sin reserva',
        membershipId,
        phone: clientPhone,
        policyAccepted: true,
        serviceIds: [serviceId],
        startsAt: futureSlot(7, 9),
      },
      url: `/v1/public/${organizationSlug}/principal/bookings`,
    });
    expect(newBooking.statusCode).toBe(404);
  });
});
