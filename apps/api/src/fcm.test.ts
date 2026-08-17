import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getAccessToken() {
      return 'access-token';
    }

    async getProjectId() {
      return 'p-key-by1efv8zycyb';
    }
  },
}));

import type { ApiConfig } from './config';
import { sendFcmNotifications } from './fcm';

const configWithoutFcm = {} as ApiConfig;
const configuredFcm = {
  FCM_PROJECT_ID: 'p-key-by1efv8zycyb',
  FCM_SERVICE_ACCOUNT_FILE: '/private/fcm-service-account.json',
} as ApiConfig;

afterEach(() => vi.unstubAllGlobals());

describe('envío directo por FCM', () => {
  it('no requiere configuración cuando no existen dispositivos registrados', async () => {
    await expect(
      sendFcmNotifications({
        body: 'Nueva reserva',
        config: configWithoutFcm,
        data: { route: '/agenda' },
        title: 'Reserva confirmada',
        tokens: [],
      }),
    ).resolves.toEqual({ delivered: 0, failed: 0 });
  });

  it('reporta un fallo cuando hay dispositivos pero falta la cuenta FCM', async () => {
    await expect(
      sendFcmNotifications({
        body: 'Nueva reserva',
        config: configWithoutFcm,
        data: { route: '/agenda' },
        title: 'Reserva confirmada',
        tokens: ['token-fcm-de-prueba'],
      }),
    ).rejects.toThrow('FCM no está configurado en el servidor.');
  });

  it('does not retry a device that already received a notification', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchImplementation);

    await expect(
      sendFcmNotifications({
        body: 'Nueva reserva',
        config: configuredFcm,
        data: { route: '/agenda' },
        title: 'Reserva confirmada',
        tokens: ['token-vigente', 'token-obsoleto'],
      }),
    ).resolves.toEqual({ delivered: 1, failed: 1 });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
