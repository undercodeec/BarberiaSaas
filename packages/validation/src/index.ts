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

const emailSchema = z.email('Ingresa un correo electrónico válido.').max(254);
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72);
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

export const signUpSchema = z
  .object({
    confirmPassword: passwordSchema,
    email: emailSchema,
    fullName: z.string().trim().min(2, 'Ingresa tu nombre completo.').max(120),
    password: passwordSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export const verifyEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Ingresa el código de 6 dígitos.'),
  email: emailSchema,
});

export const resendVerificationSchema = z.object({ email: emailSchema });

export const recoverAccessSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  password: passwordSchema,
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
  timezone: z.string().refine(
    (timezone) => {
      try {
        new Intl.DateTimeFormat('es', { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'La zona horaria no es válida.' },
  ),
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
  email: emailSchema,
  fullName: z
    .string()
    .trim()
    .min(2, 'Ingresa el nombre del integrante.')
    .max(120),
  locationId: uuidSchema,
  role: z.enum(['manager', 'receptionist', 'barber']),
});

export const acceptTeamInvitationSchema = z.object({
  token: z.string().min(32, 'La invitación no es válida.'),
});

export const createServiceCategorySchema = z.object({
  name: z.string().trim().min(2, 'Ingresa el nombre de la categoría.').max(80),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const createServiceSchema = z.object({
  categoryId: uuidSchema.nullish(),
  description: z.string().trim().max(500).nullish(),
  durationMinutes: durationMinutesSchema,
  name: z.string().trim().min(2, 'Ingresa el nombre del servicio.').max(120),
  priceCents: z.number().int().min(0, 'El precio no puede ser negativo.'),
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
    .pipe(z.array(uuidSchema).min(1).max(10)),
});

export const dailyAppointmentsQuerySchema = z.object({
  date: localDateSchema,
  locationId: uuidSchema,
  membershipId: uuidSchema.optional(),
});

export const appointmentEventsQuerySchema = z.object({
  after: z.string().regex(/^\d+$/u).default('0'),
});

export const createAppointmentSchema = z.object({
  clientEmail: z.union([emailSchema, z.literal('')]).nullish(),
  clientName: z
    .string()
    .trim()
    .min(2, 'Ingresa el nombre del cliente.')
    .max(120),
  clientPhone: z.string().trim().min(7).max(24).nullish(),
  locationId: uuidSchema,
  notes: z.string().trim().max(500).nullish(),
  professionalMembershipId: uuidSchema,
  serviceIds: z
    .array(uuidSchema)
    .min(1, 'Selecciona al menos un servicio.')
    .max(10),
  startsAt: z.iso.datetime(),
});

export const rescheduleAppointmentSchema = z.object({
  startsAt: z.iso.datetime(),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().min(2, 'Indica el motivo de cancelación.').max(240),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum([
    'confirmed',
    'checked_in',
    'in_progress',
    'completed',
    'no_show',
  ]),
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
export type CreateTeamInvitationInput = z.infer<
  typeof createTeamInvitationSchema
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
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ReplaceWeeklySchedulesInput = z.infer<
  typeof replaceWeeklySchedulesSchema
>;
export type RescheduleAppointmentInput = z.infer<
  typeof rescheduleAppointmentSchema
>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
