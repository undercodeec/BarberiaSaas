import { type SignInInput, signInSchema } from '@barber-saas/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';
import { useState } from 'react';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/providers/AuthProvider';
import { theme } from '../../src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignInInput>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(signInSchema),
  });

  const submit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await signIn(input);
      router.replace('/');
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No fue posible iniciar sesión.',
      );
    }
  });

  return (
    <Screen
      description="Usa el correo de tu cuenta personal."
      title="Iniciar sesión"
    >
      {formError ? <InlineMessage message={formError} /> : null}
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
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="current-password"
            error={fieldState.error?.message}
            label="Contraseña"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            secureTextEntry
            value={field.value}
          />
        )}
      />
      <PrimaryButton
        label="Entrar"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
      <Link href="/(auth)/recover" style={styles.link}>
        ¿Olvidaste tu contraseña?
      </Link>
      <Text style={styles.footer}>
        ¿Aún no tienes cuenta?{' '}
        <Link href="/(auth)/register" style={styles.link}>
          Regístrate
        </Link>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { color: theme.colors.muted, marginTop: 24, textAlign: 'center' },
  link: {
    color: theme.colors.accent,
    fontWeight: '700',
    marginTop: 20,
    textAlign: 'center',
  },
});
