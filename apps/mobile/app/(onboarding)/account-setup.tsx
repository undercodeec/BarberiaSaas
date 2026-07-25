import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AccountSetupWelcomeScreen } from '../../src/components/AccountSetupWelcomeScreen';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { useAuth } from '../../src/providers/AuthProvider';

export default function AccountSetupScreen() {
  const router = useRouter();
  const { isLoading: isLoadingSession, session, user } = useAuth();
  const organizationQuery = useCurrentOrganization();

  if (isLoadingSession || (session && organizationQuery.isLoading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#101c2d" size="large" />
        <Text style={styles.loading}>Comprobando tu configuración…</Text>
      </View>
    );
  }
  if (!session || !user) return <Redirect href="/(auth)/login" />;
  if (organizationQuery.data) return <Redirect href="/(app)" />;

  return (
    <AccountSetupWelcomeScreen
      fullName={user.fullName}
      onBack={() => router.replace('/')}
      onContinue={() => router.push('/(onboarding)/organization')}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: '#fcfcfb',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loading: {
    color: '#667080',
    marginTop: 14,
  },
});
