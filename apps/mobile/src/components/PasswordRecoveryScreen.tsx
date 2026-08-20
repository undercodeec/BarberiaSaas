import Ionicons from '@expo/vector-icons/Ionicons';
import type { RecoverAccessResponse } from '@barber-saas/api-client';
import {
  recoverAccessSchema,
  type RecoverAccessInput,
} from '@barber-saas/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { appTheme, goldShadow } from './BottomNavigation';
import { InlineMessage } from './InlineMessage';
import { NavaButton } from './NavaButton';
import { requireApiClient } from '../lib/api';
import {
  normalizeResetToken,
  requestPasswordRecovery,
  resetPasswordFormSchema,
  type ResetPasswordFormInput,
  submitNewPassword,
} from '../lib/password-recovery';

const RESEND_WAIT_SECONDS = 60;

function RecoveryShell({ children }: { readonly children: React.ReactNode }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.safeArea}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityLabel="Volver a iniciar sesión"
            accessibilityRole="button"
            onPress={() => router.replace('/(auth)/login')}
            style={styles.backButton}
          >
            <Ionicons
              color={appTheme.colors.accentDark}
              name="arrow-back"
              size={22}
            />
            <Text style={styles.backLabel}>Iniciar sesión</Text>
          </Pressable>
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ForgotPasswordScreen() {
  const router = useRouter();
  const [response, setResponse] = useState<RecoverAccessResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const { control, handleSubmit, formState, getValues } =
    useForm<RecoverAccessInput>({
      defaultValues: { email: '' },
      resolver: zodResolver(recoverAccessSchema),
    });

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(
      () => setWaitSeconds((current) => Math.max(0, current - 1)),
      1_000,
    );
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  const sendRecovery = async (input: RecoverAccessInput) => {
    setErrorMessage(null);
    try {
      const nextResponse = await requestPasswordRecovery(
        requireApiClient(),
        input,
      );
      setResponse(nextResponse);
      setWaitSeconds(RESEND_WAIT_SECONDS);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No fue posible enviar la solicitud. Inténtalo nuevamente.',
      );
    }
  };
  const submit = handleSubmit(sendRecovery);

  if (response) {
    return (
      <RecoveryShell>
        <Ionicons
          color={appTheme.colors.accentActive}
          name="mail-outline"
          size={48}
        />
        <Text accessibilityRole="header" style={styles.title}>
          Revisa tu correo
        </Text>
        <Text style={styles.description}>{response.message}</Text>
        {response.developmentResetToken ? (
          <NavaButton
            icon="key-outline"
            label="Abrir enlace local"
            onPress={() =>
              router.replace({
                params: { token: response.developmentResetToken },
                pathname: '/(auth)/reset-password' as never,
              })
            }
            variant="outline"
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={waitSeconds > 0 || formState.isSubmitting}
          onPress={() => void sendRecovery({ email: getValues('email') })}
          style={styles.resendButton}
        >
          <Text style={styles.resendLabel}>
            {waitSeconds > 0
              ? `Reenviar en ${waitSeconds} s`
              : 'Reenviar correo'}
          </Text>
        </Pressable>
      </RecoveryShell>
    );
  }

  return (
    <RecoveryShell>
      <Text accessibilityRole="header" style={styles.title}>
        Recupera tu acceso
      </Text>
      <Text style={styles.description}>
        Ingresa tu correo. Si existe una cuenta, enviaremos un enlace temporal
        para crear una nueva contraseña.
      </Text>
      {errorMessage ? <InlineMessage message={errorMessage} /> : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <View style={styles.field}>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              onSubmitEditing={() => void submit()}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={appTheme.colors.textMuted}
              returnKeyType="send"
              style={[
                styles.input,
                fieldState.error ? styles.inputError : null,
              ]}
              value={field.value}
            />
            {fieldState.error ? (
              <Text accessibilityRole="alert" style={styles.fieldError}>
                {fieldState.error.message}
              </Text>
            ) : null}
          </View>
        )}
      />
      <NavaButton
        disabled={formState.isSubmitting}
        icon="mail-outline"
        label="Enviar enlace"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
        variant="primary"
      />
    </RecoveryShell>
  );
}

export function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = normalizeResetToken(params.token);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { control, handleSubmit, formState } = useForm<ResetPasswordFormInput>({
    defaultValues: { confirmPassword: '', password: '', token },
    resolver: zodResolver(resetPasswordFormSchema),
  });
  const submit = handleSubmit(async ({ password, token: validatedToken }) => {
    setErrorMessage(null);
    try {
      await submitNewPassword(requireApiClient(), {
        password,
        token: validatedToken,
      });
      setCompleted(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No fue posible cambiar la contraseña. Solicita un enlace nuevo.',
      );
    }
  });

  if (!token) {
    return (
      <RecoveryShell>
        <Text accessibilityRole="header" style={styles.title}>
          Enlace incompleto
        </Text>
        <Text style={styles.description}>
          Este enlace no contiene un token de recuperación. Solicita uno nuevo
          desde la pantalla de inicio de sesión.
        </Text>
        <NavaButton
          icon="refresh-outline"
          label="Solicitar otro enlace"
          onPress={() => router.replace('/(auth)/forgot-password' as never)}
          variant="primary"
        />
      </RecoveryShell>
    );
  }

  if (completed) {
    return (
      <RecoveryShell>
        <Ionicons
          color={appTheme.colors.accentActive}
          name="checkmark-circle-outline"
          size={52}
        />
        <Text accessibilityRole="header" style={styles.title}>
          Contraseña actualizada
        </Text>
        <Text style={styles.description}>
          Ya puedes iniciar sesión con tu nueva contraseña.
        </Text>
        <NavaButton
          icon="log-in-outline"
          label="Iniciar sesión"
          onPress={() => router.replace('/(auth)/login')}
          variant="primary"
        />
      </RecoveryShell>
    );
  }

  return (
    <RecoveryShell>
      <Text accessibilityRole="header" style={styles.title}>
        Crea una nueva contraseña
      </Text>
      <Text style={styles.description}>
        El enlace solo puede utilizarse una vez y vence automáticamente.
      </Text>
      {errorMessage ? <InlineMessage message={errorMessage} /> : null}
      {(['password', 'confirmPassword'] as const).map((name) => (
        <Controller
          control={control}
          key={name}
          name={name}
          render={({ field, fieldState }) => (
            <View style={styles.field}>
              <Text style={styles.label}>
                {name === 'password'
                  ? 'Nueva contraseña'
                  : 'Confirmar contraseña'}
              </Text>
              <View style={styles.passwordShell}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete={name === 'password' ? 'new-password' : 'off'}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor={appTheme.colors.textMuted}
                  secureTextEntry={!showPassword}
                  style={styles.passwordInput}
                  value={field.value}
                />
                <Pressable
                  accessibilityLabel={
                    showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'
                  }
                  accessibilityRole="button"
                  onPress={() => setShowPassword((current) => !current)}
                >
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                  />
                </Pressable>
              </View>
              {fieldState.error ? (
                <Text accessibilityRole="alert" style={styles.fieldError}>
                  {fieldState.error.message}
                </Text>
              ) : null}
            </View>
          )}
        />
      ))}
      <Controller
        control={control}
        name="token"
        render={({ fieldState }) =>
          fieldState.error ? (
            <Text accessibilityRole="alert" style={styles.fieldError}>
              {fieldState.error.message}
            </Text>
          ) : (
            <></>
          )
        }
      />
      <NavaButton
        disabled={formState.isSubmitting}
        icon="key-outline"
        label="Guardar contraseña"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
        variant="primary"
      />
    </RecoveryShell>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    minHeight: 44,
  },
  backLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '800',
  },
  card: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderRadius: appTheme.radii.card,
    gap: 20,
    padding: 24,
    width: '100%',
    ...goldShadow,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    marginHorizontal: 'auto',
    maxWidth: 480,
    padding: 20,
    width: '100%',
  },
  description: {
    color: appTheme.colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  field: { gap: 7 },
  fieldError: { color: appTheme.colors.danger, fontSize: 13 },
  input: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: 15,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  inputError: { borderColor: appTheme.colors.dangerBorder },
  label: { color: appTheme.colors.text, fontSize: 14, fontWeight: '800' },
  passwordInput: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 54,
  },
  passwordShell: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 15,
  },
  resendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  resendLabel: {
    color: appTheme.colors.accentActive,
    fontSize: 15,
    fontWeight: '800',
  },
  safeArea: { backgroundColor: appTheme.colors.background, flex: 1 },
  title: { color: appTheme.colors.text, fontSize: 28, fontWeight: '900' },
});
