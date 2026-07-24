import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function AcceptInvitationScreen() {
  const router = useRouter();
  const { token: invitationToken } = useLocalSearchParams<{ token?: string }>();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [token, setToken] = useState(invitationToken ?? '');

  const acceptance = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/team/invitations/accept', {
        body: { token: token.trim() },
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['current-organization'],
      });
      router.replace('/(app)');
    },
  });

  if (!session) {
    return (
      <Redirect
        href={{
          params: { invitationToken: token },
          pathname: '/(auth)/login',
        }}
      />
    );
  }

  return (
    <Screen
      description="Abre el enlace recibido por email o pega el token de la invitación."
      title="Aceptar invitación"
    >
      {acceptance.isError ? (
        <InlineMessage
          message={
            acceptance.error instanceof Error
              ? acceptance.error.message
              : 'No fue posible aceptar la invitación.'
          }
        />
      ) : null}
      <TextField
        autoCapitalize="none"
        label="Token de invitación"
        multiline
        onChangeText={setToken}
        value={token}
      />
      <PrimaryButton
        disabled={token.trim().length < 32}
        label="Aceptar invitación"
        loading={acceptance.isPending}
        onPress={() => acceptance.mutate()}
      />
      <PrimaryButton
        label="Volver"
        onPress={() => router.back()}
        variant="secondary"
      />
    </Screen>
  );
}
