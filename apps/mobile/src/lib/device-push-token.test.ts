import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getCurrentDevicePushRegistration } from './device-push-token';

jest.mock('expo-notifications', () => ({
  getDevicePushTokenAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    easConfig: { projectId: '48601b21-85b7-4e00-92a5-75c361644bc2' },
  },
}));

const originalPlatform = Platform.OS;

afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: originalPlatform,
  });
  jest.clearAllMocks();
});

describe('getCurrentDevicePushRegistration', () => {
  it('registra un Expo Push Token para iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest
      .mocked(Notifications.getExpoPushTokenAsync)
      .mockResolvedValue({
        data: 'ExponentPushToken[token-ios]',
        type: 'expo',
      });

    await expect(getCurrentDevicePushRegistration()).resolves.toEqual({
      platform: 'ios',
      token: 'ExponentPushToken[token-ios]',
    });
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: '48601b21-85b7-4e00-92a5-75c361644bc2',
    });
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('mantiene el token nativo FCM para Android', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    jest
      .mocked(Notifications.getDevicePushTokenAsync)
      .mockResolvedValue({ data: 'token-fcm-android', type: 'fcm' });

    await expect(getCurrentDevicePushRegistration()).resolves.toEqual({
      platform: 'android',
      token: 'token-fcm-android',
    });
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});
