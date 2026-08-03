import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AccountSetupWelcomeScreen } from '../../src/components/AccountSetupWelcomeScreen';
import {
  appStyles,
  appTheme,
} from '../../src/components/BottomNavigation';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function AccountSetupScreen() {
  const router = useRouter();
  const { isLoading: isLoadingSession, session, user } = useAuth();
  const organizationQuery = useCurrentOrganization();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });

  if (isLoadingSession || (session && organizationQuery.isLoading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={appTheme.colors.accent} size="large" />
        <Text style={styles.loading}>Comprobando tu configuración…</Text>
      </View>
    );
  }
  if (!session || !user) return <Redirect href="/(auth)/login" />;
  if (organizationQuery.data) return <Redirect href="/dashboard" />;

  return (
    <AccountSetupWelcomeScreen
      accountType={accountQuery.data?.accountType ?? 'professional'}
      fullName={user.fullName}
      onBack={() => router.replace('/')}
      onContinue={() => router.push('/(onboarding)/services')}
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
});
