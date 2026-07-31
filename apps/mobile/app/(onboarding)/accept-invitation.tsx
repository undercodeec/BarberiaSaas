import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function AcceptInvitationScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  const continueWithInvitation = async () => {
    if (!token) return;
    setError(null);
    setIsAccepting(true);
    try {
      await requireApiClient().request('/v1/team/invitations/accept', {
        body: { token },
        method: 'POST',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['current-organization'] }),
        queryClient.invalidateQueries({
          queryKey: ['onboarding-account-details'],
        }),
        queryClient.invalidateQueries({ queryKey: ['team'] }),
      ]);
      router.replace('/dashboard');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible aceptar la invitación.',
      );
    } finally {
      setIsAccepting(false);
    }
  };

  if (!token) {
    return (
      <Screen>
        <Text accessibilityRole="header" style={styles.title}>
          Enlace no válido
        </Text>
        <Text style={styles.description}>
          Solicita una nueva invitación al propietario del negocio.
        </Text>
        <Action label="Ir al inicio" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <Text accessibilityRole="header" style={styles.title}>
          Únete al equipo
        </Text>
        <Text style={styles.description}>
          Inicia sesión o crea tu cuenta con el mismo correo que recibió la
          invitación. Después activaremos tu acceso al negocio.
        </Text>
        <Action
          label="Iniciar sesión"
          onPress={() =>
            router.replace({
              params: { inviteToken: token },
              pathname: '/(auth)/login',
            })
          }
        />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.replace({
              params: { inviteToken: token },
              pathname: '/(auth)/register',
            })
          }
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionLabel}>Crear cuenta</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Invitación al equipo
      </Text>
      <Text style={styles.description}>
        Confirma para activar tu acceso. Si eres profesional, tu comisión
        inicial se aplicará desde este momento.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Action
        disabled={isAccepting}
        label={isAccepting ? 'Aceptando…' : 'Aceptar invitación'}
        onPress={() => void continueWithInvitation()}
      />
      {isAccepting ? (
        <ActivityIndicator color="#101c2d" style={styles.loader} />
      ) : null}
    </Screen>
  );
}

function Screen({ children }: { readonly children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>{children}</View>
    </SafeAreaView>
  );
}

function Action({
  disabled = false,
  label,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled ? styles.disabled : null]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: '#101c2d',
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 54,
  },
  actionLabel: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  card: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d9dde3',
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 460,
    padding: 26,
    width: '100%',
  },
  description: {
    color: '#667080',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  disabled: { opacity: 0.6 },
  error: {
    backgroundColor: '#fff0ee',
    borderRadius: 12,
    color: '#a72d27',
    marginTop: 18,
    padding: 12,
  },
  loader: { marginTop: 16 },
  screen: {
    alignItems: 'center',
    backgroundColor: '#f4f4f3',
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: '#101c2d',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 54,
  },
  secondaryActionLabel: { color: '#101c2d', fontSize: 16, fontWeight: '900' },
  title: { color: '#101c2d', fontSize: 27, fontWeight: '900' },
});
