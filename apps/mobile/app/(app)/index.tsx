import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { useAuth } from '../../src/providers/AuthProvider';
import { theme } from '../../src/theme';

export default function ApplicationHomeScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const organizationQuery = useCurrentOrganization();

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!organizationQuery.isLoading && !organizationQuery.data)
    return <Redirect href="/(onboarding)/organization" />;

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <Screen
      description="Tu espacio de operación ya está conectado."
      title="Inicio"
    >
      {organizationQuery.isError ? (
        <InlineMessage message="No pudimos actualizar la información. Inténtalo nuevamente." />
      ) : null}
      {organizationQuery.data ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>BARBERÍA ACTIVA</Text>
          <Text style={styles.name}>
            {organizationQuery.data.organization.name}
          </Text>
          <Text style={styles.detail}>
            {organizationQuery.data.location?.name ?? 'Sin sucursal'} ·{' '}
            {organizationQuery.data.membership.role}
          </Text>
          <Text style={styles.detail}>
            {organizationQuery.data.location?.timezone} ·{' '}
            {organizationQuery.data.organization.currencyCode}
          </Text>
        </View>
      ) : (
        <Text style={styles.detail}>Cargando organización…</Text>
      )}
      <PrimaryButton
        label="Actualizar"
        loading={organizationQuery.isRefetching}
        onPress={() => void organizationQuery.refetch()}
        variant="secondary"
      />
      <PrimaryButton
        label="Cerrar sesión"
        onPress={() => void handleSignOut()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 24,
    padding: 22,
  },
  detail: { color: theme.colors.muted, fontSize: 15, marginTop: 7 },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  name: {
    color: theme.colors.text,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 12,
  },
});
