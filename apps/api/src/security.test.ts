import { describe, expect, it } from 'vitest';

import {
  createOpaqueToken,
  decryptPaymentCredential,
  encryptPaymentCredential,
  createVerificationCode,
  decryptPlatformPaymentCredential,
  hashOpaqueToken,
  hashPassword,
  passwordHashNeedsUpgrade,
  encryptPlatformPaymentCredential,
  verifyPassword,
} from './security';

describe('seguridad de credenciales', () => {
  it('verifica la contraseña correcta y rechaza otra', async () => {
    const hash = await hashPassword('Una-clave-segura-123');

    await expect(verifyPassword('Una-clave-segura-123', hash)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('clave-incorrecta', hash)).resolves.toBe(false);
    expect(hash).toContain('scrypt$32768$8$1$');
    expect(passwordHashNeedsUpgrade(hash)).toBe(false);
    expect(hash).not.toContain('Una-clave-segura-123');
  });

  it('acepta hashes heredados y los identifica para actualización', async () => {
    const legacyHash =
      'scrypt$16384$8$1$CQkJCQkJCQkJCQkJCQkJCQ$4Rgs9_9vLvkmypy7oawyCRDNKT8nR2JiJn9UoYba9-kmNAlqETBfrVulIniQ_GVZJcs13sYzakrjgiJKgzHzCg';

    await expect(verifyPassword('Clave-segura-123', legacyHash)).resolves.toBe(
      true,
    );
    expect(passwordHashNeedsUpgrade(legacyHash)).toBe(true);
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

  it('aísla la credencial PayPhone de Nava de las credenciales de tenants', () => {
    const encodedKey = Buffer.alloc(32, 11).toString('base64');
    const encryptedToken = encryptPlatformPaymentCredential({
      encodedKey,
      secret: 'token-plataforma',
    });

    expect(encryptedToken).not.toContain('token-plataforma');
    expect(
      decryptPlatformPaymentCredential({
        encodedKey,
        encryptedSecret: encryptedToken,
      }),
    ).toBe('token-plataforma');
    expect(() =>
      decryptPaymentCredential({
        encodedKey,
        encryptedSecret: encryptedToken,
        organizationId: 'f025f4bd-e0dd-4b20-92a3-aa1158848c04',
      }),
    ).toThrow();
  });
});
