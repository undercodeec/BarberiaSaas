import { createApiClient } from '@barber-saas/api-client';
import { publicApiConfigSchema } from '@barber-saas/validation';
import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'barber-saas.session-token';
const configResult = publicApiConfigSchema.safeParse({
  url: process.env.EXPO_PUBLIC_API_URL,
});

export async function getStoredSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function storeSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

export const apiClient = configResult.success
  ? createApiClient({
      baseUrl: configResult.data.url,
      getAccessToken: getStoredSessionToken,
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
