import { z } from 'zod';

export const appEnvironmentSchema = z.enum([
  'local',
  'preview',
  'staging',
  'production',
]);

export const publicApiConfigSchema = z.object({
  url: z.url('La URL de la API no es válida.'),
});

export const WELCOME_SURVEY_OPTIONS = [
  'Publicidad',
  'Redes sociales de Nava (Facebook o Instagram)',
  'Buscador',
  'Recomendación de una academia, clase u otro negocio',
  'Evento o feria',
] as const;

export type WelcomeSurveyOption = (typeof WELCOME_SURVEY_OPTIONS)[number];

export const welcomeSurveyResponseSchema = z.object({
  selectedOptions: z
    .array(z.enum(WELCOME_SURVEY_OPTIONS))
    .min(1, 'Selecciona al menos una opción.')
    .max(WELCOME_SURVEY_OPTIONS.length)
    .refine((options) => new Set(options).size === options.length, {
      message: 'No puedes seleccionar la misma opción más de una vez.',
    }),
});

const emailSchema = z.email('Ingresa un correo electrónico válido.').max(254);
const SENSITIVE_DATA_PATTERN =
  /diagnostic|historial clinico|historia clinica|enfermedad|medicamento|alergia|biometric|huella dactilar|adn|sangre|salud mental|tratamiento medic/u;
const SENSITIVE_DATA_MESSAGE =
  'Nava no permite registrar datos médicos, biométricos u otra información sensible.';

export function hasSensitiveDataContent(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();
  return SENSITIVE_DATA_PATTERN.test(normalized);
}

const operationalNotesSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => !hasSensitiveDataContent(value), SENSITIVE_DATA_MESSAGE);
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72);
const newPasswordSchema = passwordSchema.min(
  12,
  'La nueva contraseña debe tener al menos 12 caracteres.',
);
const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, 'La hora debe tener formato HH:MM.');
export const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine(
    (timezone) => {
      try {
        new Intl.DateTimeFormat('es', { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'La zona horaria no es válida.' },
  );
const businessNameSchema = z
  .string()
  .trim()
  .min(2, 'Ingresa el nombre del negocio.')
  .max(120);
export const BUSINESS_CATEGORY_VALUES = [
  'BARBERSHOP',
  'BEAUTY_SALON',
  'NAIL_STUDIO',
  'SPA_WELLNESS',
  'AESTHETICS',
  'PERSONAL_CARE_OTHER',
] as const;
export const businessCategorySchema = z.enum(BUSINESS_CATEGORY_VALUES);
export const selectBusinessCategorySchema = z.object({
  businessCategory: businessCategorySchema,
});
const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Ingresa un teléfono válido.')
  .max(24);
const slugSchema = z
  .string()
  .trim()
  .min(2, 'El identificador es demasiado corto.')
  .max(80, 'El identificador es demasiado largo.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    'Usa letras minúsculas, números y guiones.',
  );
const uuidSchema = z.uuid('El identificador no es válido.');
const serviceIdsSchema = z
  .array(uuidSchema)
  .min(1, 'Selecciona al menos un servicio.')
  .max(10)
  .refine((serviceIds) => new Set(serviceIds).size === serviceIds.length, {
    message: 'No puedes seleccionar el mismo servicio más de una vez.',
  });
const agendaColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/u, 'El color de agenda no es válido.');
const durationMinutesSchema = z
  .number()
  .int()
  .min(5, 'La duración mínima es de 5 minutos.')
  .max(480, 'La duración máxima es de 480 minutos.')
  .refine((duration) => duration % 5 === 0, {
    message: 'La duración debe avanzar en intervalos de 5 minutos.',
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal('ELIMINAR'),
  password: passwordSchema,
});

export const closeOwnedBusinessSchema = z.object({
  confirmation: z.literal('CERRAR'),
  password: passwordSchema,
});

export const signUpSchema = z
  .object({
    accountType: z.enum(['business', 'professional']),
    // El valor por defecto conserva los registros iniciados antes de que el
    // selector de categoría llegue a todos los clientes publicados.
    businessCategory: businessCategorySchema.default('BARBERSHOP'),
    businessName: businessNameSchema,
    city: z.string().trim().min(2, 'Selecciona una ciudad.').max(120),
    closingTime: timeSchema,
    confirmPassword: newPasswordSchema,
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/u, 'El código de país no es válido.'),
    email: emailSchema,
    fullName: z.string().trim().min(2, 'Ingresa tu nombre completo.').max(120),
    marketingOptIn: z.boolean().default(false),
    privacyPolicyAccepted: z.boolean().default(false),
    openingTime: timeSchema,
    password: newPasswordSchema,
    phone: phoneSchema,
    timezone: timezoneSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  })
  .refine((value) => value.openingTime < value.closingTime, {
    message: 'La hora de cierre debe ser posterior a la de apertura.',
    path: ['closingTime'],
  });

export const invitationSignUpSchema = z
  .object({
    confirmPassword: newPasswordSchema,
    email: emailSchema,
    fullName: z.string().trim().min(2, 'Ingresa tu nombre completo.').max(120),
    password: newPasswordSchema,
    privacyPolicyAccepted: z
      .boolean()
      .refine(
        (value) => value,
        'Debes aceptar la Política de Privacidad para crear tu cuenta.',
      ),
    token: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9_-]{32,512}$/u,
        'La invitación no es válida o ya venció.',
      ),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export const registrationAvailabilitySchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.email || value.phone),
    'Envía al menos un campo para comprobar.',
  );

export const verifyEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Ingresa el código de 6 dígitos.'),
  email: emailSchema,
});

export const resendVerificationSchema = z.object({ email: emailSchema });

export const recoverAccessSchema = z.object({ email: emailSchema });
const optionalProfileText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .transform((value) => value || null);

const optionalProfileUrl = z
  .union([z.literal(''), z.string().trim().url().max(2048), z.null()])
  .transform((value) => value || null);

// The 48 MP camera on current iPhone Pro models produces images up to
// 8064 × 6048 px. Keep the encoded value in sync with the 15 MiB file limit.
export const MAX_HIGH_END_IPHONE_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_HIGH_END_IPHONE_IMAGE_DATA_URI_LENGTH =
  Math.ceil((MAX_HIGH_END_IPHONE_IMAGE_BYTES * 4) / 3) + 128;
export const MAX_HIGH_END_IPHONE_IMAGE_DIMENSION = 8_064;

const optionalCoverImage = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .max(MAX_HIGH_END_IPHONE_IMAGE_DATA_URI_LENGTH)
      .refine(
        (value) =>
          /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u.test(
            value,
          ) || /^https?:\/\//u.test(value),
        'La portada debe ser una imagen JPEG, PNG o WebP valida.',
      ),
    z.null(),
  ])
  .transform((value) => value || null);

const imageDataSchema = z
  .string()
  .trim()
  .max(2_000_000)
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u,
    'La imagen debe ser un archivo JPEG, PNG o WebP válido.',
  );
export const updateOnboardingAccountDetailsSchema = z.object({
  addressLine: optionalProfileText(240),
  businessCategory: businessCategorySchema,
  businessName: businessNameSchema,
  city: z.string().trim().min(2).max(120),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/u, 'El c\u00f3digo de pa\u00eds no es v\u00e1lido.'),
  coverImageUri: optionalCoverImage,
  description: optionalProfileText(500),
  facebookUrl: optionalProfileUrl,
  instagramUrl: optionalProfileUrl,
  phone: phoneSchema,
  timezone: timezoneSchema,
});

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);
const googleSessionTokenSchema = z.string().trim().min(16).max(128);

export const mapsAutocompleteSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/u)
      .transform((value) => value.toUpperCase()),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    query: z.string().trim().min(3).max(160),
    sessionToken: googleSessionTokenSchema,
  })
  .refine(
    (value) =>
      (value.latitude === undefined) === (value.longitude === undefined),
    { message: 'La latitud y longitud deben enviarse juntas.' },
  );

export const mapsPlaceDetailsSchema = z.object({
  placeId: z.string().trim().min(3).max(255),
  sessionToken: googleSessionTokenSchema,
});

export const mapsReverseGeocodeSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export const updateBusinessLocationSchema = z.object({
  addressLine: z.string().trim().min(3).max(240),
  city: z.string().trim().min(2).max(120).nullable().optional(),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/u)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  formattedAddress: z.string().trim().min(3).max(300),
  googlePlaceId: z.string().trim().min(3).max(255).nullable().optional(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export const resetPasswordSchema = z.object({
  password: newPasswordSchema,
  token: z.string().min(32, 'El enlace de recuperación no es válido.'),
});

export const organizationOnboardingSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa el nombre de la barbería.').max(120),
  slug: slugSchema.min(3, 'El enlace debe tener al menos 3 caracteres.'),
});

export const locationOnboardingSchema = z.object({
  addressLine: z.string().trim().max(240).optional(),
  city: z.string().trim().max(120).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/u, 'El código de país no es válido.'),
  currencyCode: z.string().regex(/^[A-Z]{3}$/u, 'La moneda no es válida.'),
  email: z.union([emailSchema, z.literal('')]).optional(),
  name: z.string().trim().min(2, 'Ingresa el nombre de la sucursal.').max(120),
  phone: z.string().trim().min(7, 'Ingresa un teléfono válido.').max(24),
  slug: slugSchema,
  timezone: timezoneSchema,
  whatsappPhone: z
    .string()
    .trim()
    .min(7, 'Ingresa un WhatsApp válido.')
    .max(24),
});

export const completeOnboardingSchema = organizationOnboardingSchema.extend({
  location: locationOnboardingSchema,
});

export const createTeamInvitationSchema = z.object({
  commissionPercentage: z.number().int().min(0).max(100).nullish(),
  email: emailSchema,
  fullName: z
    .string()
    .trim()
    .min(2, 'Ingresa el nombre del integrante.')
    .max(120),
  locationId: uuidSchema,
  role: z.enum(['manager', 'receptionist', 'barber']),
});

export const updateTeamMemberSchema = z
  .object({
    commissionPercentage: z.number().int().min(0).max(100).nullish(),
    fullName: z
      .string()
      .trim()
      .min(2, 'Ingresa el nombre del colaborador.')
      .max(120),
    locationIds: z
      .array(uuidSchema)
      .min(1, 'Selecciona al menos una sucursal.')
      .refine(
        (locationIds) => new Set(locationIds).size === locationIds.length,
        'No repitas sucursales.',
      )
      .optional(),
    role: z.enum(['manager', 'receptionist', 'barber']),
  })
  .superRefine((input, context) => {
    if (input.role === 'barber' && input.commissionPercentage == null) {
      context.addIssue({
        code: 'custom',
        message: 'Indica el porcentaje de comisión del profesional.',
        path: ['commissionPercentage'],
      });
    }
  });

export const updateMemberOnlineBookingSchema = z.object({
  locationId: uuidSchema,
  onlineBookingEnabled: z.boolean(),
});

export const acceptTeamInvitationSchema = z.object({
  token: z.string().min(32, 'La invitación no es válida.'),
});

export const createOnboardingCollaboratorSchema = z
  .object({
    agendaColor: agendaColorSchema.default('#2464E8'),
    canPerformServices: z.boolean().default(false),
    customRoleDescription: z.string().trim().max(500).nullish(),
    customRoleName: z.string().trim().max(80).nullish(),
    description: z.string().trim().max(500).nullish(),
    identification: z.string().trim().max(64).nullish(),
    name: z
      .string()
      .trim()
      .min(2, 'Ingresa el nombre del colaborador.')
      .max(120),
    phone: z.string().trim().max(24).nullish(),
    photoUri: z.string().trim().max(2048).nullish(),
    role: z.enum(['administrator', 'barber', 'custom']),
  })
  .superRefine((input, context) => {
    if (input.role === 'custom' && !input.customRoleName) {
      context.addIssue({
        code: 'custom',
        message: 'Ingresa el nombre del tipo personalizado.',
        path: ['customRoleName'],
      });
    }
  });

export const updateOnboardingCollaboratorSchema =
  createOnboardingCollaboratorSchema;

const onboardingServiceCategorySchema = z
  .object({
    description: z.string().trim().max(500),
    name: z.string().trim().min(2).max(80),
  })
  .nullable();

const onboardingServiceTaxSchema = z
  .object({
    addAtCheckout: z.boolean(),
    addAtPurchaseEnd: z.boolean(),
    name: z.string().trim().min(2).max(80),
    percentage: z.number().int().min(0).max(100),
  })
  .nullable();

export const createOnboardingServiceSchema = z.object({
  agendaColor: agendaColorSchema,
  category: onboardingServiceCategorySchema,
  description: z.string().trim().max(500).nullish(),
  downPaymentPercentage: z.number().int().min(0).max(100),
  durationMinutes: durationMinutesSchema,
  imageUri: z.string().trim().max(2048).nullish(),
  name: z.string().trim().min(2, 'Ingresa el nombre del servicio.').max(120),
  onlineBooking: z.boolean(),
  price: z.number().min(0).max(1_000_000),
  priceType: z.enum(['fixed', 'from', 'free', 'hidden']),
  showServiceTime: z.boolean(),
  tax: onboardingServiceTaxSchema,
});

export const updateOnboardingServiceSchema = createOnboardingServiceSchema;

export const createServiceCategorySchema = z.object({
  name: z.string().trim().min(2, 'Ingresa el nombre de la categoría.').max(80),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const createServiceSchema = z.object({
  categoryId: uuidSchema.nullish(),
  description: z.string().trim().max(500).nullish(),
  durationMinutes: durationMinutesSchema,
  imageData: imageDataSchema.nullish(),
  name: z.string().trim().min(2, 'Ingresa el nombre del servicio.').max(120),
  onlineBooking: z.boolean().default(true),
  priceCents: z.number().int().min(0, 'El precio no puede ser negativo.'),
});

export const updateServiceSchema = createServiceSchema;

export const updateAccountTypeSchema = z.object({
  accountType: z.enum(['business', 'professional']),
});

export const assignProfessionalServiceSchema = z.object({
  customDurationMinutes: durationMinutesSchema.nullish(),
  customPriceCents: z.number().int().min(0).nullish(),
  locationId: uuidSchema,
  membershipId: uuidSchema,
  serviceId: uuidSchema,
});

export const weeklyScheduleIntervalSchema = z
  .object({
    endMinute: z.number().int().min(1).max(1440),
    startMinute: z.number().int().min(0).max(1439),
    weekday: z.number().int().min(0).max(6),
  })
  .refine((schedule) => schedule.startMinute < schedule.endMinute, {
    message: 'La hora de inicio debe ser anterior a la hora de fin.',
    path: ['endMinute'],
  });

export const replaceWeeklySchedulesSchema = z.object({
  locationId: uuidSchema,
  membershipId: uuidSchema,
  schedules: z.array(weeklyScheduleIntervalSchema).max(21),
});

export const businessScheduleDaySchema = z
  .object({
    endMinute: z.number().int().min(1).max(1440),
    isOpen: z.boolean(),
    startMinute: z.number().int().min(0).max(1439),
    weekday: z.number().int().min(0).max(6),
  })
  .refine((schedule) => schedule.startMinute < schedule.endMinute, {
    message: 'La hora de apertura debe ser anterior a la hora de cierre.',
    path: ['endMinute'],
  });

export const replaceBusinessScheduleSchema = z
  .object({
    days: z
      .array(businessScheduleDaySchema)
      .length(7, 'Configura los siete días de la semana.'),
    locationId: uuidSchema,
  })
  .superRefine((input, context) => {
    const weekdays = new Set(input.days.map((day) => day.weekday));
    if (weekdays.size !== 7) {
      context.addIssue({
        code: 'custom',
        message: 'Cada día de la semana debe aparecer una sola vez.',
        path: ['days'],
      });
    }
  });

export const createScheduleBlockSchema = z
  .object({
    endsAt: z.iso.datetime(),
    locationId: uuidSchema,
    membershipId: uuidSchema,
    reason: z.string().trim().max(240).nullish(),
    startsAt: z.iso.datetime(),
  })
  .refine((block) => new Date(block.startsAt) < new Date(block.endsAt), {
    message: 'El inicio del bloqueo debe ser anterior al final.',
    path: ['endsAt'],
  });

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'La fecha no es válida.');

export const availabilityQuerySchema = z.object({
  date: localDateSchema,
  locationId: uuidSchema,
  membershipId: uuidSchema,
  serviceIds: z
    .string()
    .min(1)
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(serviceIdsSchema),
});

export const dailyAppointmentsQuerySchema = z
  .object({
    date: localDateSchema.optional(),
    from: localDateSchema.optional(),
    locationId: uuidSchema,
    membershipId: uuidSchema.optional(),
    to: localDateSchema.optional(),
  })
  .superRefine((input, context) => {
    const hasSingleDate = Boolean(input.date);
    const hasCompleteRange = Boolean(input.from && input.to);
    if (
      hasSingleDate === hasCompleteRange ||
      Boolean(input.from) !== Boolean(input.to)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Indica date o un rango from/to completo.',
        path: ['date'],
      });
      return;
    }
    if (!input.from || !input.to) return;
    const fromTime = Date.parse(`${input.from}T00:00:00.000Z`);
    const toTime = Date.parse(`${input.to}T00:00:00.000Z`);
    const rangeDays = (toTime - fromTime) / 86_400_000;
    if (rangeDays < 0 || rangeDays > 30) {
      context.addIssue({
        code: 'custom',
        message: 'El rango debe contener entre 1 y 31 días.',
        path: ['to'],
      });
    }
  });

export const appointmentEventsQuerySchema = z.object({
  after: z.string().regex(/^\d+$/u).default('0'),
});

export const createAppointmentSchema = z
  .object({
    clientEmail: z.union([emailSchema, z.literal('')]).nullish(),
    clientId: uuidSchema.nullish(),
    clientName: z.string().trim().max(120).nullish(),
    clientPhone: z.string().trim().min(7).max(24).nullish(),
    locationId: uuidSchema,
    notes: operationalNotesSchema.nullish(),
    professionalMembershipId: uuidSchema,
    serviceIds: serviceIdsSchema,
    startsAt: z.iso.datetime(),
  })
  .refine(
    (input) => Boolean(input.clientId || (input.clientName?.length ?? 0) >= 2),
    {
      message: 'Selecciona un cliente o ingresa su nombre.',
      path: ['clientName'],
    },
  );

export const rescheduleAppointmentSchema = z.object({
  startsAt: z.iso.datetime(),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().min(2, 'Indica el motivo de cancelación.').max(240),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum([
    'waiting',
    'confirmed',
    'checked_in',
    'in_progress',
    'completed',
    'no_show',
  ]),
});

export const updateBookingSettingsSchema = z
  .object({
    cancellationLeadMinutes: z.number().int().min(0).max(43_200),
    confirmationDeadlineMinutes: z.number().int().min(0).max(10_080),
    confirmationEnabled: z.boolean(),
    policyText: z.string().trim().min(20).max(1000),
    reminderMinutes: z.number().int().min(60).max(10_080),
    rescheduleLeadMinutes: z.number().int().min(0).max(43_200),
    servicePaymentConfirmationEnabled: z.boolean().optional(),
    unconfirmedAction: z.enum(['keep', 'cancel']),
  })
  .superRefine((value, context) => {
    if (
      value.confirmationEnabled &&
      value.confirmationDeadlineMinutes >= value.reminderMinutes
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'El plazo para responder debe ser posterior al envío del recordatorio.',
        path: ['confirmationDeadlineMinutes'],
      });
    }
  });

const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/u, 'Ingresa un teléfono internacional válido.');

export const createPublicBookingSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120),
  membershipId: uuidSchema,
  phone: e164PhoneSchema,
  policyAccepted: z.literal(true),
  serviceIds: serviceIdsSchema,
  startsAt: z.iso.datetime(),
});

export const verifyPublicBookingSchema = z.object({
  code: z.string().regex(/^\d{6}$/u, 'Ingresa el código de seis dígitos.'),
});

export const managePublicBookingCancellationSchema = z.object({
  reason: z.string().trim().max(240).nullish(),
});

export const createAppointmentReviewSchema = z.object({
  comment: z.string().trim().max(1000).nullish(),
  rating: z.number().int().min(1).max(5),
});

export function createSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type AcceptTeamInvitationInput = z.infer<
  typeof acceptTeamInvitationSchema
>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type CreateAppointmentReviewInput = z.infer<
  typeof createAppointmentReviewSchema
>;
export type CreatePublicBookingInput = z.infer<
  typeof createPublicBookingSchema
>;
export type CreateOnboardingCollaboratorInput = z.infer<
  typeof createOnboardingCollaboratorSchema
>;
export type CreateOnboardingServiceInput = z.infer<
  typeof createOnboardingServiceSchema
>;
export type AssignProfessionalServiceInput = z.infer<
  typeof assignProfessionalServiceSchema
>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type CreateScheduleBlockInput = z.infer<
  typeof createScheduleBlockSchema
>;
export type CreateServiceCategoryInput = z.infer<
  typeof createServiceCategorySchema
>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type UpdateAccountTypeInput = z.infer<typeof updateAccountTypeSchema>;
export type CreateTeamInvitationInput = z.infer<
  typeof createTeamInvitationSchema
>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
export type UpdateMemberOnlineBookingInput = z.infer<
  typeof updateMemberOnlineBookingSchema
>;
export type DailyAppointmentsQuery = z.infer<
  typeof dailyAppointmentsQuerySchema
>;
export type LocationOnboardingInput = z.infer<typeof locationOnboardingSchema>;
export type OrganizationOnboardingInput = z.infer<
  typeof organizationOnboardingSchema
>;
export type PublicApiConfig = z.infer<typeof publicApiConfigSchema>;
export type RecoverAccessInput = z.infer<typeof recoverAccessSchema>;
export type RegistrationAvailabilityInput = z.infer<
  typeof registrationAvailabilitySchema
>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ReplaceWeeklySchedulesInput = z.infer<
  typeof replaceWeeklySchedulesSchema
>;
export type ReplaceBusinessScheduleInput = z.infer<
  typeof replaceBusinessScheduleSchema
>;
export type RescheduleAppointmentInput = z.infer<
  typeof rescheduleAppointmentSchema
>;
export type SignInInput = z.infer<typeof signInSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type CloseOwnedBusinessInput = z.infer<typeof closeOwnedBusinessSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type InvitationSignUpInput = z.infer<typeof invitationSignUpSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type UpdateOnboardingCollaboratorInput = z.infer<
  typeof updateOnboardingCollaboratorSchema
>;
export type UpdateOnboardingServiceInput = z.infer<
  typeof updateOnboardingServiceSchema
>;
export type UpdateBookingSettingsInput = z.infer<
  typeof updateBookingSettingsSchema
>;
export type VerifyPublicBookingInput = z.infer<
  typeof verifyPublicBookingSchema
>;
