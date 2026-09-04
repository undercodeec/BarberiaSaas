import { describe, expect, it } from 'vitest';

import {
  appEnvironmentSchema,
  businessScheduleDaySchema,
  createOnboardingCollaboratorSchema,
  createPublicBookingSchema,
  createTeamInvitationSchema,
  createServiceSchema,
  createAppointmentSchema,
  createSlug,
  dailyAppointmentsQuerySchema,
  invitationSignUpSchema,
  locationOnboardingSchema,
  mapsAutocompleteSchema,
  mapsReverseGeocodeSchema,
  MAX_HIGH_END_IPHONE_IMAGE_DATA_URI_LENGTH,
  publicApiConfigSchema,
  replaceBusinessScheduleSchema,
  signUpSchema,
  updateBookingSettingsSchema,
  updateOnboardingAccountDetailsSchema,
  updateTeamMemberSchema,
  verifyEmailSchema,
  welcomeSurveyResponseSchema,
  weeklyScheduleIntervalSchema,
} from './index';

describe('rango de agenda', () => {
  const locationId = '11111111-1111-4111-8111-111111111111';

  it('acepta una fecha o un rango máximo de 31 días', () => {
    expect(
      dailyAppointmentsQuerySchema.safeParse({
        date: '2026-08-19',
        locationId,
      }).success,
    ).toBe(true);
    expect(
      dailyAppointmentsQuerySchema.safeParse({
        from: '2026-08-01',
        locationId,
        to: '2026-08-31',
      }).success,
    ).toBe(true);
  });

  it('rechaza rangos incompletos, invertidos o mayores a 31 días', () => {
    expect(
      dailyAppointmentsQuerySchema.safeParse({
        from: '2026-08-01',
        locationId,
      }).success,
    ).toBe(false);
    expect(
      dailyAppointmentsQuerySchema.safeParse({
        from: '2026-08-20',
        locationId,
        to: '2026-08-19',
      }).success,
    ).toBe(false);
    expect(
      dailyAppointmentsQuerySchema.safeParse({
        from: '2026-08-01',
        locationId,
        to: '2026-09-01',
      }).success,
    ).toBe(false);
  });
});

describe('esquemas de entorno', () => {
  it('acepta un entorno soportado', () => {
    expect(appEnvironmentSchema.parse('local')).toBe('local');
  });

  it('rechaza una URL pública inválida', () => {
    expect(() => publicApiConfigSchema.parse({ url: 'incorrecta' })).toThrow();
  });
});

describe('ubicación de Google Maps', () => {
  it('acepta una búsqueda con coordenadas válidas y normaliza el país', () => {
    expect(
      mapsAutocompleteSchema.parse({
        countryCode: 'ec',
        latitude: -0.19,
        longitude: -78.49,
        query: 'Nava Barbería',
        sessionToken: 'session-token-123456',
      }).countryCode,
    ).toBe('EC');
  });

  it('rechaza coordenadas incompletas o fuera del planeta', () => {
    expect(
      mapsAutocompleteSchema.safeParse({
        countryCode: 'EC',
        latitude: -0.19,
        query: 'Nava Barbería',
        sessionToken: 'session-token-123456',
      }).success,
    ).toBe(false);
    expect(
      mapsReverseGeocodeSchema.safeParse({
        latitude: 120,
        longitude: -78.49,
      }).success,
    ).toBe(false);
  });
});

describe('reglas de reservas públicas', () => {
  const settings = {
    cancellationLeadMinutes: 120,
    confirmationDeadlineMinutes: 360,
    confirmationEnabled: true,
    policyText: 'Acepto asistir puntualmente y respetar las reglas informadas.',
    reminderMinutes: 1440,
    rescheduleLeadMinutes: 120,
    unconfirmedAction: 'keep',
  } as const;

  it('exige que el plazo de respuesta ocurra después del recordatorio', () => {
    expect(updateBookingSettingsSchema.safeParse(settings).success).toBe(true);
    expect(
      updateBookingSettingsSchema.safeParse({
        ...settings,
        confirmationDeadlineMinutes: settings.reminderMinutes,
      }).success,
    ).toBe(false);
  });

  it('rechaza un servicio repetido dentro de la misma cita', () => {
    const serviceId = 'c7b4e705-a4a8-4337-a2a7-a8147b44be07';
    expect(
      createPublicBookingSchema.safeParse({
        email: 'cliente@example.com',
        fullName: 'Cliente Público',
        membershipId: 'ac2c28df-8da1-4716-af55-f38ac99d57af',
        phone: '+593999999999',
        policyAccepted: true,
        serviceIds: [serviceId, serviceId],
        startsAt: '2026-08-10T15:00:00.000Z',
      }).success,
    ).toBe(false);
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

  it('valida una semana completa del negocio', () => {
    const days = Array.from({ length: 7 }, (_, weekday) => ({
      endMinute: 1080,
      isOpen: weekday !== 0,
      startMinute: 540,
      weekday,
    }));
    expect(
      replaceBusinessScheduleSchema.safeParse({
        days,
        locationId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(
      replaceBusinessScheduleSchema.safeParse({
        days: days.map((day) => ({ ...day, weekday: 1 })),
        locationId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
  });

  it('rechaza un horario general con cierre anterior a la apertura', () => {
    expect(
      businessScheduleDaySchema.safeParse({
        endMinute: 480,
        isOpen: true,
        startMinute: 600,
        weekday: 1,
      }).success,
    ).toBe(false);
  });
});

describe('equipo', () => {
  it('valida colaborador de onboarding con configuración adicional', () => {
    expect(
      createOnboardingCollaboratorSchema.safeParse({
        agendaColor: '#2464E8',
        identification: '0102030405',
        name: 'Carlos',
        phone: '0991234567',
        role: 'barber',
      }).success,
    ).toBe(true);
    expect(
      createOnboardingCollaboratorSchema.safeParse({
        agendaColor: '#12345',
        name: 'Carlos',
        role: 'barber',
      }).success,
    ).toBe(false);
  });

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

  it('acepta las sucursales seleccionadas al actualizar un receptionist', () => {
    expect(
      updateTeamMemberSchema.parse({
        commissionPercentage: null,
        fullName: 'Recepcionista Norte',
        locationIds: [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ],
        role: 'receptionist',
      }),
    ).toMatchObject({
      locationIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
    });
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

  it('rechaza notas con datos médicos o biométricos', () => {
    expect(
      createAppointmentSchema.safeParse({
        clientName: 'Cliente Prueba',
        locationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        notes: 'Tiene alergia a determinados productos.',
        professionalMembershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        serviceIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
        startsAt: '2030-01-14T15:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('autenticación y onboarding', () => {
  it('acepta una portada de hasta 15 MiB codificada por un iPhone de alta gama', () => {
    const dataUriPrefix = 'data:image/jpeg;base64,';
    const coverImageUri = `${dataUriPrefix}${'A'.repeat(
      MAX_HIGH_END_IPHONE_IMAGE_DATA_URI_LENGTH - dataUriPrefix.length,
    )}`;
    const accountDetails = {
      addressLine: null,
      businessCategory: 'BARBERSHOP',
      businessName: 'Barbería Ana',
      city: 'Quito',
      countryCode: 'EC',
      coverImageUri,
      description: null,
      facebookUrl: null,
      instagramUrl: null,
      phone: '+593999999999',
      timezone: 'America/Guayaquil',
    };

    expect(
      updateOnboardingAccountDetailsSchema.safeParse(accountDetails).success,
    ).toBe(true);
    expect(
      updateOnboardingAccountDetailsSchema.safeParse({
        ...accountDetails,
        coverImageUri: `${coverImageUri}A`,
      }).success,
    ).toBe(false);
  });

  it('valida el registro mínimo de una persona invitada', () => {
    expect(
      invitationSignUpSchema.safeParse({
        confirmPassword: 'Clave-segura-123',
        email: 'invitee@example.com',
        fullName: 'Persona Invitada',
        password: 'Clave-segura-123',
        privacyPolicyAccepted: true,
        token: 'x'.repeat(32),
      }).success,
    ).toBe(true);
    expect(
      invitationSignUpSchema.safeParse({
        confirmPassword: 'Clave-segura-123',
        email: 'invitee@example.com',
        fullName: 'Persona Invitada',
        password: 'Clave-segura-123',
        privacyPolicyAccepted: false,
        token: 'x'.repeat(32),
      }).success,
    ).toBe(false);
  });

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
      privacyPolicyAccepted: true,
    });
    expect(result.success).toBe(false);
  });

  it('permite registrar una cuenta sin aceptar la Política de Privacidad', () => {
    expect(
      signUpSchema.safeParse({
        accountType: 'professional',
        businessName: 'Estudio Ana',
        city: 'Quito',
        closingTime: '18:00',
        confirmPassword: 'clave-segura',
        countryCode: 'EC',
        email: 'privacidad@example.com',
        fullName: 'Ana Dueña',
        openingTime: '09:00',
        password: 'clave-segura',
        phone: '+593999999999',
        privacyPolicyAccepted: false,
        timezone: 'America/Guayaquil',
      }).success,
    ).toBe(true);
  });

  it('valida todos los datos del perfil de registro', () => {
    const result = signUpSchema.safeParse({
      accountType: 'professional',
      businessName: 'Estudio Ana',
      city: 'Quito',
      closingTime: '18:00',
      confirmPassword: 'clave-segura',
      countryCode: 'EC',
      email: 'ana@example.com',
      timezone: 'America/Lima',
      fullName: 'Ana Dueña',
      openingTime: '09:00',
      password: 'clave-segura',
      phone: '+593999999999',
      privacyPolicyAccepted: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessCategory).toBe('BARBERSHOP');
      expect(result.data.marketingOptIn).toBe(false);
    }
  });

  it('acepta las categorías de cuidado personal y rechaza valores ajenos', () => {
    const valid = {
      accountType: 'business' as const,
      businessName: 'Estudio de uñas Ana',
      businessCategory: 'NAIL_STUDIO',
      city: 'Quito',
      closingTime: '18:00',
      confirmPassword: 'clave-segura',
      countryCode: 'EC',
      email: 'unas@example.com',
      fullName: 'Ana Dueña',
      openingTime: '09:00',
      password: 'clave-segura',
      phone: '+593999999999',
      privacyPolicyAccepted: true,
      timezone: 'America/Guayaquil',
    };
    expect(signUpSchema.safeParse(valid).success).toBe(true);
    expect(
      signUpSchema.safeParse({ ...valid, businessCategory: 'MEDICAL_CLINIC' })
        .success,
    ).toBe(false);
  });

  it('acepta zonas IANA y rechaza valores que no lo son', () => {
    const valid = {
      accountType: 'business' as const,
      businessName: 'Barbería Ana',
      city: 'Quito',
      closingTime: '18:00',
      confirmPassword: 'clave-segura',
      countryCode: 'EC',
      email: 'zona@example.com',
      fullName: 'Ana Dueña',
      openingTime: '09:00',
      password: 'clave-segura',
      phone: '+593999999999',
      privacyPolicyAccepted: true,
      timezone: 'America/Lima',
    };
    expect(
      signUpSchema.safeParse({ ...valid, timezone: 'America/Lima' }).success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({ ...valid, timezone: 'UTC+5' }).success,
    ).toBe(false);
  });

  it('rechaza un horario de registro que cierre antes de abrir', () => {
    expect(
      signUpSchema.safeParse({
        accountType: 'professional',
        businessName: 'Estudio nocturno',
        city: 'Quito',
        closingTime: '09:00',
        confirmPassword: 'clave-segura',
        countryCode: 'EC',
        email: 'nocturno@example.com',
        fullName: 'Ana Due\u00f1a',
        openingTime: '18:00',
        password: 'clave-segura',
        phone: '+593988888888',
      }).success,
    ).toBe(false);
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

describe('encuesta de bienvenida', () => {
  it('acepta opciones conocidas sin repeticiones', () => {
    expect(
      welcomeSurveyResponseSchema.safeParse({
        selectedOptions: ['Buscador'],
      }).success,
    ).toBe(true);
  });

  it('rechaza respuestas vacías, repetidas o desconocidas', () => {
    expect(
      welcomeSurveyResponseSchema.safeParse({ selectedOptions: [] }).success,
    ).toBe(false);
    expect(
      welcomeSurveyResponseSchema.safeParse({
        selectedOptions: ['Publicidad', 'Publicidad'],
      }).success,
    ).toBe(false);
    expect(
      welcomeSurveyResponseSchema.safeParse({
        selectedOptions: ['Canal no registrado'],
      }).success,
    ).toBe(false);
  });
});
