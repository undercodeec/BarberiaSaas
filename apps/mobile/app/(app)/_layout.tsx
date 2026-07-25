import { Redirect, Stack } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { InlineMessage } from '../../src/components/InlineMessage';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ApplicationLayout() {
  const { isLoading: isLoadingSession, session } = useAuth();
  const organizationQuery = useCurrentOrganization();

  if (isLoadingSession || (session && organizationQuery.isLoading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#101c2d" size="large" />
        <Text style={styles.loading}>Preparando tu espacio…</Text>
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;
  if (organizationQuery.isError) {
    return (
      <View style={styles.centered}>
        <InlineMessage message="No pudimos comprobar la configuración de tu cuenta. Revisa tu conexión e inténtalo nuevamente." />
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
  if (!organizationQuery.data) {
    return <Redirect href="/(onboarding)/account-setup" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
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
  retryButton: {
    backgroundColor: '#101c2d',
    borderRadius: 18,
    marginTop: 18,
    paddingHorizontal: 28,
    paddingVertical: 15,
  },
  retryLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
