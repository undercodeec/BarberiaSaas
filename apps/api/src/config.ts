import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z
  .object({
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    APP_ENV: z
      .enum(['local', 'preview', 'staging', 'production'])
      .default('local'),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
    DATABASE_URL: z.url().startsWith('postgresql://'),
    MOBILE_INVITATION_URL: z
      .string()
      .min(1)
      .default('barbersaas://accept-invitation'),
    MOBILE_RESET_URL: z.string().min(1).default('barbersaas://reset-password'),
    SMTP_FROM: optionalText,
    SMTP_HOST: optionalText,
    SMTP_PASSWORD: optionalText,
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: optionalText,
  })
  .superRefine((value, context) => {
    if (
      value.APP_ENV === 'production' &&
      (!value.SMTP_FROM || !value.SMTP_HOST)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'SMTP_FROM y SMTP_HOST son obligatorios en producción.',
        path: ['SMTP_HOST'],
      });
    }
  });

export type ApiConfig = z.infer<typeof environmentSchema>;

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  return environmentSchema.parse({
    ...environment,
    SMTP_FROM:
      environment.SMTP_FROM ??
      environment.EMAIL_BUSINESS ??
      environment.EMAIL_USER,
    SMTP_HOST: environment.SMTP_HOST ?? environment.EMAIL_HOST,
    SMTP_PASSWORD: environment.SMTP_PASSWORD ?? environment.EMAIL_PASSWORD,
    SMTP_PORT: environment.SMTP_PORT ?? environment.EMAIL_PORT,
    SMTP_SECURE:
      environment.SMTP_SECURE ??
      (environment.EMAIL_PORT === '465' ? 'true' : undefined),
    SMTP_USER: environment.SMTP_USER ?? environment.EMAIL_USER,
  });
}
