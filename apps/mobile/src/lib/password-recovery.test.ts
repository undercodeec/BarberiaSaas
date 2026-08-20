import type { ApiClient } from '@barber-saas/api-client';

import {
  normalizeResetToken,
  requestPasswordRecovery,
  resetPasswordFormSchema,
  submitNewPassword,
} from './password-recovery';

describe('password recovery', () => {
  const request = jest.fn();
  const client = { request } as unknown as ApiClient;

  beforeEach(() => request.mockReset());

  it('requests recovery without changing the non-enumerative response', async () => {
    const response = {
      message: 'Si la cuenta existe, recibirás un enlace.',
    };
    request.mockResolvedValue(response);

    await expect(
      requestPasswordRecovery(client, { email: 'persona@example.com' }),
    ).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith('/v1/auth/recover', {
      body: { email: 'persona@example.com' },
      method: 'POST',
    });
  });

  it('validates matching passwords before sending the reset token', async () => {
    const token = 'a'.repeat(32);
    expect(
      resetPasswordFormSchema.safeParse({
        confirmPassword: 'otra-clave',
        password: 'clave-segura',
        token,
      }).success,
    ).toBe(false);

    request.mockResolvedValue(undefined);
    await submitNewPassword(client, { password: 'clave-segura', token });
    expect(request).toHaveBeenCalledWith('/v1/auth/reset-password', {
      body: { password: 'clave-segura', token },
      method: 'POST',
    });
  });

  it('accepts only one normalized token from deep-link parameters', () => {
    expect(normalizeResetToken([' token-valido ', 'ignorado'])).toBe(
      'token-valido',
    );
    expect(normalizeResetToken(undefined)).toBe('');
  });
});
