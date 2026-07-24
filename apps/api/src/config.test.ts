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
