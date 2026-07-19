import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { InlineMessage } from '../src/components/InlineMessage';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { useCurrentOrganization } from '../src/features/organization/useCurrentOrganization';
import { useAuth } from '../src/providers/AuthProvider';
import { theme } from '../src/theme';

export function WelcomeContent({
  onLogin,
  onRegister,
}: {
  readonly onLogin: () => void;
  readonly onRegister: () => void;
}) {
  return (
    <View style={styles.welcome}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>OPERACIÓN MÓVIL</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Tu barbería en la palma de tu mano.
      </Text>
      <Text style={styles.description}>
        Administra tu negocio desde el celular con una experiencia simple y
        segura.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label="Crear mi barbería" onPress={onRegister} />
        <PrimaryButton
          label="Ya tengo una cuenta"
          onPress={onLogin}
          variant="secondary"
        />
      </View>
    </View>
  );
}

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
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.loading}>Preparando tu espacio…</Text>
      </View>
    );
  }
  if (session && organizationQuery.isError) {
    return (
      <View style={styles.centered}>
        <InlineMessage message="No pudimos cargar tu barbería. Revisa tu conexión e inténtalo nuevamente." />
        <PrimaryButton
          label="Reintentar"
          onPress={() => void organizationQuery.refetch()}
        />
      </View>
    );
  }
  if (session && organizationQuery.data) return <Redirect href="/(app)" />;
  if (session) return <Redirect href="/(onboarding)/organization" />;
  return (
    <WelcomeContent
      onLogin={() => router.push('/(auth)/login')}
      onRegister={() => router.push('/(auth)/register')}
    />
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: 36 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    color: theme.colors.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  description: {
    color: theme.colors.muted,
    fontSize: 17,
    lineHeight: 27,
    marginTop: 20,
  },
  loading: { color: theme.colors.muted, marginTop: 14 },
  title: {
    color: theme.colors.text,
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 48,
    marginTop: 24,
  },
  welcome: {
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
});
