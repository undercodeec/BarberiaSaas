import {
  type ResetPasswordInput,
  resetPasswordSchema,
} from '@barber-saas/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { requireApiClient } from '../../src/lib/api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ResetPasswordInput>({
    defaultValues: { password: '', token: token ?? '' },
    resolver: zodResolver(resetPasswordSchema),
  });

  const submit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await requireApiClient().request<void>('/v1/auth/reset-password', {
        body: input,
        method: 'POST',
      });
      router.replace('/(auth)/login');
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No fue posible actualizar la contraseña.',
      );
    }
  });

  return (
    <Screen
      description="Elige una contraseña nueva para tu cuenta."
      title="Nueva contraseña"
    >
      {!token ? (
        <InlineMessage message="El enlace de recuperación no es válido." />
      ) : null}
      {formError ? <InlineMessage message={formError} /> : null}
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="new-password"
            error={fieldState.error?.message}
            label="Nueva contraseña"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            secureTextEntry
            value={field.value}
          />
        )}
      />
      <PrimaryButton
        disabled={!token}
        label="Guardar contraseña"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
