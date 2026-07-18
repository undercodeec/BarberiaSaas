import { describe, expect, it } from 'vitest';

import { appEnvironmentSchema, publicSupabaseConfigSchema } from './index';

describe('esquemas de entorno', () => {
  it('acepta un entorno soportado', () => {
    expect(appEnvironmentSchema.parse('local')).toBe('local');
  });

  it('rechaza una URL pública inválida', () => {
    expect(() =>
      publicSupabaseConfigSchema.parse({ anonKey: 'anon', url: 'incorrecta' }),
    ).toThrow();
  });
});
