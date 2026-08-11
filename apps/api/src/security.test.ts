import { describe, expect, it } from 'vitest';

import {
  createOpaqueToken,
  decryptPaymentCredential,
  encryptPaymentCredential,
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
  it('cifra credenciales de pago y las liga a su organizacion', () => {
    const encodedKey = Buffer.alloc(32, 7).toString('base64');
    const organizationId = 'f025f4bd-e0dd-4b20-92a3-aa1158848c04';
    const encryptedToken = encryptPaymentCredential({
      encodedKey,
      organizationId,
      secret: 'payphone-token-secreto',
    });

    expect(encryptedToken).not.toContain('payphone-token-secreto');
    expect(
      decryptPaymentCredential({
        encodedKey,
        encryptedSecret: encryptedToken,
        organizationId,
      }),
    ).toBe('payphone-token-secreto');
    expect(() =>
      decryptPaymentCredential({
        encodedKey,
        encryptedSecret: encryptedToken,
        organizationId: 'e5cf4e5b-cbe8-40b5-aec9-aed5f3a201a8',
      }),
    ).toThrow();
  });
});
