import { describe, expect, it } from 'vitest';

import {
  createOpaqueToken,
  createVerificationCode,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from './security';

describe('seguridad de credenciales', () => {
  it('verifica la contraseña correcta y rechaza otra', async () => {
    const hash = await hashPassword('Una-clave-segura-123');

    await expect(verifyPassword('Una-clave-segura-123', hash)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('clave-incorrecta', hash)).resolves.toBe(false);
    expect(hash).not.toContain('Una-clave-segura-123');
  });

  it('genera tokens impredecibles y solo persiste su huella', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).not.toBe(second);
    expect(hashOpaqueToken(first)).toHaveLength(64);
    expect(hashOpaqueToken(first)).not.toBe(first);
  });

  it('genera códigos numéricos de seis dígitos', () => {
    expect(createVerificationCode()).toMatch(/^\d{6}$/);
  });
});
