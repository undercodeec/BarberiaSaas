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
  });
});
