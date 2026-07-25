import { type SignUpInput } from '@barber-saas/validation';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Controller, useForm } from 'react-hook-form';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { type ReactNode, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavaButton } from './NavaButton';
import {
  COUNTRIES,
  CountryCityFields,
  detectCountryCode,
  PhoneCountryField,
  TimeField,
} from './RegistrationSelectors';
import { useAuth } from '../providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logoImage = require('../../assets/nava-logo.png') as number;

type AccountType = 'business' | 'professional';
type Step =
  | 'choice'
  | 'business'
  | 'attention'
  | 'schedule'
  | 'credentials'
  | 'review'
  | 'verification';
type Values = SignUpInput & {
  businessName: string;
  city: string;
  country: string;
  openingTime: string;
  phone: string;
  closingTime: string;
};

export function RegistrationFlow({
  invitationToken,
}: {
  readonly invitationToken?: string | undefined;
}) {
  const router = useRouter();
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
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const defaultCountry =
    COUNTRIES.find((country) => country.code === countryCode) ?? COUNTRIES[0]!;
  const phoneCountry =
    COUNTRIES.find((country) => country.code === phoneCountryCode) ??
    COUNTRIES[0]!;
  const { control, getValues, handleSubmit, formState, setError, setValue } =
    useForm<Values>({
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
  const requireFields = (fields: (keyof Values)[], next: Step) => {
    const current = getValues();
    let invalid = false;
    fields.forEach((field) => {
      if (!String(current[field] ?? '').trim()) {
        setError(field, { message: 'Este campo es obligatorio.' });
        invalid = true;
      }
    });
    if (!invalid) setStep(next);
  };
  const submit = handleSubmit(
    async ({ confirmPassword, email, fullName, password }) => {
      if (!email.trim() || !password || !confirmPassword) {
        setFormError('Completa tu correo y contraseña.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Las contraseñas no coinciden.');
        return;
      }
      setFormError(null);
      try {
        const response = await signUp({
          confirmPassword,
          email,
          fullName,
          password,
        });
        setVerificationEmail(response.email);
        setDevelopmentCode(response.developmentVerificationCode ?? null);
        setStep('verification');
      } catch (error) {
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
    setVerifying(true);
    try {
      await verifyEmail({ code: verificationCode, email: verificationEmail });
      router.replace(
        invitationToken
          ? {
              params: { token: invitationToken },
              pathname: '/(onboarding)/accept-invitation',
            }
          : '/(onboarding)/account-setup',
      );
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
      setDevelopmentCode(response.developmentVerificationCode ?? null);
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
  return (
    <>
      <RegistrationWelcome />
      <Modal
        animationType="fade"
        onRequestClose={() => router.back()}
        statusBarTranslucent
        transparent
        visible
      >
        <View style={s.layer}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={s.backdrop}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={s.keyboardArea}
          >
            <SafeAreaView edges={['bottom']} style={s.sheet}>
              <View style={s.handle} />
              <ScrollView
                contentContainerStyle={s.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
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
                        icon="storefront-outline"
                        label="Soy negocio"
                        onPress={() => choose('business')}
                        variant="outline"
                      />
                      <NavaButton
                        icon="person-outline"
                        label="Soy profesional"
                        onPress={() => choose('professional')}
                        variant="primary"
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
                        description="Cuéntanos cómo podemos identificarte."
                        title="Información del negocio"
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
                              label="Nombre del negocio"
                              onBlur={field.onBlur}
                              onChangeText={field.onChange}
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
                              onChangeCountry={setPhoneCountryCode}
                              onChangeText={field.onChange}
                              value={field.value}
                            />
                          )}
                        />
                        <Next
                          onPress={() =>
                            requireFields(
                              ['fullName', 'businessName', 'phone'],
                              'attention',
                            )
                          }
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
                              onChangeText={field.onChange}
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
                          onPress={() =>
                            requireFields(
                              ['email', 'password', 'confirmPassword'],
                              'review',
                            )
                          }
                        />
                      </Section>
                    ) : null}
                    {step === 'review' ? (
                      <Section
                        description="Revisa los datos antes de completar el registro."
                        title="Información general"
                      >
                        <ReviewRow
                          label="Nombre"
                          onEdit={() => setStep('business')}
                          value={values.fullName}
                        />
                        <ReviewRow
                          label="Negocio"
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
                              ? 'Negocio'
                              : 'Solo profesional'
                          }
                        />
                        <ReviewRow
                          label="Correo"
                          onEdit={() => setStep('credentials')}
                          value={values.email}
                        />
                        <NavaButton
                          disabled={formState.isSubmitting}
                          icon="checkmark-outline"
                          label="Completar registro"
                          loading={formState.isSubmitting}
                          onPress={() => void submit()}
                          style={s.button}
                          variant="primary"
                        />
                      </Section>
                    ) : null}
                    {step === 'verification' ? (
                      <Section
                        description={`Enviamos un código de 6 dígitos a ${verificationEmail}. Vence en 10 minutos.`}
                        title="Verifica tu cuenta"
                      >
                        {verificationError ? (
                          <Text accessibilityRole="alert" style={s.formError}>
                            {verificationError}
                          </Text>
                        ) : null}
                        {developmentCode ? (
                          <Text style={verificationStyles.developmentCode}>
                            Código local: {developmentCode}
                          </Text>
                        ) : null}
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
                            placeholderTextColor="#98a0ab"
                            style={verificationStyles.codeInput}
                            value={verificationCode}
                          />
                        </View>
                        <NavaButton
                          disabled={verificationCode.length !== 6 || verifying}
                          icon="shield-checkmark-outline"
                          label="Verificar cuenta"
                          loading={verifying}
                          onPress={() => void confirmVerification()}
                          style={s.button}
                          variant="primary"
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
              </ScrollView>
            </SafeAreaView>
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
              Bienvenido a Nava
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
        icon="arrow-forward-outline"
        label="Siguiente"
        onPress={onPress}
        style={s.nextButton}
        variant="primary"
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
        placeholderTextColor="#98a0ab"
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
    backgroundColor: 'rgba(5, 10, 16, 0.66)',
  },
  backText: { color: '#2464e8', fontSize: 16, fontWeight: '700' },
  bottom: {
    bottom: -245,
    height: 460,
    left: -80,
    opacity: 0.72,
    transform: [{ rotate: '-28deg' }],
    width: 620,
  },
  button: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    height: 72,
    marginTop: 22,
    paddingHorizontal: 18,
    width: '100%',
  },
  choice: { alignItems: 'center', paddingTop: 28, width: '100%' },
  choiceActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 22,
    width: '100%',
  },
  content: { paddingBottom: 18 },
  description: { color: '#667080', fontSize: 16, lineHeight: 23, marginTop: 7 },
  edit: { color: '#2464e8', fontSize: 14, fontWeight: '800' },
  error: { color: '#bd2d2d', fontSize: 13, marginTop: 5 },
  field: { marginBottom: 15 },
  fields: { marginTop: 26 },
  formError: {
    backgroundColor: '#fff0ee',
    borderRadius: 12,
    color: '#a72d27',
    marginBottom: 14,
    padding: 11,
  },
  fullBanner: {
    backgroundColor: '#fff',
    paddingBottom: 18,
    paddingHorizontal: 24,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#dfe2e5',
    borderRadius: 99,
    height: 6,
    marginBottom: 22,
    marginTop: 12,
    width: 62,
  },
  heroDescription: {
    color: '#667080',
    fontSize: 17,
    lineHeight: 25,
    marginTop: 10,
    textAlign: 'center',
  },
  heroTitle: {
    color: '#101c2d',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f7f8fa',
    borderColor: '#d9dde3',
    borderRadius: 14,
    borderWidth: 1,
    color: '#101c2d',
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  inputError: { borderColor: '#bd2d2d' },
  keyboard: { flex: 1 },
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  label: { color: '#101c2d', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  layer: { flex: 1, justifyContent: 'flex-end' },
  logo: { alignSelf: 'center', height: 190, width: '76%' },
  nextButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    height: 72,
    minHeight: 72,
    paddingHorizontal: 18,
    width: '100%',
  },
  nextContainer: { marginTop: 22, paddingBottom: 8, width: '100%' },
  options: { gap: 13, marginTop: 28, width: '100%' },
  reviewLabel: { color: '#667080', fontSize: 13, fontWeight: '700' },
  reviewRow: {
    alignItems: 'center',
    borderBottomColor: '#e6e8eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  reviewText: { flex: 1, paddingRight: 12 },
  reviewValue: { color: '#101c2d', fontSize: 16, marginTop: 3 },
  roleButtons: { flexDirection: 'row', gap: 14, marginTop: 24 },
  roleContent: { paddingBottom: 18, paddingHorizontal: 20 },
  scissors: {
    color: '#a8ddd9',
    fontSize: 29,
    lineHeight: 32,
    marginHorizontal: 20,
    marginTop: -2,
  },
  screen: { backgroundColor: '#fcfcfb', flex: 1 },
  section: { flex: 1 },
  separator: { alignItems: 'center', flexDirection: 'row', marginTop: 34 },
  separatorLine: { backgroundColor: '#d9dedf', height: 1, width: 88 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  title: {
    color: '#101c2d',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  tool: { backgroundColor: '#f1f3f3', borderRadius: 150, position: 'absolute' },
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
    color: '#667080',
    fontSize: 18,
    lineHeight: 27,
    marginTop: 18,
    textAlign: 'center',
  },
  welcomeMessage: { alignItems: 'center', marginTop: 26 },
  welcomeTitle: {
    color: '#101c2d',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
});

const verificationStyles = StyleSheet.create({
  codeInput: {
    backgroundColor: '#f7f8fa',
    borderColor: '#d9dde3',
    borderRadius: 14,
    borderWidth: 1,
    color: '#101c2d',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 10,
    minHeight: 64,
    paddingHorizontal: 18,
    textAlign: 'center',
  },
  developmentCode: {
    backgroundColor: '#edf6ff',
    borderRadius: 12,
    color: '#1855a3',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 18,
    padding: 12,
    textAlign: 'center',
  },
  resendButton: { alignItems: 'center', marginTop: 18, paddingVertical: 10 },
  resendText: { color: '#2464e8', fontSize: 15, fontWeight: '800' },
});
