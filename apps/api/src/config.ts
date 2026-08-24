import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalBasisPoints = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().int().min(0).max(10_000).optional(),
);

const environmentSchema = z
  .object({
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    API_TRUST_PROXY: z.enum(['true', 'false']).default('false'),
    APP_ENV: z
      .enum(['local', 'preview', 'staging', 'production'])
      .default('local'),
    AUTH_IP_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(86_400)
      .default(900),
    AUTH_REGISTER_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(5),
    AUTH_RESEND_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(5),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
    DATABASE_URL: z.url().startsWith('postgresql://'),
    FCM_PROJECT_ID: optionalText,
    FCM_SERVICE_ACCOUNT_FILE: optionalText,
    GOOGLE_MAPS_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(60),
    GOOGLE_MAPS_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    GOOGLE_MAPS_SERVER_API_KEY: optionalText,
    MOBILE_INVITATION_URL: z
      .string()
      .min(1)
      .default('https://reservas.navacloud.app/accept-invitation'),
    MOBILE_RESET_URL: z.string().min(1).default('barbersaas://reset-password'),
    PLATFORM_ADMIN_EMAILS: z.string().default(''),
    PLATFORM_DEVELOPMENT_BYPASS: z.enum(['true', 'false']).default('false'),
    PLATFORM_ADMIN_PASSWORD_HASH: optionalText,
    PLATFORM_PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
    PLATFORM_FOUNDER_PROMOTION_CODE: optionalText,
    PLATFORM_MARKETING_POLICY_VERSION: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default('2026-08-23'),
    PLATFORM_PRIVACY_POLICY_VERSION: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default('2026-08-23'),
    PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY: optionalText,
    PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS: optionalBasisPoints,
    PLATFORM_SUBSCRIPTION_TERMS_VERSION: optionalText,
    SRI_AUTHORIZATION_DELAY_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(86_400)
      .default(15),
    SRI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(6),
    SRI_CERTIFICATE_PASSWORD: optionalText,
    SRI_CERTIFICATE_PATH: optionalText,
    SRI_EMISSION_ENABLED: z.enum(['true', 'false']).default('false'),
    SRI_ENV: z.enum(['test', 'production']).default('test'),
    SRI_ESTABLISHMENT_CODE: optionalText,
    SRI_ISSUER_LEGAL_NAME: optionalText,
    SRI_ISSUER_RUC: optionalText,
    SRI_ISSUER_TRADE_NAME: optionalText,
    SRI_MAIN_ADDRESS: optionalText,
    SRI_EMISSION_POINT_CODE: optionalText,
    SRI_ACCOUNTING_REQUIRED: z.enum(['SI', 'NO']).optional(),
    SRI_PAYMENT_METHOD_CODE: optionalText,
    SRI_PRODUCTION_ENABLED: z.enum(['true', 'false']).default('false'),
    SRI_TAX_BASIS_POINTS: optionalBasisPoints,
    SRI_TAX_CODE: optionalText,
    SRI_TAX_PERCENTAGE_CODE: optionalText,
    SRI_TAX_REGIME: z
      .enum(['GENERAL', 'RIMPE', 'RIMPE_NEGOCIO_POPULAR'])
      .default('GENERAL'),
    PAYPHONE_CREDENTIALS_ENCRYPTION_KEY: optionalText,
    PUBLIC_WEB_URL: z.url().default('https://book.nava.app'),
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
    if (
      value.APP_ENV === 'production' &&
      value.PLATFORM_ADMIN_EMAILS &&
      !value.PLATFORM_ADMIN_PASSWORD_HASH
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'PLATFORM_ADMIN_PASSWORD_HASH es obligatorio cuando el panel interno está habilitado en producción.',
        path: ['PLATFORM_ADMIN_PASSWORD_HASH'],
      });
    }
    if (
      value.PLATFORM_PAYMENTS_ENABLED === 'true' &&
      !value.PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY es obligatoria al habilitar cobros de plataforma.',
        path: ['PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY'],
      });
    }
    if (
      value.PLATFORM_PAYMENTS_ENABLED === 'true' &&
      value.PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS es obligatoria al habilitar cobros de plataforma.',
        path: ['PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS'],
      });
    }
    if (
      value.PLATFORM_PAYMENTS_ENABLED === 'true' &&
      !value.PLATFORM_SUBSCRIPTION_TERMS_VERSION
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'PLATFORM_SUBSCRIPTION_TERMS_VERSION es obligatoria al habilitar cobros de plataforma.',
        path: ['PLATFORM_SUBSCRIPTION_TERMS_VERSION'],
      });
    }
    if (
      value.PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY &&
      value.PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY ===
        value.PAYPHONE_CREDENTIALS_ENCRYPTION_KEY
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'La clave PayPhone de plataforma debe ser distinta de la clave usada para tenants.',
        path: ['PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY'],
      });
    }
    if (
      value.SRI_ENV === 'production' &&
      value.SRI_PRODUCTION_ENABLED !== 'true'
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'SRI_PRODUCTION_ENABLED=true es obligatorio para seleccionar SRI_ENV=production.',
        path: ['SRI_PRODUCTION_ENABLED'],
      });
    }
    if (value.SRI_EMISSION_ENABLED === 'true') {
      const required = [
        'SRI_CERTIFICATE_PASSWORD',
        'SRI_CERTIFICATE_PATH',
        'SRI_ESTABLISHMENT_CODE',
        'SRI_ISSUER_LEGAL_NAME',
        'SRI_ISSUER_RUC',
        'SRI_MAIN_ADDRESS',
        'SRI_EMISSION_POINT_CODE',
        'SRI_ACCOUNTING_REQUIRED',
        'SRI_PAYMENT_METHOD_CODE',
        'SRI_TAX_BASIS_POINTS',
        'SRI_TAX_CODE',
        'SRI_TAX_PERCENTAGE_CODE',
      ] as const;
      for (const field of required) {
        if (value[field] === undefined) {
          context.addIssue({
            code: 'custom',
            message: `${field} es obligatoria al habilitar emisión SRI.`,
            path: [field],
          });
        }
      }
    }
  });

export type ApiConfig = z.infer<typeof environmentSchema>;

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  return environmentSchema.parse({
    ...environment,
    PLATFORM_ADMIN_EMAILS:
      environment.PLATFORM_ADMIN_EMAILS ?? environment.ADMIN_EMAIL,
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
