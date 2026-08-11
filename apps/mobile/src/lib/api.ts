import { createApiClient } from '@barber-saas/api-client';
import { publicApiConfigSchema } from '@barber-saas/validation';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'barber-saas.session-token';
const configResult = publicApiConfigSchema.safeParse({
  url: process.env.EXPO_PUBLIC_API_URL,
});

function usesWebStorage(): boolean {
  return Platform.OS === 'web';
}

export async function getStoredSessionToken(): Promise<string | null> {
  if (usesWebStorage()) return globalThis.localStorage.getItem(SESSION_TOKEN_KEY);
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function storeSessionToken(token: string): Promise<void> {
  if (usesWebStorage()) {
    globalThis.localStorage.setItem(SESSION_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionToken(): Promise<void> {
  if (usesWebStorage()) {
    globalThis.localStorage.removeItem(SESSION_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

export const apiClient = configResult.success
  ? createApiClient({
      baseUrl: configResult.data.url,
      getAccessToken: getStoredSessionToken,
      timeoutMs: 20_000,
    })
  : null;

export const apiConfigurationError = configResult.success
  ? null
  : 'Configura EXPO_PUBLIC_API_URL para conectar la aplicación con la API.';

export function requireApiClient() {
  if (!apiClient) {
    throw new Error(
      apiConfigurationError ?? 'La conexión con la API no está configurada.',
    );
  }
  return apiClient;
}
