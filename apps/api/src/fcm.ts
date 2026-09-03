import { GoogleAuth } from 'google-auth-library';

import type { ApiConfig } from './config';

export interface FcmDeliveryResult {
  readonly delivered: number;
  readonly failed: number;
}

export interface PushDevice {
  readonly platform: string;
  readonly token: string;
}

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

export function isExpoPushToken(token: string): boolean {
  return /^(?:Expo|Exponent)PushToken\[[^\]]+\]$/u.test(token);
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

export async function sendExpoPushNotifications({
  body,
  data,
  sound = 'default',
  title,
  tokens,
}: {
  readonly body: string;
  readonly data: Record<string, string | undefined>;
  readonly sound?: 'default' | 'cash_income';
  readonly title: string;
  readonly tokens: readonly string[];
}): Promise<FcmDeliveryResult> {
  if (!tokens.length) return { delivered: 0, failed: 0 };
  const payloadData = Object.fromEntries(
    Object.entries(data).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  let delivered = 0;
  let failed = 0;

  for (let offset = 0; offset < tokens.length; offset += EXPO_BATCH_SIZE) {
    const batch = tokens.slice(offset, offset + EXPO_BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      body: JSON.stringify(
        batch.map((to) => ({
          body,
          data: payloadData,
          sound: sound === 'cash_income' ? 'cash_income.wav' : 'default',
          title,
          to,
        })),
      ),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`Expo rechazó el envío push (${response.status}).`);
    }
    const result = (await response.json()) as {
      data?: readonly { status?: 'error' | 'ok' }[];
    };
    if (!Array.isArray(result.data) || result.data.length !== batch.length) {
      throw new Error('Expo devolvió una respuesta push incompleta.');
    }
    const batchDelivered = result.data.filter(
      (ticket) => ticket.status === 'ok',
    ).length;
    delivered += batchDelivered;
    failed += batch.length - batchDelivered;
  }

  if (!delivered) throw new Error('Expo no pudo entregar las notificaciones.');
  return { delivered, failed };
}

export async function sendPushNotifications({
  body,
  config,
  data,
  devices,
  sound = 'default',
  title,
}: {
  readonly body: string;
  readonly config: ApiConfig;
  readonly data: Record<string, string | undefined>;
  readonly devices: readonly PushDevice[];
  readonly sound?: 'default' | 'cash_income';
  readonly title: string;
}): Promise<FcmDeliveryResult> {
  if (!devices.length) return { delivered: 0, failed: 0 };
  const androidTokens = devices
    .filter(({ platform }) => platform === 'android')
    .map(({ token }) => token);
  const iosTokens = devices
    .filter(
      ({ platform, token }) => platform === 'ios' && isExpoPushToken(token),
    )
    .map(({ token }) => token);
  const unsupported = devices.length - androidTokens.length - iosTokens.length;
  const jobs = [
    ...(androidTokens.length
      ? [
          {
            count: androidTokens.length,
            promise: sendFcmNotifications({
              body,
              config,
              data,
              sound,
              title,
              tokens: androidTokens,
            }),
          },
        ]
      : []),
    ...(iosTokens.length
      ? [
          {
            count: iosTokens.length,
            promise: sendExpoPushNotifications({
              body,
              data,
              sound,
              title,
              tokens: iosTokens,
            }),
          },
        ]
      : []),
  ];
  const results = await Promise.allSettled(jobs.map(({ promise }) => promise));
  let delivered = 0;
  let failed = unsupported;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      delivered += result.value.delivered;
      failed += result.value.failed;
    } else {
      failed += jobs[index]?.count ?? 0;
    }
  });
  if (!delivered)
    throw new Error('No se pudo entregar ninguna notificación push.');
  return { delivered, failed };
}
