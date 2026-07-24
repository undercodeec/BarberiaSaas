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
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  apiConfigurationError,
  clearSessionToken,
  getStoredSessionToken,
  requireApiClient,
  storeSessionToken,
} from '../lib/api';

interface AuthContextValue {
  readonly configurationError: string | null;
  readonly isLoading: boolean;
  readonly session: { readonly expiresAt: string } | null;
  readonly signIn: (input: SignInInput) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly signUp: (input: SignUpInput) => Promise<RegistrationResponse>;
  readonly resendVerification: (
    email: string,
  ) => Promise<ResendVerificationResponse>;
  readonly verifyEmail: (input: VerifyEmailInput) => Promise<void>;
  readonly user: AuthenticatedUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<{ expiresAt: string } | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        if (!(await getStoredSessionToken())) return;
        const response =
          await requireApiClient().request<SessionResponse>('/v1/auth/session');
        setSession(response.session);
        setUser(response.user);
      } catch {
        await clearSessionToken();
      } finally {
        setIsLoading(false);
      }
    };
    void restoreSession();
  }, []);

  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    await storeSessionToken(response.session.token);
    setSession({ expiresAt: response.session.expiresAt });
    setUser(response.user);
  }, []);

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
    try {
      await requireApiClient().request<void>('/v1/auth/logout', {
        method: 'POST',
      });
    } finally {
      await clearSessionToken();
      setSession(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configurationError: apiConfigurationError,
      isLoading,
      session,
      resendVerification,
      signIn,
      signOut,
      signUp,
      user,
      verifyEmail,
    }),
    [
      isLoading,
      resendVerification,
      session,
      signIn,
      signOut,
      signUp,
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
