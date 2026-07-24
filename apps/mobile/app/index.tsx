import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { InlineMessage } from '../src/components/InlineMessage';
import { NavaWelcomeScreen } from '../src/components/NavaWelcomeScreen';
import { useCurrentOrganization } from '../src/features/organization/useCurrentOrganization';
import { useAuth } from '../src/providers/AuthProvider';

export default function EntryScreen() {
  const router = useRouter();
  const { configurationError, isLoading, session } = useAuth();
  const organizationQuery = useCurrentOrganization();

  if (configurationError) {
    return (
      <View style={styles.centered}>
        <InlineMessage message={configurationError} />
      </View>
    );
  }
  if (isLoading || (session && organizationQuery.isLoading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#101c2d" size="large" />
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
  if (session && organizationQuery.data) return <Redirect href="/(app)" />;
  if (session) return <Redirect href="/(onboarding)/organization" />;
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
