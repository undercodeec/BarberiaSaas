import { type SignUpInput, signUpSchema } from '@barber-saas/validation';
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

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpInput>({
    defaultValues: {
      confirmPassword: '',
      email: '',
      fullName: '',
      password: '',
    },
    resolver: zodResolver(signUpSchema),
  });

  const submit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await signUp(input);
      router.replace('/(onboarding)/organization');
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No fue posible crear la cuenta.',
      );
    }
  });

  return (
    <Screen
      description="Cada persona tendrá su propia cuenta segura."
      title="Crear cuenta"
    >
      {formError ? <InlineMessage message={formError} /> : null}
      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="name"
            error={fieldState.error?.message}
            label="Nombre completo"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            value={field.value}
          />
        )}
      />
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
            autoComplete="new-password"
            error={fieldState.error?.message}
            label="Contraseña"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            secureTextEntry
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="new-password"
            error={fieldState.error?.message}
            label="Confirmar contraseña"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            secureTextEntry
            value={field.value}
          />
        )}
      />
      <PrimaryButton
        label="Continuar"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
      <Text style={styles.footer}>
        ¿Ya tienes cuenta?{' '}
        <Link href="/(auth)/login" style={styles.link}>
          Inicia sesión
        </Link>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { color: theme.colors.muted, marginTop: 24, textAlign: 'center' },
  link: { color: theme.colors.accent, fontWeight: '700' },
});
