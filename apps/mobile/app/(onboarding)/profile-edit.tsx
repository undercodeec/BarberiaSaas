import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse, UserProfileResponse } from '@barber-saas/api-client';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  BottomNavigation,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { CountryCityFields } from '../../src/components/RegistrationSelectors';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const PRIMARY = appTheme.colors.accent;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_DIMENSION = 1_600;
type PhotoTarget = 'avatar' | 'business-cover';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export default function ProfileEditScreen() {
  const { session, user } = useAuth();
  const layout = useNativeLayoutMetrics();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [businessCountryCode, setBusinessCountryCode] = useState('EC');
  const [businessCoverImage, setBusinessCoverImage] = useState<string | null>(null);
  const [facebookUrl, setFacebookUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [photoSheetTarget, setPhotoSheetTarget] = useState<PhotoTarget | null>(
    null,
  );

  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<UserProfileResponse>('/v1/profile'),
    queryKey: ['user-profile'],
  });
  const profile = profileQuery.data?.profile;
  const accountDetailsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });
  const accountDetails = accountDetailsQuery.data;

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName);
    setPhone(profile.phone ?? '');
    setBio(profile.bio ?? '');
    setPhotoData(profile.photoData);
  }, [profile]);

  useEffect(() => {
    if (!accountDetails) return;
    setBusinessName(accountDetails.businessName ?? '');
    setBusinessAddress(accountDetails.addressLine ?? '');
    setBusinessCity(accountDetails.city ?? '');
    setBusinessCountryCode(accountDetails.countryCode ?? 'EC');
    setBusinessCoverImage(accountDetails.coverImageUri);
    setFacebookUrl(accountDetails.facebookUrl ?? '');
    setInstagramUrl(accountDetails.instagramUrl ?? '');
  }, [accountDetails]);

  const refreshProfile = () =>
    queryClient.invalidateQueries({ queryKey: ['user-profile'] });
  const saveProfile = useMutation({
    mutationFn: async () => {
      const updatedProfile = await requireApiClient().request<UserProfileResponse>(
        '/v1/profile',
        {
          body: JSON.stringify({
            bio: bio.trim() || null,
            fullName: fullName.trim(),
            phone: phone.trim() || null,
            photoData,
          }),
          method: 'PATCH',
        },
      );
      if (accountDetails) {
        await requireApiClient().request('/v1/onboarding/account-details', {
          body: JSON.stringify({
            addressLine: businessAddress.trim() || null,
            businessName:
              businessName.trim() || accountDetails.businessName || fullName.trim(),
            city: businessCity.trim() || accountDetails.city || '',
            countryCode: businessCountryCode,
            coverImageUri: businessCoverImage,
            description: accountDetails.description,
            facebookUrl: facebookUrl.trim() || null,
            instagramUrl: instagramUrl.trim() || null,
            phone: phone.trim() || accountDetails.phone || '',
          }),
          method: 'PATCH',
        });
      }
      return updatedProfile;
    },
    onSuccess: () => {
      void refreshProfile();
      Alert.alert('Perfil guardado', 'Tus cambios fueron actualizados.');
    },
    onError: (error) =>
      Alert.alert(
        'No se pudo guardar',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const choosePhoto = async (source: 'camera' | 'library') => {
    const target = photoSheetTarget;
    setPhotoSheetTarget(null);
    if (!target) return;
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso necesario',
        'Autoriza el acceso para usar una foto.',
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            base64: true,
            quality: target === 'business-cover' ? 0.45 : 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.7,
          });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert('No pudimos leer la foto', 'Inténtalo con otra imagen.');
      return;
    }
    const bytes = asset.fileSize ?? Math.ceil((asset.base64.length * 3) / 4);
    if (
      bytes > (target === 'business-cover' ? 500_000 : MAX_IMAGE_BYTES) ||
      asset.width > MAX_IMAGE_DIMENSION ||
      asset.height > MAX_IMAGE_DIMENSION
    ) {
      Alert.alert(
        'Imagen demasiado grande',
        'Máximo: 1.5 MB y 1600 × 1600 píxeles.',
      );
      return;
    }
    const mimeType = asset.mimeType?.startsWith('image/')
      ? asset.mimeType
      : 'image/jpeg';
    const value = `data:${mimeType};base64,${asset.base64}`;
    if (target === 'avatar') setPhotoData(value);
    else setBusinessCoverImage(value);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomInset + 84 },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Volver a ajustes"
            onPress={() => router.replace('/settings')}
            style={styles.backButton}
          >
            <Ionicons
              color={appTheme.colors.accentDark}
              name="arrow-back"
              size={22}
            />
          </Pressable>
          <View>
            <Text style={styles.eyebrow}>Cuenta</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Editar perfil
            </Text>
          </View>
        </View>

        <View style={styles.photoSection}>
          <Pressable
            accessibilityLabel="Cambiar foto de perfil"
            onPress={() => setPhotoSheetTarget('avatar')}
            style={styles.avatar}
          >
            {photoData ? (
              <Image source={{ uri: photoData }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>
                {initials(fullName) || '?'}
              </Text>
            )}
            <View style={styles.avatarEdit}>
              <Ionicons color="#FFFFFF" name="camera" size={16} />
            </View>
          </Pressable>
          <Text style={styles.photoHint}>Toca la foto para cambiarla</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos personales</Text>
          <Field label="Nombre" onChangeText={setFullName} value={fullName} />
          <Field
            keyboardType="phone-pad"
            label="Teléfono"
            onChangeText={setPhone}
            placeholder="Tu número de teléfono"
            value={phone}
          />
          <Text style={styles.fieldLabel}>Correo electrónico</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>{profile?.email ?? '...'}</Text>
          </View>
        </View>

        {accountDetails ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Información del negocio</Text>
            <Text style={styles.businessHint}>
              Estos datos se muestran en la página pública de reservas.
            </Text>
            <Pressable
              accessibilityLabel="Cambiar portada del negocio"
              onPress={() => setPhotoSheetTarget('business-cover')}
              style={styles.businessCover}
            >
              {businessCoverImage ? (
                <Image source={{ uri: businessCoverImage }} style={styles.businessCoverImage} />
              ) : (
                <>
                  <Ionicons color={PRIMARY} name="image-outline" size={28} />
                  <Text style={styles.businessCoverLabel}>Agregar imagen de portada</Text>
                </>
              )}
            </Pressable>
            {businessCoverImage ? (
              <Pressable onPress={() => setBusinessCoverImage(null)} style={styles.removeCover}>
                <Text style={styles.removeCoverLabel}>Quitar portada</Text>
              </Pressable>
            ) : null}
            <Field label="Nombre del negocio" onChangeText={setBusinessName} value={businessName} />
            <Field
              label="Dirección"
              onChangeText={setBusinessAddress}
              placeholder="Dirección del negocio"
              value={businessAddress}
            />
            <CountryCityFields
              city={businessCity}
              countryCode={businessCountryCode}
              onCity={setBusinessCity}
              onCountry={(country) => {
                setBusinessCountryCode(country.code);
                setBusinessCity('');
              }}
            />
            <Field
              label="Enlace de Facebook"
              onChangeText={setFacebookUrl}
              placeholder="https://facebook.com/..."
              value={facebookUrl}
            />
            <Field
              label="Enlace de Instagram"
              onChangeText={setInstagramUrl}
              placeholder="https://instagram.com/..."
              value={instagramUrl}
            />
          </View>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cambios adicionales</Text>
          <Text style={styles.fieldLabel}>Sobre mí</Text>
          <TextInput
            maxLength={500}
            multiline
            onChangeText={setBio}
            placeholder="Cuéntale a tus clientes sobre tu trabajo"
            placeholderTextColor="#7A8491"
            style={[styles.field, styles.bioField]}
            textAlignVertical="top"
            value={bio}
          />
          <Text style={styles.limitText}>{bio.length}/500</Text>
        </View>

        <Pressable
          disabled={saveProfile.isPending || !fullName.trim()}
          onPress={() => saveProfile.mutate()}
          style={({ pressed }) => [
            styles.saveButton,
            (pressed || saveProfile.isPending || !fullName.trim()) &&
              styles.pressed,
          ]}
        >
          <Text style={styles.saveLabel}>
            {saveProfile.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={() => setPhotoSheetTarget(null)}
        statusBarTranslucent
        transparent
        visible={photoSheetTarget !== null}
      >
        <Pressable
          onPress={() => setPhotoSheetTarget(null)}
          style={styles.overlay}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              styles.sheet,
              { paddingBottom: layout.bottomInset + 16 },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Añadir foto</Text>
            <Text style={styles.sheetCopy}>
              Máximo 1.5 MB y 1600 × 1600 píxeles.
            </Text>
            <Pressable
              onPress={() => void choosePhoto('camera')}
              style={styles.sheetOption}
            >
              <Ionicons color={PRIMARY} name="camera-outline" size={23} />
              <Text style={styles.sheetOptionText}>Tomar foto</Text>
            </Pressable>
            <Pressable
              onPress={() => void choosePhoto('library')}
              style={styles.sheetOption}
            >
              <Ionicons color={PRIMARY} name="images-outline" size={23} />
              <Text style={styles.sheetOptionText}>
                Cargar desde dispositivo
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <BottomNavigation active="settings" />
    </SafeAreaView>
  );
}

function Field({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  readonly keyboardType?: 'default' | 'phone-pad';
  readonly label: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7A8491"
        style={styles.field}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 56,
    height: 112,
    justifyContent: 'center',
    position: 'relative',
    width: 112,
  },
  avatarEdit: {
    alignItems: 'center',
    backgroundColor: PRIMARY,
    borderColor: '#FFFFFF',
    borderRadius: 17,
    borderWidth: 3,
    bottom: -1,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 34,
  },
  avatarImage: { borderRadius: 56, height: 112, width: 112 },
  avatarInitials: { color: PRIMARY, fontSize: 34, fontWeight: '900' },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  bioField: { minHeight: 108, paddingTop: 13 },
  businessCover: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 16,
    height: 152,
    justifyContent: 'center',
    marginTop: 16,
    overflow: 'hidden',
  },
  businessCoverImage: { height: '100%', width: '100%' },
  businessCoverLabel: { color: PRIMARY, fontSize: 13, fontWeight: '800', marginTop: 8 },
  businessHint: { color: '#697483', fontSize: 13, lineHeight: 19, marginTop: 5 },
  card: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    borderWidth: 0,
    marginTop: 17,
    padding: 17,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 118,
    paddingHorizontal: 22,
    width: '100%',
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  field: {
    borderColor: '#D9E0E8',
    borderRadius: 14,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  fieldGroup: { marginTop: 15 },
  fieldLabel: {
    color: '#424B57',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 7,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    paddingTop: 18,
  },
  limitText: {
    color: '#7A8491',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  overlay: {
    backgroundColor: 'rgba(17,24,39,0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  photoHint: { color: '#697483', fontSize: 13, marginTop: 10 },
  photoSection: { alignItems: 'center', marginTop: 28 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  removeCover: { alignSelf: 'flex-start', marginTop: 9 },
  removeCoverLabel: { color: appTheme.colors.danger, fontSize: 13, fontWeight: '800' },
  readOnlyField: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  readOnlyText: { color: '#697483', fontSize: 15 },
  saveButton: {
    alignItems: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 17,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 55,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  saveLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  screen: appStyles.screen,
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '900' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingBottom: 36,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  sheetCopy: { color: '#697483', fontSize: 13, marginTop: 5 },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#C7CED9',
    borderRadius: 4,
    height: 5,
    marginBottom: 18,
    width: 48,
  },
  sheetOption: {
    alignItems: 'center',
    borderBottomColor: '#E6E9ED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 65,
  },
  sheetOptionText: { color: '#111827', fontSize: 16, fontWeight: '800' },
  sheetTitle: { color: '#111827', fontSize: 20, fontWeight: '900' },
  title: {
    color: '#111827',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 1,
  },
});
