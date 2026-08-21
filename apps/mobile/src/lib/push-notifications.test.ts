import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { requireApiClient } from './api';
import { revokeCurrentDevicePushToken } from './push-notifications';

jest.mock('expo-notifications', () => ({
  getDevicePushTokenAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  PermissionStatus: { GRANTED: 'granted' },
}));
jest.mock('./api', () => ({ requireApiClient: jest.fn() }));

const getPermissionsAsync = jest.mocked(Notifications.getPermissionsAsync);
const getDevicePushTokenAsync = jest.mocked(
  Notifications.getDevicePushTokenAsync,
);
const requireClient = jest.mocked(requireApiClient);

describe('revokeCurrentDevicePushToken', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('revoca el token codificado antes del logout', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    getDevicePushTokenAsync.mockResolvedValue({
      data: 'token:device/value',
    } as never);
    requireClient.mockReturnValue({ request } as never);

    await expect(revokeCurrentDevicePushToken()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      '/v1/push-tokens/token%3Adevice%2Fvalue',
      { method: 'DELETE' },
    );
  });

  it('no solicita token si el permiso no esta concedido', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);

    await expect(revokeCurrentDevicePushToken()).resolves.toBe(false);
    expect(getDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('no bloquea el logout cuando la revocacion falla', async () => {
    getPermissionsAsync.mockRejectedValue(new Error('native unavailable'));

    await expect(revokeCurrentDevicePushToken()).resolves.toBe(false);
  });
});
