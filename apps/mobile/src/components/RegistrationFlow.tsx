import { s, verificationStyles } from './RegistrationFlow.styles';
import type { RegistrationAvailabilityResponse } from '@barber-saas/api-client';
import {
  type RegistrationAvailabilityInput,
  registrationAvailabilitySchema,
  type SignUpInput,
} from '@barber-saas/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Controller, useForm } from 'react-hook-form';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { appTheme } from './BottomNavigation';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';
import { NavaButton } from './NavaButton';
import {
  COUNTRIES,
  CountryCityFields,
  detectCountryCode,
  PhoneCountryField,
  TimeField,
} from './RegistrationSelectors';
import { requireApiClient } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logoImage = require('../../assets/nava-logo.png') as number;
const VERIFICATION_DURATION_SECONDS = 10 * 60;

async function checkRegistrationAvailability(
  input: RegistrationAvailabilityInput,
): Promise<RegistrationAvailabilityResponse> {
  return requireApiClient().request<RegistrationAvailabilityResponse>(
    '/v1/auth/registration-availability',
    { body: input, method: 'POST' },
  );
}

function apiErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return null;
}

function remainingVerificationSeconds(expiresAt: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

type AccountType = 'business' | 'professional';
type Step =
  | 'choice'
  | 'business'
  | 'attention'
  | 'schedule'
  | 'credentials'
  | 'review'
  | 'verification';
type Values = Omit<SignUpInput, 'accountType' | 'countryCode'> & {
  country: string;
};

export function RegistrationFlow() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const delayedFocusScrollRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardLiftY] = useState(() => new Animated.Value(0));
  const sheetMaxHeight = Math.min(
    Math.max(320, height - insets.top - 12),
    Math.round(height * 0.86),
  );
  const { inviteToken } = useLocalSearchParams<{ inviteToken?: string }>();
  const { resendVerification, signUp, verifyEmail } = useAuth();
  const [step, setStep] = useState<Step>('choice');
  const [account, setAccount] = useState<AccountType | null>(null);
  const [countryCode, setCountryCode] = useState(detectCountryCode);
  const [phoneCountryCode, setPhoneCountryCode] = useState(detectCountryCode);
  const [formError, setFormError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<
    string | null
  >(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    VERIFICATION_DURATION_SECONDS,
  );
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const revealFocusedField = useCallback(() => {
    const focusedInput = TextInput.State.currentlyFocusedInput();
    if (!focusedInput) return;
    scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard?.(
      focusedInput,
      44,
      true,
    );
  }, []);
  const keepFieldVisible = useCallback(() => {
    revealFocusedField();
    if (delayedFocusScrollRef.current)
      clearTimeout(delayedFocusScrollRef.current);
    delayedFocusScrollRef.current = setTimeout(revealFocusedField, 180);
  }, [revealFocusedField]);
  useEffect(() => {
    if (step !== 'verification' || !verificationExpiresAt) return;
    const updateCountdown = () => {
      setRemainingSeconds(remainingVerificationSeconds(verificationExpiresAt));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [step, verificationExpiresAt]);
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      'keyboardDidShow',
      (event) => {
        setKeyboardVisible(true);
        keepFieldVisible();
        if (Platform.OS === 'android') {
          Animated.timing(keyboardLiftY, {
            duration: 180,
            toValue: -Math.min(event.endCoordinates.height, 220),
            useNativeDriver: true,
          }).start();
        }
      },
    );
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      if (Platform.OS === 'android') {
        Animated.timing(keyboardLiftY, {
          duration: 160,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (delayedFocusScrollRef.current)
        clearTimeout(delayedFocusScrollRef.current);
    };
  }, [keepFieldVisible, keyboardLiftY]);
  const verificationExpired = remainingSeconds === 0;
  const defaultCountry =
    COUNTRIES.find((country) => country.code === countryCode) ?? COUNTRIES[0]!;
  const phoneCountry =
    COUNTRIES.find((country) => country.code === phoneCountryCode) ??
    COUNTRIES[0]!;
  const {
    clearErrors,
    control,
    getValues,
    handleSubmit,
    formState,
    setError,
    setValue,
  } = useForm<Values>({
    defaultValues: {
      businessName: '',
      city: '',
      closingTime: '',
      confirmPassword: '',
      country: defaultCountry.name,
      email: '',
      fullName: '',
      openingTime: '',
      password: '',
      phone: '',
    },
  });
  const values = getValues();
  const fieldsAreComplete = (fields: (keyof Values)[]): boolean => {
    clearErrors(fields);
    const current = getValues();
    let invalid = false;
    fields.forEach((field) => {
      if (!String(current[field] ?? '').trim()) {
        setError(field, { message: 'Este campo es obligatorio.' });
        invalid = true;
      }
    });
    return !invalid;
  };
  const requireFields = (fields: (keyof Values)[], next: Step) => {
    if (fieldsAreComplete(fields)) setStep(next);
  };
  const nextFromBusiness = async () => {
    if (!fieldsAreComplete(['fullName', 'businessName', 'phone'])) return;
    const current = getValues();
    const input = {
      phone: `${phoneCountry.dial} ${current.phone.trim()}`,
    };
    const parsed = registrationAvailabilitySchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'phone') {
          setError(field, { message: issue.message });
        }
      }
      return;
    }
    setCheckingAvailability(true);
    try {
      const { conflicts } = await checkRegistrationAvailability(parsed.data);
      if (conflicts.phone) {
        setError('phone', { message: conflicts.phone });
      }
      if (!conflicts.phone) setStep('attention');
    } catch (error) {
      setError('phone', {
        message:
          error instanceof Error
            ? error.message
            : 'No pudimos comprobar la disponibilidad.',
      });
    } finally {
      setCheckingAvailability(false);
    }
  };
  const nextFromCredentials = async () => {
    if (!fieldsAreComplete(['email', 'password', 'confirmPassword'])) return;
    const current = getValues();
    if (current.password !== current.confirmPassword) {
      setError('confirmPassword', { message: 'Las contraseñas no coinciden.' });
      return;
    }
    const parsed = registrationAvailabilitySchema.safeParse({
      email: current.email,
    });
    if (!parsed.success) {
      setError('email', {
        message: parsed.error.issues[0]?.message ?? 'Ingresa un correo válido.',
      });
      return;
    }
    setCheckingAvailability(true);
    try {
      const { conflicts } = await checkRegistrationAvailability(parsed.data);
      if (conflicts.email) {
        setError('email', { message: conflicts.email });
      } else {
        setStep('review');
      }
    } catch (error) {
      setError('email', {
        message:
          error instanceof Error
            ? error.message
            : 'No pudimos comprobar la disponibilidad.',
      });
    } finally {
      setCheckingAvailability(false);
    }
  };
  const submit = handleSubmit(
    async ({
      businessName,
      city,
      closingTime,
      confirmPassword,
      email,
      fullName,
      openingTime,
      password,
      phone,
    }) => {
      if (!email.trim() || !password || !confirmPassword) {
        setFormError('Completa tu correo y contraseña.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Las contraseñas no coinciden.');
        return;
      }
      if (!account) {
        setFormError('Selecciona el tipo de cuenta.');
        return;
      }
      setFormError(null);
      try {
        const response = await signUp({
          accountType: account,
          businessName,
          city,
          closingTime,
          confirmPassword,
          countryCode,
          email,
          fullName,
          openingTime,
          password,
          phone: `${phoneCountry.dial} ${phone.trim()}`,
        });
        setVerificationEmail(response.email);
        setVerificationExpiresAt(response.verificationExpiresAt);
        setRemainingSeconds(
          remainingVerificationSeconds(response.verificationExpiresAt),
        );
        setStep('verification');
      } catch (error) {
        const code = apiErrorCode(error);
        if (code === 'PHONE_ALREADY_EXISTS') {
          setError('phone', {
            message: 'Ese número telefónico ya está registrado.',
          });
          setStep('business');
          return;
        }
        if (code === 'EMAIL_ALREADY_EXISTS') {
          setError('email', { message: 'Ese correo ya está registrado.' });
          setStep('credentials');
          return;
        }
        setFormError(
          error instanceof Error
            ? error.message
            : 'No fue posible crear la cuenta.',
        );
      }
    },
  );
  const confirmVerification = async () => {
    setVerificationError(null);
    if (verificationExpired) {
      setVerificationError('El código venció. Solicita uno nuevo.');
      return;
    }
    setVerifying(true);
    try {
      await verifyEmail({ code: verificationCode, email: verificationEmail });
      if (inviteToken) {
        router.replace({
          params: { token: inviteToken },
          pathname: '/(onboarding)/accept-invitation',
        });
      } else router.replace('/(onboarding)/account-setup');
    } catch (error) {
      setVerificationError(
        error instanceof Error
          ? error.message
          : 'No fue posible verificar la cuenta.',
      );
    } finally {
      setVerifying(false);
    }
  };
  const resendCode = async () => {
    setVerificationError(null);
    setResending(true);
    try {
      const response = await resendVerification(verificationEmail);
      setVerificationCode('');
      setVerificationExpiresAt(response.verificationExpiresAt);
      setRemainingSeconds(
        remainingVerificationSeconds(response.verificationExpiresAt),
      );
    } catch (error) {
      setVerificationError(
        error instanceof Error
          ? error.message
          : 'No fue posible reenviar el código.',
      );
    } finally {
      setResending(false);
    }
  };
  const previous: Record<Exclude<Step, 'choice'>, Step> = {
    attention: 'business',
    business: 'choice',
    credentials: 'schedule',
    review: 'credentials',
    schedule: 'attention',
    verification: 'review',
  };
  const choose = (type: AccountType) => {
    setAccount(type);
    setStep('business');
  };
  const [sheetTranslateY] = useState(() => new Animated.Value(0));
  const dismissRegistration = () => {
    Animated.timing(sheetTranslateY, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
      toValue: 720,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });
  };
  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) sheetTranslateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.75) {
          dismissRegistration();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  );
  return (
    <>
      <RegistrationWelcome />
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={dismissRegistration}
        statusBarTranslucent
        transparent
        visible
      >
        <View style={s.layer}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            onPress={dismissRegistration}
            style={s.backdrop}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            pointerEvents="box-none"
            style={s.keyboardArea}
          >
            <Animated.View
              style={[
                s.sheet,
                {
                  maxHeight: sheetMaxHeight,
                  paddingBottom: Math.max(
                    insets.bottom,
                    Platform.OS === 'android' ? 12 : 8,
                  ),
                  transform: [
                    {
                      translateY: Animated.add(sheetTranslateY, keyboardLiftY),
                    },
                  ],
                },
              ]}
            >
              <View {...panResponder.panHandlers} style={s.handle} />
              <KeyboardAwareScrollView
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={
                  keyboardVisible ? s.scrollContentWithKeyboard : undefined
                }
                keyboardDismissMode="on-drag"
                keyboardExtraOffset={40}
                keyboardShouldPersistTaps="handled"
                overScrollMode="never"
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                style={s.scroll}
              >
                <View style={s.content}>
                  {step === 'choice' ? (
                    <View style={s.roleContent}>
                      <Text accessibilityRole="header" style={s.title}>
                        ¿Cómo quieres unirte a Nava?
                      </Text>
                      <Text style={s.description}>
                        Elige una opción para crear tu cuenta.
                      </Text>
                      <View style={s.roleButtons}>
                        <NavaButton
                          foregroundColor={appTheme.colors.accentDark}
                          icon="storefront-outline"
                          label="Tengo un negocio"
                          onPress={() => choose('business')}
                          style={s.choiceButton}
                          variant="outline"
                        />
                        <NavaButton
                          foregroundColor={appTheme.colors.accentDark}
                          icon="person-outline"
                          label="Solo yo"
                          onPress={() => choose('professional')}
                          style={s.choiceButton}
                          variant="outline"
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={s.fullBanner}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setFormError(null);
                          setStep(previous[step]);
                        }}
                        style={s.back}
                      >
                        <Text style={s.backText}>‹ Volver</Text>
                      </Pressable>
                      {step === 'business' ? (
                        <Section
                          description={
                            account === 'business'
                              ? 'Cuéntanos cómo podemos identificar tu negocio.'
                              : 'Cuéntanos cómo identificar tu actividad profesional.'
                          }
                          title={
                            account === 'business'
                              ? 'Información del negocio'
                              : 'Información profesional'
                          }
                        >
                          <Controller
                            control={control}
                            name="fullName"
                            render={({ field, fieldState }) => (
                              <Field
                                autoComplete="name"
                                error={fieldState.error?.message}
                                label="Nombre"
                                onBlur={field.onBlur}
                                onChangeText={field.onChange}
                                onFocus={keepFieldVisible}
                                value={field.value}
                              />
                            )}
                          />
                          <Controller
                            control={control}
                            name="businessName"
                            render={({ field, fieldState }) => (
                              <Field
                                error={fieldState.error?.message}
                                label={
                                  account === 'business'
                                    ? 'Nombre del negocio'
                                    : 'Nombre profesional o marca'
                                }
                                onBlur={field.onBlur}
                                onChangeText={(value) => {
                                  clearErrors('businessName');
                                  field.onChange(value);
                                }}
                                onFocus={keepFieldVisible}
                                value={field.value}
                              />
                            )}
                          />
                          <Controller
                            control={control}
                            name="phone"
                            render={({ field, fieldState }) => (
                              <PhoneCountryField
                                countryCode={phoneCountryCode}
                                error={fieldState.error?.message}
                                onBlur={field.onBlur}
                                onChangeCountry={(code) => {
                                  clearErrors('phone');
                                  setPhoneCountryCode(code);
                                }}
                                onChangeText={(value) => {
                                  clearErrors('phone');
                                  field.onChange(value);
                                }}
                                onFocus={keepFieldVisible}
                                value={field.value}
                              />
                            )}
                          />
                          <Next
                            disabled={checkingAvailability}
                            onPress={() => void nextFromBusiness()}
                          />
                        </Section>
                      ) : null}
                      {step === 'attention' ? (
                        <Section
                          description="Indica dónde atenderás a tus clientes."
                          title="Información de atención"
                        >
                          <Controller
                            control={control}
                            name="city"
                            render={({
                              field: cityField,
                              fieldState: cityState,
                            }) => (
                              <Controller
                                control={control}
                                name="country"
                                render={({ fieldState: countryState }) => (
                                  <CountryCityFields
                                    city={cityField.value}
                                    cityError={cityState.error?.message}
                                    countryCode={countryCode}
                                    countryError={countryState.error?.message}
                                    onCity={cityField.onChange}
                                    onCityFocus={keepFieldVisible}
                                    onCountry={(country) => {
                                      setCountryCode(country.code);
                                      setValue('country', country.name);
                                      setValue('city', '');
                                    }}
                                  />
                                )}
                              />
                            )}
                          />
                          <Next
                            onPress={() =>
                              requireFields(['country', 'city'], 'schedule')
                            }
                          />
                        </Section>
                      ) : null}
                      {step === 'schedule' ? (
                        <Section
                          description="Configura el horario habitual de atención."
                          title="Horario de atención"
                        >
                          <Controller
                            control={control}
                            name="openingTime"
                            render={({ field, fieldState }) => (
                              <TimeField
                                error={fieldState.error?.message}
                                label="Horario de apertura"
                                onChange={field.onChange}
                                value={field.value}
                              />
                            )}
                          />
                          <Controller
                            control={control}
                            name="closingTime"
                            render={({ field, fieldState }) => (
                              <TimeField
                                error={fieldState.error?.message}
                                label="Horario de cierre"
                                onChange={field.onChange}
                                value={field.value}
                              />
                            )}
                          />
                          <Next
                            onPress={() =>
                              requireFields(
                                ['openingTime', 'closingTime'],
                                'credentials',
                              )
                            }
                          />
                        </Section>
                      ) : null}
                      {step === 'credentials' ? (
                        <Section
                          description="Usarás estos datos para iniciar sesión."
                          title="Información de acceso"
                        >
                          {formError ? (
                            <Text accessibilityRole="alert" style={s.formError}>
                              {formError}
                            </Text>
                          ) : null}
                          <Controller
                            control={control}
                            name="email"
                            render={({ field, fieldState }) => (
                              <Field
                                autoCapitalize="none"
                                autoComplete="email"
                                error={fieldState.error?.message}
                                keyboardType="email-address"
                                label="Correo electrónico"
                                onBlur={field.onBlur}
                                onChangeText={(value) => {
                                  clearErrors('email');
                                  field.onChange(value);
                                }}
                                onFocus={keepFieldVisible}
                                value={field.value}
                              />
                            )}
                          />
                          <Controller
                            control={control}
                            name="password"
                            render={({ field, fieldState }) => (
                              <Field
                                autoComplete="new-password"
                                error={fieldState.error?.message}
                                label="Contraseña"
                                onBlur={field.onBlur}
                                onChangeText={field.onChange}
                                onFocus={keepFieldVisible}
                                secureTextEntry
                                value={field.value}
                              />
                            )}
                          />
                          <Controller
                            control={control}
                            name="confirmPassword"
                            render={({ field, fieldState }) => (
                              <Field
                                autoComplete="new-password"
                                error={fieldState.error?.message}
                                label="Confirmar contraseña"
                                onBlur={field.onBlur}
                                onChangeText={field.onChange}
                                onFocus={keepFieldVisible}
                                secureTextEntry
                                value={field.value}
                              />
                            )}
                          />
                          <Next
                            disabled={checkingAvailability}
                            onPress={() => void nextFromCredentials()}
                          />
                        </Section>
                      ) : null}
                      {step === 'review' ? (
                        <Section
                          description="Revisa los datos antes de completar el registro."
                          title="Información general"
                        >
                          {formError ? (
                            <Text accessibilityRole="alert" style={s.formError}>
                              {formError}
                            </Text>
                          ) : null}
                          <ReviewRow
                            label="Nombre"
                            onEdit={() => setStep('business')}
                            value={values.fullName}
                          />
                          <ReviewRow
                            label={
                              account === 'business'
                                ? 'Negocio'
                                : 'Nombre profesional'
                            }
                            onEdit={() => setStep('business')}
                            value={values.businessName}
                          />
                          <ReviewRow
                            label="Teléfono"
                            onEdit={() => setStep('business')}
                            value={`${phoneCountry.dial} ${values.phone}`}
                          />
                          <ReviewRow
                            label="Ubicación"
                            onEdit={() => setStep('attention')}
                            value={`${values.city}, ${values.country}`}
                          />
                          <ReviewRow
                            label="Horario"
                            onEdit={() => setStep('schedule')}
                            value={`${values.openingTime} – ${values.closingTime}`}
                          />
                          <ReviewRow
                            label="Cuenta"
                            onEdit={() => setStep('choice')}
                            value={
                              account === 'business'
                                ? 'Tengo un negocio'
                                : 'Solo yo'
                            }
                          />
                          <ReviewRow
                            label="Correo"
                            onEdit={() => setStep('credentials')}
                            value={values.email}
                          />
                          <NavaButton
                            disabled={formState.isSubmitting}
                            foregroundColor={appTheme.colors.accentDark}
                            icon="checkmark-outline"
                            label="Completar registro"
                            loading={formState.isSubmitting}
                            onPress={() => void submit()}
                            style={s.button}
                            variant="outline"
                          />
                        </Section>
                      ) : null}
                      {step === 'verification' ? (
                        <Section
                          description={`Enviamos un código de 6 dígitos a ${verificationEmail}.`}
                          title="Verifica tu cuenta"
                        >
                          {verificationError ? (
                            <Text accessibilityRole="alert" style={s.formError}>
                              {verificationError}
                            </Text>
                          ) : null}
                          <Text
                            accessibilityLiveRegion="polite"
                            style={[
                              verificationStyles.countdown,
                              verificationExpired
                                ? verificationStyles.countdownExpired
                                : null,
                            ]}
                          >
                            {verificationExpired
                              ? 'El código venció. Solicita uno nuevo.'
                              : `El código vence en ${formatCountdown(remainingSeconds)}`}
                          </Text>
                          <View style={s.field}>
                            <Text style={s.label}>Código de verificación</Text>
                            <TextInput
                              accessibilityLabel="Código de verificación"
                              keyboardType="number-pad"
                              maxLength={6}
                              onChangeText={(code) =>
                                setVerificationCode(code.replace(/\D/g, ''))
                              }
                              onFocus={keepFieldVisible}
                              placeholder="000000"
                              placeholderTextColor={appTheme.colors.textMuted}
                              style={verificationStyles.codeInput}
                              value={verificationCode}
                            />
                          </View>
                          <NavaButton
                            disabled={
                              verificationCode.length !== 6 ||
                              verificationExpired ||
                              verifying
                            }
                            foregroundColor={appTheme.colors.accentDark}
                            icon="shield-checkmark-outline"
                            label="Verificar cuenta"
                            loading={verifying}
                            onPress={() => void confirmVerification()}
                            style={s.button}
                            variant="outline"
                          />
                          <Pressable
                            accessibilityRole="button"
                            disabled={resending}
                            onPress={() => void resendCode()}
                            style={verificationStyles.resendButton}
                          >
                            <Text style={verificationStyles.resendText}>
                              {resending ? 'Enviando…' : 'Reenviar código'}
                            </Text>
                          </Pressable>
                        </Section>
                      ) : null}
                    </View>
                  )}
                </View>
              </KeyboardAwareScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

function RegistrationWelcome() {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right', 'top']} style={s.screen}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={s.art}>
        <View style={[s.tool, s.top]} />
        <View style={[s.tool, s.bottom]} />
      </View>
      <ScrollView
        contentContainerStyle={s.welcomeContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.welcome}>
          <Image
            accessibilityLabel="Nava"
            resizeMode="contain"
            source={logoImage}
            style={s.logo}
          />
          <View style={s.welcomeMessage}>
            <Text accessibilityRole="header" style={s.welcomeTitle}>
              Bienvenido a{' '}
              <Image
                resizeMode="contain"
                source={logoImage}
                style={s.inlineBrandLogo}
              />
            </Text>
            <Text style={s.welcomeDescription}>
              Reserva tu cita y gestiona{`\n`}tu barbería con facilidad
            </Text>
            <View accessibilityElementsHidden style={s.separator}>
              <View style={s.separatorLine} />
              <Text style={s.scissors}>✂</Text>
              <View style={s.separatorLine} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function Section({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      <Text style={s.description}>{description}</Text>
      <View style={s.fields}>{children}</View>
    </View>
  );
}
function Next({
  disabled = false,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <View style={s.nextContainer}>
      <NavaButton
        disabled={disabled}
        foregroundColor={appTheme.colors.accentDark}
        icon="arrow-forward-outline"
        label="Siguiente"
        onPress={onPress}
        style={s.nextButton}
        variant="outline"
      />
    </View>
  );
}
function Field({
  error,
  label,
  ...props
}: TextInputProps & {
  readonly error?: string | undefined;
  readonly label: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityHint={error}
        accessibilityLabel={label}
        placeholderTextColor={appTheme.colors.textMuted}
        style={[s.input, error ? s.inputError : null]}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
function ReviewRow({
  label,
  onEdit,
  value,
}: {
  readonly label: string;
  readonly onEdit: () => void;
  readonly value: string;
}) {
  return (
    <View style={s.reviewRow}>
      <View style={s.reviewText}>
        <Text style={s.reviewLabel}>{label}</Text>
        <Text style={s.reviewValue}>{value}</Text>
      </View>
      <Pressable
        accessibilityLabel={`Editar ${label}`}
        accessibilityRole="button"
        onPress={onEdit}
      >
        <Text style={s.edit}>Editar</Text>
      </Pressable>
    </View>
  );
}
