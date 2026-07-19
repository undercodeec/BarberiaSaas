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
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type LocationOnboardingInput = z.infer<typeof locationOnboardingSchema>;
export type OrganizationOnboardingInput = z.infer<
  typeof organizationOnboardingSchema
>;
export type PublicApiConfig = z.infer<typeof publicApiConfigSchema>;
export type RecoverAccessInput = z.infer<typeof recoverAccessSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
