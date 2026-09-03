import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { requireApiClient } from './api';
import { getCurrentDevicePushRegistration } from './device-push-token';

export async function revokeCurrentDevicePushToken(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== Notifications.PermissionStatus.GRANTED)
      return false;

    const registration = await getCurrentDevicePushRegistration();
    if (!registration) return false;

    await requireApiClient().request(
      `/v1/push-tokens/${encodeURIComponent(registration.token)}`,
      { method: 'DELETE' },
    );
    return true;
  } catch {
    // Revocar push es best-effort y nunca debe impedir el cierre local.
    return false;
  }
}
