import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { InlineMessage } from '../src/components/InlineMessage';
import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../src/components/BottomNavigation';
import { NavaWelcomeScreen } from '../src/components/NavaWelcomeScreen';
import { requireApiClient } from '../src/lib/api';
import { accountQueryKey } from '../src/lib/query-keys';
import { useCurrentOrganization } from '../src/features/organization/useCurrentOrganization';
import { useAuth } from '../src/providers/AuthProvider';

export default function EntryScreen() {
  const router = useRouter();
  const { configurationError, isLoading, session, user } = useAuth();
  const organizationQuery = useCurrentOrganization();
  const onboardingQuery = useQuery({
    enabled: Boolean(session && !organizationQuery.data),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  if (configurationError) {
    return (
      <View style={styles.centered}>
        <InlineMessage message={configurationError} />
      </View>
    );
  }
  if (
    isLoading ||
    (session && (organizationQuery.isLoading || onboardingQuery.isLoading))
  ) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={appTheme.colors.accent} size="large" />
        <Text style={styles.loading}>Preparando tu espacio…</Text>
      </View>
    );
  }
  if (session && organizationQuery.isError) {
    return (
      <View style={styles.centered}>
        <InlineMessage message="No pudimos cargar tu barbería. Revisa tu conexión e inténtalo nuevamente." />
        <Pressable
          accessibilityRole="button"
          onPress={() => void organizationQuery.refetch()}
          style={styles.retryButton}
        >
          <Text style={styles.retryLabel}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  if (session && organizationQuery.data) return <Redirect href="/dashboard" />;
  if (session && onboardingQuery.data?.onboardingCompletedAt)
    return <Redirect href={'/dashboard' as never} />;
  if (session) return <Redirect href="/(onboarding)/account-setup" />;
  return (
    <NavaWelcomeScreen
      onLogin={() => router.push('/(auth)/login')}
      onRegister={() => router.push('/(auth)/register')}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    ...appStyles.screen,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loading: {
    color: appTheme.colors.textMuted,
    marginTop: 14,
  },
  retryButton: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 0,
    marginTop: 18,
    paddingHorizontal: 28,
    paddingVertical: 15,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  retryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '800',
  },
});
