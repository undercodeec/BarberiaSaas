import { ApiClientError } from '@barber-saas/api-client';

import {
  createSessionInvalidator,
  isSessionAuthenticationError,
  restoreStoredSession,
  sessionExpirationDelay,
} from './session-auth';

const sessionResponse = {
  session: { expiresAt: '2026-09-01T00:00:00.000Z' },
  user: { email: 'ana@example.com', fullName: 'Ana', id: 'user-1' },
};

describe('restoreStoredSession', () => {
  it('conserva el token ante errores de red y permite reintentar', async () => {
    const invalidateSession = jest.fn().mockResolvedValue(undefined);
    await expect(
      restoreStoredSession({
        getToken: jest.fn().mockResolvedValue('token-valido'),
        invalidateSession,
        requestSession: jest.fn().mockRejectedValue(new TypeError('offline')),
      }),
    ).resolves.toEqual({ status: 'offline-auth-unknown' });
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it('elimina únicamente una sesión inequívocamente inválida', async () => {
    const invalidateSession = jest.fn().mockResolvedValue(undefined);
    await expect(
      restoreStoredSession({
        getToken: jest.fn().mockResolvedValue('token-vencido'),
        invalidateSession,
        requestSession: jest
          .fn()
          .mockRejectedValue(
            new ApiClientError(401, 'INVALID_SESSION', 'Vencida'),
          ),
      }),
    ).resolves.toEqual({ status: 'unauthenticated' });
    expect(invalidateSession).toHaveBeenCalledTimes(1);
  });

  it('restaura una sesión válida', async () => {
    await expect(
      restoreStoredSession({
        getToken: jest.fn().mockResolvedValue('token-valido'),
        invalidateSession: jest.fn(),
        requestSession: jest.fn().mockResolvedValue(sessionResponse),
      }),
    ).resolves.toEqual({ response: sessionResponse, status: 'authenticated' });
  });
});

describe('invalidación global', () => {
  it('deduplica respuestas 401 concurrentes y limpia de forma atómica', async () => {
    const calls: string[] = [];
    const invalidator = createSessionInvalidator({
      clearCache: () => calls.push('cache'),
      clearToken: async () => {
        calls.push('token');
      },
      onInvalidated: () => calls.push('state'),
    });

    await Promise.all([
      invalidator.invalidate(),
      invalidator.invalidate(),
      invalidator.invalidate(),
    ]);
    expect(calls).toEqual(['token', 'cache', 'state']);
  });

  it('distingue permisos de negocio de fallos de sesión', () => {
    expect(
      isSessionAuthenticationError(
        new ApiClientError(403, 'FORBIDDEN', 'Sin permiso'),
      ),
    ).toBe(false);
    expect(
      isSessionAuthenticationError(
        new ApiClientError(403, 'SESSION_REVOKED', 'Revocada'),
      ),
    ).toBe(true);
  });

  it('calcula la expiración local con un margen de seguridad', () => {
    expect(
      sessionExpirationDelay(
        '2026-09-01T00:01:00.000Z',
        Date.parse('2026-09-01T00:00:00.000Z'),
      ),
    ).toBe(55_000);
    expect(
      sessionExpirationDelay(
        '2026-09-01T00:00:04.000Z',
        Date.parse('2026-09-01T00:00:00.000Z'),
      ),
    ).toBe(0);
    expect(sessionExpirationDelay('fecha-inválida')).toBe(0);
  });
});
