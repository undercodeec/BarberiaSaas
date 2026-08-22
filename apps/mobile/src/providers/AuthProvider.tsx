import type {
  AuthenticatedUser,
  AuthResponse,
  RegistrationResponse,
  ResendVerificationResponse,
  SessionResponse,
} from '@barber-saas/api-client';
import type {
  SignInInput,
  SignUpInput,
  VerifyEmailInput,
} from '@barber-saas/validation';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  apiConfigurationError,
  clearSessionToken,
  getStoredSessionToken,
  requireApiClient,
  setApiAuthenticationFailureHandler,
  storeSessionToken,
} from '../lib/api';
import { revokeCurrentDevicePushToken } from '../lib/push-notifications';
import {
  type AuthStatus,
  createSessionInvalidator,
  isSessionAuthenticationError,
  restoreStoredSession,
  sessionExpirationDelay,
} from '../lib/session-auth';
import { runSessionSignOut } from '../lib/session-sign-out';

interface AuthContextValue {
  readonly configurationError: string | null;
  readonly isLoading: boolean;
  readonly retrySessionRestore: () => Promise<void>;
  readonly session: { readonly expiresAt: string } | null;
  readonly signIn: (input: SignInInput) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly signUp: (input: SignUpInput) => Promise<RegistrationResponse>;
  readonly status: AuthStatus;
  readonly resendVerification: (
    email: string,
  ) => Promise<ResendVerificationResponse>;
  readonly verifyEmail: (input: VerifyEmailInput) => Promise<void>;
  readonly user: AuthenticatedUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<{ expiresAt: string } | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const restoreAttemptRef = useRef(0);
  const [sessionInvalidator] = useState(() =>
    createSessionInvalidator({
      clearCache: () => queryClient.clear(),
      clearToken: clearSessionToken,
      onInvalidated: () => {
        setSession(null);
        setStatus('unauthenticated');
        setUser(null);
      },
    }),
  );
  const invalidateSession = useCallback(() => {
    restoreAttemptRef.current += 1;
    return sessionInvalidator.invalidate();
  }, [sessionInvalidator]);

  const retrySessionRestore = useCallback(
    async (showLoading = true) => {
      const attempt = restoreAttemptRef.current + 1;
      restoreAttemptRef.current = attempt;
      if (showLoading) setStatus('restoring');

      const result = await restoreStoredSession({
        getToken: getStoredSessionToken,
        invalidateSession,
        requestSession: () =>
          requireApiClient().request<SessionResponse>('/v1/auth/session'),
      });
      if (restoreAttemptRef.current !== attempt) return;

      if (result.status === 'authenticated') {
        sessionInvalidator.reset();
        setSession(result.response.session);
        setStatus('authenticated');
        setUser(result.response.user);
        return;
      }
      setStatus(result.status);
    },
    [invalidateSession, sessionInvalidator],
  );

  useEffect(() => {
    return setApiAuthenticationFailureHandler((error) =>
      isSessionAuthenticationError(error) ? invalidateSession() : undefined,
    );
  }, [invalidateSession]);

  useEffect(() => {
    void Promise.resolve().then(() => retrySessionRestore(false));
    return () => {
      restoreAttemptRef.current += 1;
    };
  }, [retrySessionRestore]);

  const applyAuthResponse = useCallback(
    async (response: AuthResponse) => {
      await storeSessionToken(response.session.token);
      restoreAttemptRef.current += 1;
      sessionInvalidator.reset();
      setSession({ expiresAt: response.session.expiresAt });
      setStatus('authenticated');
      setUser(response.user);
    },
    [sessionInvalidator],
  );

  const signIn = useCallback(
    async (input: SignInInput) => {
      const response = await requireApiClient().request<AuthResponse>(
        '/v1/auth/login',
        { body: input, method: 'POST' },
      );
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const signUp = useCallback(async (input: SignUpInput) => {
    return requireApiClient().request<RegistrationResponse>(
      '/v1/auth/register',
      { body: input, method: 'POST' },
    );
  }, []);

  const verifyEmail = useCallback(
    async (input: VerifyEmailInput) => {
      const response = await requireApiClient().request<AuthResponse>(
        '/v1/auth/verify-email',
        { body: input, method: 'POST' },
      );
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const resendVerification = useCallback(async (email: string) => {
    return requireApiClient().request<ResendVerificationResponse>(
      '/v1/auth/resend-verification',
      { body: { email }, method: 'POST' },
    );
  }, []);

  const signOut = useCallback(async () => {
    await runSessionSignOut({
      clearLocalSession: invalidateSession,
      logoutFromApi: () =>
        requireApiClient().request<void>('/v1/auth/logout', {
          method: 'POST',
        }),
      revokePushToken: revokeCurrentDevicePushToken,
    });
  }, [invalidateSession]);

  useEffect(() => {
    if (!session || status !== 'authenticated') return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const scheduleExpiration = () => {
      if (cancelled) return;
      const remainingMs = sessionExpirationDelay(session.expiresAt);
      if (remainingMs <= 0) {
        void invalidateSession();
        return;
      }
      timer = setTimeout(
        scheduleExpiration,
        Math.min(remainingMs, 2_147_000_000),
      );
    };
    scheduleExpiration();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [invalidateSession, session, status]);

  const isLoading = status === 'restoring';

  const value = useMemo<AuthContextValue>(
    () => ({
      configurationError: apiConfigurationError,
      isLoading,
      retrySessionRestore,
      session,
      resendVerification,
      signIn,
      signOut,
      signUp,
      status,
      user,
      verifyEmail,
    }),
    [
      isLoading,
      retrySessionRestore,
      resendVerification,
      session,
      signIn,
      signOut,
      signUp,
      status,
      user,
      verifyEmail,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  return context;
}
