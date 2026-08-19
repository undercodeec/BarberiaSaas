import { ApiClientError } from '@barber-saas/api-client';
import type { SessionResponse } from '@barber-saas/api-client';

export type AuthStatus =
  'authenticated' | 'offline-auth-unknown' | 'restoring' | 'unauthenticated';

const SESSION_AUTH_FAILURE_CODES = new Set([
  'INVALID_SESSION',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'UNAUTHENTICATED',
]);

export function isSessionAuthenticationError(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.statusCode === 401 || error.statusCode === 403) &&
    SESSION_AUTH_FAILURE_CODES.has(error.code)
  );
}

export function sessionExpirationDelay(
  expiresAt: string,
  now = Date.now(),
  marginMs = 5_000,
): number {
  const expirationTime = Date.parse(expiresAt);
  if (!Number.isFinite(expirationTime)) return 0;
  return Math.max(0, expirationTime - now - marginMs);
}

export type SessionRestoreResult =
  | { readonly status: 'authenticated'; readonly response: SessionResponse }
  | { readonly status: 'offline-auth-unknown' }
  | { readonly status: 'unauthenticated' };

export async function restoreStoredSession(input: {
  readonly getToken: () => Promise<string | null>;
  readonly invalidateSession: () => Promise<void>;
  readonly requestSession: () => Promise<SessionResponse>;
}): Promise<SessionRestoreResult> {
  let token: string | null;
  try {
    token = await input.getToken();
  } catch {
    return { status: 'offline-auth-unknown' };
  }
  if (!token) return { status: 'unauthenticated' };

  try {
    return {
      response: await input.requestSession(),
      status: 'authenticated',
    };
  } catch (error) {
    if (isSessionAuthenticationError(error)) {
      await input.invalidateSession();
      return { status: 'unauthenticated' };
    }
    return { status: 'offline-auth-unknown' };
  }
}

export function createSessionInvalidator(input: {
  readonly clearCache: () => void;
  readonly clearToken: () => Promise<void>;
  readonly onInvalidated: () => void;
}) {
  let invalidated = false;
  let inFlight: Promise<void> | null = null;

  return {
    invalidate() {
      if (invalidated) return Promise.resolve();
      if (inFlight) return inFlight;

      inFlight = (async () => {
        await input.clearToken().catch(() => undefined);
        input.clearCache();
        input.onInvalidated();
        invalidated = true;
      })().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    reset() {
      invalidated = false;
    },
  };
}
