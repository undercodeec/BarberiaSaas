import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isNetworkOnline } from '../lib/query-lifecycle';
import { AuthProvider } from './AuthProvider';
import { TenantScopeProvider } from './TenantScopeProvider';

function QueryLifecycleManager() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    focusManager.setEventListener((setFocused) => {
      setFocused(AppState.currentState === 'active');
      const subscription = AppState.addEventListener('change', (state) => {
        setFocused(state === 'active');
      });
      return () => subscription.remove();
    });
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => setOnline(isNetworkOnline(state))),
    );

    return () => {
      focusManager.setEventListener(() => undefined);
      focusManager.setFocused(undefined);
      onlineManager.setEventListener(() => undefined);
      onlineManager.setOnline(true);
    };
  }, []);

  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: 'online',
            refetchOnReconnect: true,
            refetchOnWindowFocus: true,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <QueryLifecycleManager />
        <AuthProvider>
          <TenantScopeProvider>{children}</TenantScopeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
