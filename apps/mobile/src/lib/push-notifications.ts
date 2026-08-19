import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { requireApiClient } from './api';

export async function revokeCurrentDevicePushToken(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== Notifications.PermissionStatus.GRANTED)
      return false;

    const token = (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token !== 'string' || !token.trim()) return false;

    await requireApiClient().request(
      `/v1/push-tokens/${encodeURIComponent(token)}`,
      { method: 'DELETE' },
    );
    return true;
  } catch {
    // Revocar push es best-effort y nunca debe impedir el cierre local.
    return false;
  }
}
