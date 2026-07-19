import { describe, expect, it } from 'vitest';

import {
  appEnvironmentSchema,
  createSlug,
  locationOnboardingSchema,
  publicApiConfigSchema,
  signUpSchema,
} from './index';

describe('esquemas de entorno', () => {
  it('acepta un entorno soportado', () => {
    expect(appEnvironmentSchema.parse('local')).toBe('local');
  });

  it('rechaza una URL pública inválida', () => {
    expect(() => publicApiConfigSchema.parse({ url: 'incorrecta' })).toThrow();
  });
});

describe('autenticación y onboarding', () => {
  it('rechaza contraseñas distintas', () => {
    const result = signUpSchema.safeParse({
      confirmPassword: 'otra-clave',
      email: 'owner@example.com',
      fullName: 'Ana Dueña',
      password: 'clave-segura',
    });
    expect(result.success).toBe(false);
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
