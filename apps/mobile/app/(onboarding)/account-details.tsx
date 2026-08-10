import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { NavaButton } from '../../src/components/NavaButton';
import { CountryCityFields } from '../../src/components/RegistrationSelectors';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

interface FormValues {
  readonly address: string;
  readonly city: string;
  readonly description: string;
  readonly email: string;
  readonly facebook: string;
  readonly instagram: string;
  readonly name: string;
  readonly phone: string;
}

const EMPTY_FORM: FormValues = {
  address: '',
  city: '',
  description: '',
  email: '',
  facebook: '',
  instagram: '',
  name: '',
  phone: '',
};

const MAX_COVER_IMAGE_DATA_URI_LENGTH = 700_000;

function persistedCoverUri(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith('data:image/') || /^https?:\/\//u.test(value)
    ? value
    : null;
}

function profileToForm(profile: OnboardingAccountDetailsResponse): FormValues {
  return {
    address: profile.addressLine ?? '',
    city: profile.city ?? '',
    description: profile.description ?? '',
    email: profile.email,
    facebook: profile.facebookUrl ?? '',
    instagram: profile.instagramUrl ?? '',
    name: profile.businessName ?? profile.fullName,
    phone: profile.phone ?? '',
  };
}

function Field({
  editable = true,
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  readonly editable?: boolean;
  readonly label: string;
  readonly multiline?: boolean;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        editable={editable}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98a0ab"
        style={[
          styles.input,
          multiline ? styles.multilineInput : null,
          editable ? null : styles.readOnlyInput,
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

export default function AccountDetailsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState('EC');
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    // La respuesta remota hidrata el borrador editable una vez que termina la consulta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoverUri(persistedCoverUri(profileQuery.data.coverImageUri));
    setCountryCode(profileQuery.data.countryCode ?? 'EC');
    setForm(profileToForm(profileQuery.data));
  }, [profileQuery.data]);

  if (!session) return <Redirect href="/(auth)/login" />;
  const isEditingCompletedAccount = Boolean(
    profileQuery.data?.onboardingCompletedAt,
  );

  const update = (field: keyof FormValues) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const selectCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setRequestError('Permite el acceso a tus fotos para elegir una portada.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [16, 9],
      base64: true,
      mediaTypes: ['images'],
      quality: 0.45,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.base64) {
      setRequestError('No pudimos preparar la imagen. Intentalo nuevamente.');
      return;
    }
    const mimeType =
      asset.mimeType && /^(image\/(jpeg|png|webp))$/u.test(asset.mimeType)
        ? asset.mimeType
        : 'image/jpeg';
    const imageDataUri = `data:${mimeType};base64,${asset.base64}`;
    if (imageDataUri.length > MAX_COVER_IMAGE_DATA_URI_LENGTH) {
      setRequestError(
        'La imagen es demasiado grande. Elige otra foto o recortala antes de continuar.',
      );
      return;
    }
    setRequestError(null);
    setCoverUri(imageDataUri);
  };

  const save = async () => {
    setRequestError(null);
    if (!form.name.trim() || !form.phone.trim() || !form.city.trim()) {
      setRequestError('Completa el nombre, tel?fono, pa?s y ciudad.');
      return;
    }
    setSaving(true);
    try {
      await requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
        {
          body: {
            addressLine: form.address.trim() || null,
            businessName: form.name.trim(),
            city: form.city.trim(),
            countryCode,
            coverImageUri: coverUri,
            description: form.description.trim() || null,
            facebookUrl: form.facebook.trim() || null,
            instagramUrl: form.instagram.trim() || null,
            phone: form.phone.trim(),
          },
          method: 'PATCH',
        },
      );
      await queryClient.invalidateQueries({
        queryKey: ['onboarding-account-details', user?.id],
      });
      router.replace(
        isEditingCompletedAccount ? '/business-settings' : '/congratulations',
      );
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la informaci?n de tu cuenta.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right', 'top']}
      style={styles.screen}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Regresar"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={23}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>
            {isEditingCompletedAccount
              ? 'Información de tu negocio'
              : 'Configura tu cuenta'}
          </Text>
          {!isEditingCompletedAccount ? (
            <View
              accessibilityLabel="Paso 2 de 3"
              accessibilityRole="progressbar"
              style={styles.progress}
            >
              <View style={styles.completedStep} />
              <View style={styles.activeStep} />
              <View style={styles.step} />
            </View>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.introduction}>
            {isEditingCompletedAccount
              ? 'Mantén actualizados los datos que identifican a tu negocio.'
              : 'Genial, por \u00faltimo podr\u00e1s revisar o modificar la informaci\u00f3n de tu cuenta.'}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => void selectCover()}
            style={styles.cover}
          >
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverImage} />
            ) : null}
            <View style={styles.coverOverlay}>
              <View style={styles.camera}>
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name="camera-outline"
                  size={24}
                />
              </View>
              <Text style={styles.coverLabel}>Agregar imagen de portada</Text>
            </View>
          </Pressable>

          {profileQuery.isPending ? (
            <View style={styles.loading}>
              <ActivityIndicator color={appTheme.colors.accentDark} />
              <Text style={styles.loadingText}>
                {'Cargando tu informaci\u00f3n\u2026'}
              </Text>
            </View>
          ) : null}
          {profileQuery.error || requestError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {requestError ??
                (profileQuery.error instanceof Error
                  ? profileQuery.error.message
                  : 'No fue posible cargar tu informaci?n.')}
            </Text>
          ) : null}

          <Field
            label="Nombre"
            onChangeText={update('name')}
            value={form.name}
          />
          <Field
            label={'Tel\u00e9fono'}
            onChangeText={update('phone')}
            value={form.phone}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => setOptionalOpen((current) => !current)}
            style={styles.optionalToggle}
          >
            <Text style={styles.optionalLabel}>Campos opcionales</Text>
            <Ionicons
              color={appTheme.colors.accentDark}
              name={optionalOpen ? 'chevron-up' : 'chevron-down'}
              size={22}
            />
          </Pressable>

          {optionalOpen ? (
            <View style={styles.optionalContent}>
              <Field
                editable={false}
                label={'Correo electr\u00f3nico'}
                onChangeText={update('email')}
                value={form.email}
              />
              <Field
                label={'Direcci\u00f3n'}
                onChangeText={update('address')}
                value={form.address}
              />
              <Field
                label="Enlace de Facebook"
                onChangeText={update('facebook')}
                value={form.facebook}
              />
              <Field
                label="Enlace de Instagram"
                onChangeText={update('instagram')}
                value={form.instagram}
              />
              <CountryCityFields
                city={form.city}
                countryCode={countryCode}
                onCity={update('city')}
                onCountry={(country) => {
                  setCountryCode(country.code);
                  update('city')('');
                }}
              />
              <Field
                label={'Descripci\u00f3n'}
                multiline
                onChangeText={update('description')}
                placeholder={'Cu\u00e9ntales a tus clientes sobre tu negocio'}
                value={form.description}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <NavaButton
          foregroundColor={appTheme.colors.accentDark}
          icon="arrow-back-outline"
          label={'Atr\u00e1s'}
          onPress={() => router.back()}
          style={styles.backFooterButton}
          variant="outline"
        />
        <NavaButton
          disabled={profileQuery.isPending}
          foregroundColor={appTheme.colors.accentDark}
          icon={
            isEditingCompletedAccount
              ? 'checkmark-outline'
              : 'arrow-forward-outline'
          }
          label={isEditingCompletedAccount ? 'Guardar cambios' : 'Siguiente'}
          loading={saving}
          onPress={() => void save()}
          style={styles.nextButton}
          variant="outline"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activeStep: {
    backgroundColor: appTheme.colors.accent,
    borderRadius: 6,
    height: 10,
    width: 31,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  backFooterButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 0,
    height: 58,
    minWidth: 0,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  body: { flex: 1 },
  camera: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  completedStep: {
    backgroundColor: appTheme.colors.accentLight,
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  content: { paddingBottom: 24, paddingHorizontal: 24, paddingTop: 18 },
  cover: {
    backgroundColor: appTheme.colors.accentSubtle,
    borderRadius: 24,
    borderWidth: 0,
    height: 168,
    marginBottom: 26,
    overflow: 'hidden',
  },
  coverImage: { height: '100%', position: 'absolute', width: '100%' },
  coverLabel: { color: appTheme.colors.accentDark, fontSize: 15, fontWeight: '800' },
  coverOverlay: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    flex: 1,
    gap: 10,
    justifyContent: 'center',
  },
  error: {
    color: '#bd283c',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 18,
  },
  eyebrow: { color: appTheme.colors.accentDark, fontSize: 16, fontWeight: '800' },
  field: { marginBottom: 17 },
  footer: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopWidth: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  headerCopy: { flex: 1, gap: 10 },
  input: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 16,
    borderWidth: 0,
    color: appTheme.colors.text,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  introduction: {
    color: appTheme.colors.text,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.35,
    lineHeight: 29,
    marginBottom: 22,
    textAlign: 'center',
  },
  label: { color: appTheme.colors.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginBottom: 18,
  },
  loadingText: { color: appTheme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  multilineInput: { minHeight: 108, paddingTop: 14 },
  nextButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 0,
    height: 58,
    minWidth: 0,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  optionalContent: {
    borderBottomWidth: 0,
    marginBottom: 4,
    paddingTop: 17,
  },
  optionalLabel: { color: appTheme.colors.text, fontSize: 16, fontWeight: '800' },
  optionalToggle: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 17,
    borderWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
    minHeight: 58,
    paddingHorizontal: 16,
  },
  progress: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  readOnlyInput: { backgroundColor: appTheme.colors.surfaceMuted, color: appTheme.colors.textMuted },
  screen: appStyles.screen,
  step: { backgroundColor: appTheme.colors.border, borderRadius: 6, height: 10, width: 10 },
});
