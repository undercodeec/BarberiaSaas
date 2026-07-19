import type { RecoverAccessResponse } from '@barber-saas/api-client';
import {
  type RecoverAccessInput,
  recoverAccessSchema,
} from '@barber-saas/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { requireApiClient } from '../../src/lib/api';

export default function RecoverAccessScreen() {
  const router = useRouter();
  const [message, setMessage] = useState<{
    text: string;
    tone: 'error' | 'success';
  } | null>(null);
  const { control, handleSubmit, formState } = useForm<RecoverAccessInput>({
    defaultValues: { email: '' },
    resolver: zodResolver(recoverAccessSchema),
  });

  const submit = handleSubmit(async (input) => {
    setMessage(null);
    try {
      const response = await requireApiClient().request<RecoverAccessResponse>(
        '/v1/auth/recover',
        { body: input, method: 'POST' },
      );
      if (response.developmentResetToken) {
        router.push({
          params: { token: response.developmentResetToken },
          pathname: '/(auth)/reset-password',
        });
        return;
      }
      setMessage({ text: response.message, tone: 'success' });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : 'No fue posible solicitar la recuperación.',
        tone: 'error',
      });
    }
  });

  return (
    <Screen
      description="Te enviaremos un enlace seguro para recuperar el acceso."
      title="Recuperar acceso"
    >
      {message ? (
        <InlineMessage message={message.text} tone={message.tone} />
      ) : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            error={fieldState.error?.message}
            keyboardType="email-address"
            label="Correo electrónico"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            value={field.value}
          />
        )}
      />
      <PrimaryButton
        label="Enviar enlace"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
      <Link href="/(auth)/login" style={{ marginTop: 24, textAlign: 'center' }}>
        Volver a iniciar sesión
      </Link>
    </Screen>
  );
}
