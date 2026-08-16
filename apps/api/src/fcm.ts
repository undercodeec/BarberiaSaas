import { GoogleAuth } from 'google-auth-library';

import type { ApiConfig } from './config';

export async function sendFcmNotifications({ body, config, data, title, tokens }: {
  readonly body: string;
  readonly config: ApiConfig;
  readonly data: Record<string, string | undefined>;
  readonly title: string;
  readonly tokens: readonly string[];
}): Promise<void> {
  if (!tokens.length || !config.FCM_SERVICE_ACCOUNT_FILE) return;
  const auth = new GoogleAuth({
    keyFile: config.FCM_SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const [accessToken, projectId] = await Promise.all([
    auth.getAccessToken(),
    config.FCM_PROJECT_ID ? Promise.resolve(config.FCM_PROJECT_ID) : auth.getProjectId(),
  ]);
  if (!accessToken || !projectId) throw new Error('No se pudo autorizar FCM.');
  const payloadData = Object.fromEntries(
    Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const results = await Promise.allSettled(tokens.map(async (token) => {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        body: JSON.stringify({
          message: {
            android: {
              notification: { channel_id: 'appointments', sound: 'default' },
              priority: 'high',
            },
            data: payloadData,
            notification: { body, title },
            token,
          },
        }),
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    if (!response.ok) throw new Error(`FCM rechazó el envío (${response.status}).`);
  }));
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('FCM no pudo entregar una o más notificaciones.');
}
