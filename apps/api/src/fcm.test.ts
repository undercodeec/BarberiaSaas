import { describe, expect, it } from 'vitest';

import type { ApiConfig } from './config';
import { sendFcmNotifications } from './fcm';

const configWithoutFcm = {} as ApiConfig;

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
    ).resolves.toBeUndefined();
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
});
