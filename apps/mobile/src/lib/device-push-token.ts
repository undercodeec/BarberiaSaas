import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface DevicePushRegistration {
  readonly platform: 'android' | 'ios';
  readonly token: string;
}

function expoProjectId(): string {
  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
      ?.projectId;
  if (!projectId) {
    throw new Error('No se pudo resolver el projectId de EAS para push iOS.');
  }
  return projectId;
}

export async function getCurrentDevicePushRegistration(): Promise<DevicePushRegistration | null> {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'ios') {
    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId() })
    ).data;
    if (!token.trim()) throw new Error('Expo no devolvió un token push iOS.');
    return { platform: 'ios', token };
  }

  const token = (await Notifications.getDevicePushTokenAsync()).data;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('El dispositivo no devolvió un token push Android.');
  }
  return { platform: 'android', token };
}
