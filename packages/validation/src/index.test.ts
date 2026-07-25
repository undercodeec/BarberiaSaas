import { describe, expect, it } from 'vitest';

import {
  appEnvironmentSchema,
  createTeamInvitationSchema,
  createServiceSchema,
  createAppointmentSchema,
  createSlug,
  locationOnboardingSchema,
  publicApiConfigSchema,
  signUpSchema,
  verifyEmailSchema,
  weeklyScheduleIntervalSchema,
} from './index';

describe('esquemas de entorno', () => {
  it('acepta un entorno soportado', () => {
    expect(appEnvironmentSchema.parse('local')).toBe('local');
  });

  it('rechaza una URL pública inválida', () => {
    expect(() => publicApiConfigSchema.parse({ url: 'incorrecta' })).toThrow();
  });
});

describe('servicios y horarios', () => {
  it('acepta duraciones en intervalos de cinco minutos', () => {
    expect(
      createServiceSchema.safeParse({
        durationMinutes: 30,
        name: 'Corte clásico',
        priceCents: 1200,
      }).success,
    ).toBe(true);
  });

  it('rechaza duraciones inválidas', () => {
    expect(
      createServiceSchema.safeParse({
        durationMinutes: 17,
        name: 'Corte',
        priceCents: 1200,
      }).success,
    ).toBe(false);
  });

  it('rechaza intervalos con fin anterior al inicio', () => {
    expect(
      weeklyScheduleIntervalSchema.safeParse({
        endMinute: 480,
        startMinute: 600,
        weekday: 1,
      }).success,
    ).toBe(false);
  });
});

describe('equipo', () => {
  it('exige nombre, correo, sucursal y rol al crear un perfil invitado', () => {
    expect(
      createTeamInvitationSchema.safeParse({
        email: 'barbero@example.com',
        fullName: 'Carlos Barbero',
        locationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        role: 'barber',
      }).success,
    ).toBe(true);
    expect(
      createTeamInvitationSchema.safeParse({
        email: 'barbero@example.com',
        fullName: '',
        locationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        role: 'barber',
      }).success,
    ).toBe(false);
  });
});

describe('motor de agenda', () => {
  it('valida una solicitud de cita con servicios', () => {
    expect(
      createAppointmentSchema.safeParse({
        clientName: 'Cliente Prueba',
        locationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        professionalMembershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        serviceIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
        startsAt: '2030-01-14T15:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rechaza una cita sin servicios', () => {
    expect(
      createAppointmentSchema.safeParse({
        clientName: 'Cliente Prueba',
        locationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        professionalMembershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        serviceIds: [],
        startsAt: '2030-01-14T15:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('autenticación y onboarding', () => {
  it('rechaza contraseñas distintas', () => {
    const result = signUpSchema.safeParse({
      accountType: 'business',
      businessName: 'Barbería Ana',
      city: 'Quito',
      closingTime: '18:00',
      confirmPassword: 'otra-clave',
      countryCode: 'EC',
      email: 'owner@example.com',
      fullName: 'Ana Dueña',
      openingTime: '09:00',
      password: 'clave-segura',
      phone: '+593999999999',
    });
    expect(result.success).toBe(false);
  });

  it('valida todos los datos del perfil de registro', () => {
    expect(
      signUpSchema.safeParse({
        accountType: 'professional',
        businessName: 'Estudio Ana',
        city: 'Quito',
        closingTime: '18:00',
        confirmPassword: 'clave-segura',
        countryCode: 'EC',
        email: 'ana@example.com',
        fullName: 'Ana Dueña',
        openingTime: '09:00',
        password: 'clave-segura',
        phone: '+593999999999',
      }).success,
    ).toBe(true);
  });

  it('solo acepta códigos de verificación de seis dígitos', () => {
    expect(
      verifyEmailSchema.safeParse({
        code: '123456',
        email: 'owner@example.com',
      }).success,
    ).toBe(true);
    expect(
      verifyEmailSchema.safeParse({ code: '12345', email: 'owner@example.com' })
        .success,
    ).toBe(false);
  });

  it('valida una sucursal ecuatoriana', () => {
    expect(
      locationOnboardingSchema.safeParse({
        countryCode: 'EC',
        currencyCode: 'USD',
        name: 'Centro',
        phone: '+593999000000',
        slug: 'centro',
        timezone: 'America/Guayaquil',
        whatsappPhone: '+593999000000',
      }).success,
    ).toBe(true);
  });

  it('genera slugs estables sin acentos', () => {
    expect(createSlug(' Barbería El Ñaño ')).toBe('barberia-el-nano');
  });
});
