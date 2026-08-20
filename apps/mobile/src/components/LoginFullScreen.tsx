import Ionicons from '@expo/vector-icons/Ionicons';
import { type SignInInput, signInSchema } from '@barber-saas/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Controller, useForm } from 'react-hook-form';
import {
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { appTheme, goldShadow } from './BottomNavigation';
import { NavaButton } from './NavaButton';
import { useAuth } from '../providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loginBackground = require('../../assets/loginbanner.png') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logoImage = require('../../assets/nava-logo.png') as number;

export function LoginFullScreen() {
  const router = useRouter();
  const { inviteToken } = useLocalSearchParams<{ inviteToken?: string }>();
  const { signIn } = useAuth();
  const { height, width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const compact = height < 760 || keyboardVisible;
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { control, handleSubmit, formState } = useForm<SignInInput>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(signInSchema),
  });
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  const keepFieldVisible = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ animated: true, y: 160 });
    });
  };
  const submit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await signIn(input);
      if (inviteToken) {
        router.replace({
          params: { token: inviteToken },
          pathname: '/(onboarding)/accept-invitation',
        });
      } else router.replace('/');
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No fue posible iniciar sesión.',
      );
    }
  });
  return (
    <ImageBackground
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
      source={loginBackground}
      style={[styles.background, { minHeight: height, width }]}
    >
      <StatusBar style="light" />
      <SafeAreaView
        edges={['bottom', 'left', 'right', 'top']}
        style={styles.safeArea}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboard}
        >
          <ScrollView
            ref={scrollRef}
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={[
              styles.content,
              { minHeight: height },
              keyboardVisible ? styles.contentWithKeyboard : null,
            ]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/')}
              style={styles.backButton}
            >
              <Ionicons
                color={appTheme.colors.white}
                name="arrow-back"
                size={23}
              />
              <Text style={styles.backLabel}>Regresar al inicio</Text>
            </Pressable>
            <View style={[styles.brand, compact ? styles.brandCompact : null]}>
              <Image
                accessibilityLabel="Nava"
                resizeMode="contain"
                source={logoImage}
                style={styles.brandName}
              />
              <Text style={styles.brandMessage}>Bienvenido de nuevo</Text>
            </View>
            <View style={styles.formCard}>
              <Text accessibilityRole="header" style={styles.title}>
                Iniciar sesión
              </Text>
              <Text style={styles.subtitle}>
                Ingresa tus datos para continuar.
              </Text>
              {formError ? (
                <Text accessibilityRole="alert" style={styles.formError}>
                  {formError}
                </Text>
              ) : null}
              <Controller
                control={control}
                name="email"
                render={({ field, fieldState }) => (
                  <View style={styles.field}>
                    <Text style={styles.label}>Correo electrónico</Text>
                    <View
                      style={[
                        styles.inputShell,
                        fieldState.error ? styles.inputError : null,
                      ]}
                    >
                      <Ionicons
                        color={appTheme.colors.accentDark}
                        name="mail-outline"
                        size={21}
                      />
                      <TextInput
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        onBlur={field.onBlur}
                        onChangeText={field.onChange}
                        onFocus={keepFieldVisible}
                        onSubmitEditing={() =>
                          passwordInputRef.current?.focus()
                        }
                        placeholder="correo@ejemplo.com"
                        placeholderTextColor={appTheme.colors.textMuted}
                        returnKeyType="next"
                        style={styles.input}
                        value={field.value}
                      />
                    </View>
                    {fieldState.error ? (
                      <Text accessibilityRole="alert" style={styles.fieldError}>
                        {fieldState.error.message}
                      </Text>
                    ) : null}
                  </View>
                )}
              />
              <Controller
                control={control}
                name="password"
                render={({ field, fieldState }) => (
                  <View style={styles.field}>
                    <Text style={styles.label}>Contraseña</Text>
                    <View
                      style={[
                        styles.inputShell,
                        fieldState.error ? styles.inputError : null,
                      ]}
                    >
                      <Ionicons
                        color={appTheme.colors.accentDark}
                        name="lock-closed-outline"
                        size={21}
                      />
                      <TextInput
                        autoComplete="current-password"
                        onBlur={field.onBlur}
                        onChangeText={field.onChange}
                        onFocus={keepFieldVisible}
                        onSubmitEditing={() => void submit()}
                        placeholder="Ingresa tu contraseña"
                        placeholderTextColor={appTheme.colors.textMuted}
                        ref={passwordInputRef}
                        returnKeyType="done"
                        secureTextEntry={!showPassword}
                        style={styles.input}
                        value={field.value}
                      />
                      <Pressable
                        accessibilityLabel={
                          showPassword
                            ? 'Ocultar contraseña'
                            : 'Mostrar contraseña'
                        }
                        onPress={() => setShowPassword((current) => !current)}
                      >
                        <Ionicons
                          color={appTheme.colors.accentDark}
                          name={
                            showPassword ? 'eye-off-outline' : 'eye-outline'
                          }
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
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/(auth)/forgot-password' as never)}
              >
                <Text style={styles.forgot}>Olvidé mi contraseña</Text>
              </Pressable>
              <NavaButton
                disabled={formState.isSubmitting}
                icon="log-in-outline"
                label="Iniciar sesión"
                loading={formState.isSubmitting}
                onPress={() => void submit()}
                style={styles.loginButton}
                variant="primary"
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/')}
                style={styles.homeButton}
              >
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name="home-outline"
                  size={20}
                />
                <Text style={styles.homeLabel}>Regresar al inicio</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, overflow: 'hidden' },
  backgroundImage: { height: '100%', width: '100%' },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 10,
  },
  backLabel: {
    color: appTheme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  brand: { alignItems: 'center', minHeight: 220, paddingTop: 24 },
  brandCompact: { minHeight: 125, paddingTop: 8 },
  brandMessage: {
    color: appTheme.colors.whiteMuted,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  brandName: {
    height: 58,
    tintColor: appTheme.colors.white,
    width: 178,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 4,
    width: '100%',
    maxWidth: 480,
  },
  contentWithKeyboard: { paddingBottom: 56 },
  field: { marginBottom: 17 },
  fieldError: {
    color: appTheme.colors.dangerBorder,
    fontSize: 13,
    marginTop: 6,
  },
  forgot: {
    alignSelf: 'flex-end',
    color: appTheme.colors.accentActive,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 20,
    marginTop: -2,
  },
  formCard: {
    alignSelf: 'center',
    backgroundColor: appTheme.colors.surfaceElevated,
    borderRadius: appTheme.radii.card,
    borderWidth: 0,
    maxWidth: 430,
    padding: 24,
    width: '100%',
    ...goldShadow,
  },
  formError: {
    backgroundColor: appTheme.colors.dangerSurface,
    borderRadius: 12,
    color: appTheme.colors.danger,
    marginBottom: 17,
    padding: 12,
  },
  homeButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radii.control,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 22,
    paddingVertical: 8,
  },
  homeLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '800',
  },
  input: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 54,
  },
  inputError: { borderColor: appTheme.colors.dangerBorder },
  inputShell: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  keyboard: { flex: 1 },
  label: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  loginButton: {
    backgroundColor: appTheme.colors.accent,
    borderWidth: 0,
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    height: 66,
    width: '100%',
    ...goldShadow,
  },
  safeArea: { flex: 1 },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 24,
    marginTop: 8,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
});
