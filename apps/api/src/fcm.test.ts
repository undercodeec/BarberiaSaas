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
import {
  isExpoPushToken,
  sendExpoPushNotifications,
  sendFcmNotifications,
  sendPushNotifications,
} from './fcm';

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

  it('usa el canal y sonido de ingreso solo para los avisos financieros Android', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImplementation);

    await sendFcmNotifications({
      body: 'Ingreso registrado',
      config: configuredFcm,
      data: { type: 'cash_income_recorded' },
      sound: 'cash_income',
      title: 'Nuevo ingreso en Caja',
      tokens: ['token-vigente'],
    });

    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(request?.body).toBeDefined();
    expect(JSON.parse(String(request?.body))).toMatchObject({
      message: {
        android: {
          notification: {
            channel_id: 'cash-income',
            sound: 'cash_income',
          },
        },
      },
    });
  });
});

describe('envío push multiplataforma', () => {
  it('reconoce únicamente tokens de Expo válidos', () => {
    expect(isExpoPushToken('ExponentPushToken[token-ios]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[token-ios]')).toBe(true);
    expect(isExpoPushToken('token-apns-nativo')).toBe(false);
  });

  it('envía tokens iOS mediante Expo con el sonido correcto', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchImplementation);

    await expect(
      sendExpoPushNotifications({
        body: 'Ingreso registrado',
        data: { route: '/cash-register' },
        sound: 'cash_income',
        title: 'Nuevo ingreso',
        tokens: ['ExponentPushToken[token-ios]'],
      }),
    ).resolves.toEqual({ delivered: 1, failed: 0 });

    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      'https://exp.host/--/api/v2/push/send',
    );
    expect(
      JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)),
    ).toEqual([
      expect.objectContaining({
        sound: 'cash_income.wav',
        to: 'ExponentPushToken[token-ios]',
      }),
    ]);
  });

  it('no envía un token APNs nativo por FCM', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchImplementation);

    await expect(
      sendPushNotifications({
        body: 'Nueva reserva',
        config: configuredFcm,
        data: { route: '/agenda' },
        devices: [{ platform: 'ios', token: 'token-apns-nativo-largo' }],
        title: 'Reserva confirmada',
      }),
    ).rejects.toThrow('No se pudo entregar ninguna notificación push.');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
