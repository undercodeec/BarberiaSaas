import { GoogleAuth } from 'google-auth-library';

import type { ApiConfig } from './config';

export interface FcmDeliveryResult {
  readonly delivered: number;
  readonly failed: number;
}

export async function sendFcmNotifications({
  body,
  config,
  data,
  sound = 'default',
  title,
  tokens,
}: {
  readonly body: string;
  readonly config: ApiConfig;
  readonly data: Record<string, string | undefined>;
  readonly sound?: 'default' | 'cash_income';
  readonly title: string;
  readonly tokens: readonly string[];
}): Promise<FcmDeliveryResult> {
  if (!tokens.length) return { delivered: 0, failed: 0 };
  if (!config.FCM_SERVICE_ACCOUNT_FILE)
    throw new Error('FCM no está configurado en el servidor.');
  const auth = new GoogleAuth({
    keyFile: config.FCM_SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const [accessToken, projectId] = await Promise.all([
    auth.getAccessToken(),
    config.FCM_PROJECT_ID
      ? Promise.resolve(config.FCM_PROJECT_ID)
      : auth.getProjectId(),
  ]);
  if (!accessToken || !projectId) throw new Error('No se pudo autorizar FCM.');
  const payloadData = Object.fromEntries(
    Object.entries(data).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        {
          body: JSON.stringify({
            message: {
              android: {
                notification: {
                  channel_id:
                    sound === 'cash_income' ? 'cash-income' : 'appointments',
                  sound: sound === 'cash_income' ? 'cash_income' : 'default',
                },
                priority: 'high',
              },
              ...(sound === 'cash_income'
                ? { apns: { payload: { aps: { sound: 'cash_income.wav' } } } }
                : {}),
              data: payloadData,
              notification: { body, title },
              token,
            },
          }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );
      if (!response.ok)
        throw new Error(`FCM rechazó el envío (${response.status}).`);
    }),
  );
  const delivered = results.filter(
    (result) => result.status === 'fulfilled',
  ).length;
  if (!delivered)
    throw new Error('FCM no pudo entregar una o más notificaciones.');
  return { delivered, failed: results.length - delivered };
}
