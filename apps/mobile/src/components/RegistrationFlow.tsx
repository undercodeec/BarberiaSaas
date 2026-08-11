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
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  goldButtonShadow,
  goldShadow,
} from './BottomNavigation';
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
  useEffect(() => {
    if (step !== 'verification' || !verificationExpiresAt) return;
    const updateCountdown = () => {
      setRemainingSeconds(remainingVerificationSeconds(verificationExpiresAt));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [step, verificationExpiresAt]);
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
      businessName: current.businessName,
      phone: `${phoneCountry.dial} ${current.phone.trim()}`,
    };
    const parsed = registrationAvailabilitySchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'businessName' || field === 'phone') {
          setError(field, { message: issue.message });
        }
      }
      return;
    }
    setCheckingAvailability(true);
    try {
      const { conflicts } = await checkRegistrationAvailability(parsed.data);
      if (conflicts.businessName) {
        setError('businessName', { message: conflicts.businessName });
      }
      if (conflicts.phone) {
        setError('phone', { message: conflicts.phone });
      }
      if (!conflicts.businessName && !conflicts.phone) setStep('attention');
    } catch (error) {
      setError('businessName', {
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
        if (code === 'BUSINESS_NAME_ALREADY_EXISTS') {
          setError('businessName', {
            message: 'Ese nombre de negocio ya está en uso.',
          });
          setStep('business');
          return;
        }
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
      if (finished) router.back();
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
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={s.keyboardArea}
          >
            <Animated.View
              style={{ transform: [{ translateY: sheetTranslateY }] }}
            >
              <SafeAreaView edges={['bottom']} style={s.sheet}>
                <View {...panResponder.panHandlers} style={s.handle} />
                <View style={s.content}>
                  {step === 'choice' ? (
                    <View style={s.roleContent}>
                      <Text accessibilityRole="header" style={s.title}>
                        ¿Cómo quieres unirte a Nava
                        ?
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
                                onChangeCountry={(code) => {
                                  clearErrors('phone');
                                  setPhoneCountryCode(code);
                                }}
                                onChangeText={(value) => {
                                  clearErrors('phone');
                                  field.onChange(value);
                                }}
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
              </SafeAreaView>
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
const s = StyleSheet.create({
  art: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  back: { marginBottom: 14 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appTheme.colors.overlay,
  },
  backText: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '700',
  },
  bottom: {
    bottom: -245,
    height: 460,
    left: -80,
    opacity: 0.72,
    transform: [{ rotate: '-28deg' }],
    width: 620,
  },
  button: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    height: 72,
    marginTop: 22,
    paddingHorizontal: 18,
    width: '100%',
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  choice: { alignItems: 'center', paddingTop: 28, width: '100%' },
  choiceActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 22,
    width: '100%',
  },
  choiceButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  content: { paddingBottom: 0 },
  description: {
    color: appTheme.colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 7,
  },
  edit: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '800',
  },
  error: {
    color: appTheme.colors.dangerBorder,
    fontSize: 13,
    marginTop: 5,
  },
  field: { marginBottom: 15 },
  fields: { marginTop: 18 },
  formError: {
    backgroundColor: appTheme.colors.dangerSurface,
    borderRadius: 12,
    color: appTheme.colors.danger,
    marginBottom: 14,
    padding: 11,
  },
  fullBanner: {
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingBottom: 8,
    paddingHorizontal: 24,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: appTheme.colors.border,
    borderRadius: 99,
    height: 6,
    marginBottom: 22,
    marginTop: 12,
    width: 62,
  },
  heroDescription: {
    color: appTheme.colors.textMuted,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 10,
    textAlign: 'center',
  },
  heroTitle: {
    color: appTheme.colors.text,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  input: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  inputError: { borderColor: appTheme.colors.dangerBorder },
  keyboard: { flex: 1 },
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  label: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 7,
  },
  layer: { flex: 1, justifyContent: 'flex-end' },
  logo: { alignSelf: 'center', height: 190, width: '76%' },
  inlineBrandLogo: { height: 28, width: 90 },
  nextButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    height: 72,
    minHeight: 72,
    paddingHorizontal: 18,
    width: '100%',
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  nextContainer: { marginTop: 18, paddingBottom: 4, width: '100%' },
  options: { gap: 13, marginTop: 28, width: '100%' },
  reviewLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  reviewRow: {
    alignItems: 'center',
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  reviewText: { flex: 1, paddingRight: 12 },
  reviewValue: { color: appTheme.colors.text, fontSize: 16, marginTop: 3 },
  roleButtons: { flexDirection: 'row', gap: 14, marginTop: 24 },
  roleContent: { paddingBottom: 8, paddingHorizontal: 20 },
  scissors: {
    color: appTheme.colors.accentDark,
    fontSize: 29,
    lineHeight: 32,
    marginHorizontal: 20,
    marginTop: -2,
  },
  screen: appStyles.screen,
  section: { flex: 1 },
  separator: { alignItems: 'center', flexDirection: 'row', marginTop: 34 },
  separatorLine: {
    backgroundColor: appTheme.colors.border,
    height: 1,
    width: 88,
  },
  sheet: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    overflow: 'hidden',
    ...goldShadow,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  tool: {
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 150,
    position: 'absolute',
  },
  top: {
    height: 450,
    opacity: 0.46,
    right: -280,
    top: 170,
    transform: [{ rotate: '26deg' }],
    width: 350,
  },
  welcome: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  welcomeContent: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 12,
    paddingHorizontal: 24,
    paddingTop: 34,
  },
  welcomeDescription: {
    color: appTheme.colors.textMuted,
    fontSize: 18,
    lineHeight: 27,
    marginTop: 18,
    textAlign: 'center',
  },
  welcomeMessage: { alignItems: 'center', marginTop: 26 },
  welcomeTitle: {
    color: appTheme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
});

const verificationStyles = StyleSheet.create({
  codeInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 10,
    minHeight: 64,
    paddingHorizontal: 18,
    textAlign: 'center',
  },
  countdown: {
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 12,
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 18,
    padding: 12,
    textAlign: 'center',
  },
  countdownExpired: {
    backgroundColor: appTheme.colors.dangerSurface,
    color: appTheme.colors.danger,
  },
  resendButton: { alignItems: 'center', marginTop: 18, paddingVertical: 10 },
  resendText: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '800',
  },
});
