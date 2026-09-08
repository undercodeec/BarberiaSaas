import { describe, expect, it } from 'vitest';

import {
  passwordValidationError,
  resetTokenFromSearch,
} from './reset-password-flow';

describe('flujo web de restablecimiento de contraseña', () => {
  it('acepta únicamente el token opaco incluido en la URL', () => {
    const token = 'x'.repeat(32);

    expect(resetTokenFromSearch(token)).toBe(token);
    expect(resetTokenFromSearch('barbersaas://reset-password')).toBeNull();
    expect(resetTokenFromSearch(null)).toBeNull();
  });

  it('valida la longitud y la confirmación de la nueva contraseña', () => {
    expect(passwordValidationError('corta', 'corta')).toBe(
      'La nueva contraseña debe tener al menos 12 caracteres.',
    );
    expect(passwordValidationError('Clave-segura-123', 'Otra-clave-123')).toBe(
      'Las contraseñas no coinciden.',
    );
    expect(passwordValidationError('Clave-segura-123', 'Clave-segura-123')).toBeNull();
  });
});
