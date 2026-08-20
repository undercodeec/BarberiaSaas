import {
  type ApiClient,
  type ApiClientError,
  type ApiRequestOptions,
  createApiClient,
} from '@barber-saas/api-client';
import { publicApiConfigSchema } from '@barber-saas/validation';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { validateMobileApiResponse } from './runtime-responses';

const SESSION_TOKEN_KEY = 'barber-saas.session-token';
const configResult = publicApiConfigSchema.safeParse({
  url: process.env.EXPO_PUBLIC_API_URL,
});

type AuthenticationFailureHandler = (
  error: ApiClientError,
) => Promise<void> | void;
let authenticationFailureHandler: AuthenticationFailureHandler | null = null;

function usesWebStorage(): boolean {
  return Platform.OS === 'web';
}

export async function getStoredSessionToken(): Promise<string | null> {
  if (usesWebStorage())
    return globalThis.localStorage.getItem(SESSION_TOKEN_KEY);
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

const rawApiClient = configResult.success
  ? createApiClient({
      baseUrl: configResult.data.url,
      getAccessToken: getStoredSessionToken,
      onAuthenticationFailure: (error) => authenticationFailureHandler?.(error),
      timeoutMs: 20_000,
    })
  : null;

export const apiClient: ApiClient | null = rawApiClient
  ? {
      async request<TResponse>(
        path: string,
        options?: ApiRequestOptions,
      ): Promise<TResponse> {
        const payload = await rawApiClient.request<unknown>(path, options);
        return validateMobileApiResponse(path, payload) as TResponse;
      },
    }
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

export function setApiAuthenticationFailureHandler(
  handler: AuthenticationFailureHandler,
) {
  authenticationFailureHandler = handler;
  return () => {
    if (authenticationFailureHandler === handler)
      authenticationFailureHandler = null;
  };
}
