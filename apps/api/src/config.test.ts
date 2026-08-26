import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

const baseEnvironment = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/database',
};

describe('configuración SMTP', () => {
  it('acepta las variables SMTP documentadas', () => {
    const config = readConfig({
      ...baseEnvironment,
      SMTP_FROM: 'equipo@example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
    });

    expect(config.SMTP_HOST).toBe('smtp.example.com');
    expect(config.SMTP_PORT).toBe(587);
    expect(config.SMTP_SECURE).toBe('false');
  });

  it('mantiene compatibilidad con las variables EMAIL existentes', () => {
    const config = readConfig({
      ...baseEnvironment,
      EMAIL_BUSINESS: 'equipo@example.com',
      EMAIL_HOST: 'smtp.example.com',
      EMAIL_PASSWORD: 'secret',
      EMAIL_PORT: '465',
      EMAIL_USER: 'equipo@example.com',
    });

    expect(config.SMTP_FROM).toBe('equipo@example.com');
    expect(config.SMTP_HOST).toBe('smtp.example.com');
    expect(config.SMTP_PORT).toBe(465);
    expect(config.SMTP_SECURE).toBe('true');
    expect(config.SMTP_USER).toBe('equipo@example.com');
  });
});

describe('configuración de cobros de plataforma', () => {
  const encryptionKey = Buffer.alloc(32, 3).toString('base64');

  it('mantiene el checkout deshabilitado por defecto', () => {
    expect(readConfig(baseEnvironment).PLATFORM_PAYMENTS_ENABLED).toBe('false');
  });

  it('exige clave aislada, impuestos y versión comercial al habilitarlo', () => {
    expect(() =>
      readConfig({ ...baseEnvironment, PLATFORM_PAYMENTS_ENABLED: 'true' }),
    ).toThrow();
    expect(() =>
      readConfig({
        ...baseEnvironment,
        PAYPHONE_CREDENTIALS_ENCRYPTION_KEY: encryptionKey,
        PLATFORM_PAYMENTS_ENABLED: 'true',
        PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY: encryptionKey,
        PLATFORM_PAYPHONE_WEBHOOK_ALLOWED_IPS: '203.0.113.10',
        PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS: '0',
        PLATFORM_SUBSCRIPTION_TERMS_VERSION: 'sandbox-v1',
      }),
    ).toThrow();

    const config = readConfig({
      ...baseEnvironment,
      PLATFORM_PAYMENTS_ENABLED: 'true',
      PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(
        32,
        4,
      ).toString('base64'),
      PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS: '1500',
      PLATFORM_SUBSCRIPTION_TERMS_VERSION: 'sandbox-v1',
    });
    expect(config.PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS).toBe(1500);
    expect(config.PLATFORM_PAYPHONE_WEBHOOK_ALLOWED_IPS).toBe('');
  });
});

describe('proxies confiables', () => {
  it('exige restringir los proxies fuera de desarrollo local', () => {
    expect(() =>
      readConfig({
        ...baseEnvironment,
        APP_ENV: 'production',
        API_TRUST_PROXY: 'true',
      }),
    ).toThrow('API_TRUSTED_PROXY_IPS');

    expect(
      readConfig({
        ...baseEnvironment,
        APP_ENV: 'staging',
        API_TRUST_PROXY: 'true',
        API_TRUSTED_PROXY_IPS: '203.0.113.10',
      }).API_TRUSTED_PROXY_IPS,
    ).toBe('203.0.113.10');
  });

  it('bloquea el bypass de desarrollo fuera de local', () => {
    expect(() =>
      readConfig({
        ...baseEnvironment,
        APP_ENV: 'staging',
        PLATFORM_DEVELOPMENT_BYPASS: 'true',
      }),
    ).toThrow('PLATFORM_DEVELOPMENT_BYPASS');
  });
});

describe('configuración de producción del panel', () => {
  const productionEnvironment = {
    ...baseEnvironment,
    APP_ENV: 'production',
    CORS_ORIGIN: 'https://admin.example.com',
    PLATFORM_ADMIN_EMAILS: 'operaciones@example.com',
    SMTP_FROM: 'equipo@example.com',
    SMTP_HOST: 'smtp.example.com',
  };

  it('requiere el costo scrypt vigente para la cuenta bootstrap', () => {
    expect(() =>
      readConfig({
        ...productionEnvironment,
        PLATFORM_ADMIN_PASSWORD_HASH:
          'scrypt$16384$8$1$CQkJCQkJCQkJCQkJCQkJCQ$4Rgs9_9vLvkmypy7oawyCRDNKT8nR2JiJn9UoYba9-kmNAlqETBfrVulIniQ_GVZJcs13sYzakrjgiJKgzHzCg',
      }),
    ).toThrow('scrypt$32768$8$1$');

    expect(
      readConfig({
        ...productionEnvironment,
        PLATFORM_ADMIN_PASSWORD_HASH:
          'scrypt$32768$8$1$CgoKCgoKCgoKCgoKCgoKCg$5NguO9ktJ7Y-6G9f5CVPg8vW6FFT2m96ghbdE4ThFyHx5UrjjKLKt_-SmEYu_2XldoTe0HI0JG649YRRRc_JhA',
      }).PLATFORM_ADMIN_PASSWORD_HASH,
    ).toMatch(/^scrypt\$32768\$8\$1\$/u);
  });

  it('solo admite orígenes HTTPS exactos para CORS', () => {
    expect(() =>
      readConfig({
        ...productionEnvironment,
        CORS_ORIGIN: 'http://admin.example.com',
        PLATFORM_ADMIN_PASSWORD_HASH:
          'scrypt$32768$8$1$CgoKCgoKCgoKCgoKCgoKCg$5NguO9ktJ7Y-6G9f5CVPg8vW6FFT2m96ghbdE4ThFyHx5UrjjKLKt_-SmEYu_2XldoTe0HI0JG649YRRRc_JhA',
      }),
    ).toThrow('CORS_ORIGIN');
  });
});

describe('configuración SRI', () => {
  it('mantiene SRI en pruebas y emisión deshabilitada por defecto', () => {
    const config = readConfig(baseEnvironment);
    expect(config.SRI_ENV).toBe('test');
    expect(config.SRI_EMISSION_ENABLED).toBe('false');
    expect(config.SRI_PRODUCTION_ENABLED).toBe('false');
  });

  it('impide habilitar emisión sin los secretos y datos fiscales requeridos', () => {
    expect(() =>
      readConfig({ ...baseEnvironment, SRI_EMISSION_ENABLED: 'true' }),
    ).toThrow();
    expect(() =>
      readConfig({ ...baseEnvironment, SRI_ENV: 'production' }),
    ).toThrow('SRI_PRODUCTION_ENABLED=true');
  });
});
