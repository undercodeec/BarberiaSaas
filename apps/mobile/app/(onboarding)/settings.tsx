import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Redirect, useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const PRIMARY = appTheme.colors.accent;
type IconName = ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const layout = useNativeLayoutMetrics(0.92);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details'],
  });
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await requireApiClient().request<void>('/v1/account', {
        body: {
          confirmation: deleteConfirmation,
          password: deletePassword,
        },
        method: 'DELETE',
      });
      queryClient.clear();
      setAccountDeleted(true);
      try {
        await signOut();
      } catch {
        // La API ya cerró la cuenta; signOut siempre elimina el token local.
      }
    },
  });
  if (!session)
    return <Redirect href={accountDeleted ? '/' : '/(auth)/login'} />;

  const account = accountQuery.data;
  const businessName = account?.businessName || 'Tu negocio';
  const bookingUrl = account?.bookingUrl ?? '';
  const isSolo = account?.accountType === 'professional';

  const version = Constants.expoConfig?.version ?? 'No disponible';

  const openExternal = async (url: string, title: string) => {
    if (!url)
      return Alert.alert(title, 'Este enlace todavia no esta configurado.');
    if (!(await Linking.canOpenURL(url)))
      return Alert.alert(title, 'No pudimos abrir este enlace.');
    await Linking.openURL(url);
  };
  const checkForUpdate = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Actualizaciones disponibles en la app',
        'Instala Nava en tu teléfono para recibir actualizaciones automáticas.',
      );
      return;
    }
    if (!Updates.isEnabled) {
      Alert.alert(
        'Actualizaciones no disponibles',
        'Esta versión debe instalarse nuevamente para activar las actualizaciones automáticas.',
      );
      return;
    }

    setIsCheckingForUpdate(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        Alert.alert(
          'Nava está actualizada',
          'Ya tienes la versión más reciente.',
        );
        return;
      }

      await Updates.fetchUpdateAsync();
      Alert.alert(
        'Actualización lista',
        'Se descargó una nueva versión. Reinicia Nava para aplicarla.',
        [
          { style: 'cancel', text: 'Más tarde' },
          {
            onPress: () => void Updates.reloadAsync(),
            text: 'Reiniciar ahora',
          },
        ],
      );
    } catch {
      Alert.alert(
        'No pudimos buscar actualizaciones',
        'Comprueba tu conexión e inténtalo nuevamente.',
      );
    } finally {
      setIsCheckingForUpdate(false);
    }
  };
  const performLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      // signOut elimina la sesión local incluso si la API no responde.
    } finally {
      queryClient.clear();
      router.replace('/(auth)/login');
      setIsSigningOut(false);
    }
  };
  const logout = () => {
    void performLogout();
    return;
    const message =
      '¿Estás seguro de que deseas cerrar sesión en este dispositivo?';
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) void performLogout();
      return;
    }
    Alert.alert('Cerrar sesión', message, [
      { style: 'cancel', text: 'Cancelar' },
      {
        onPress: () => void performLogout(),
        style: 'destructive',
        text: 'Cerrar sesión',
      },
    ]);
  };
  const closeDeleteModal = () => {
    if (deleteAccountMutation.isPending) return;
    setIsDeleteOpen(false);
    setDeletePassword('');
    setDeleteConfirmation('');
    deleteAccountMutation.reset();
  };
  const canDelete =
    deletePassword.length >= 8 && deleteConfirmation === 'ELIMINAR';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomInset + 84 },
        ]}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              {isSolo ? 'Cuenta profesional' : 'Cuenta y negocio'}
            </Text>
            <Text accessibilityRole="header" style={styles.title}>
              Ajustes
            </Text>
          </View>
        </View>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Ionicons
              color={PRIMARY}
              name={isSolo ? 'person-outline' : 'storefront-outline'}
              size={48}
            />
            <Pressable
              accessibilityLabel="Editar perfil del negocio"
              onPress={() => router.push('/profile-edit')}

              style={styles.editAvatar}
            >
              <Ionicons color="#FFFFFF" name="pencil" size={16} />
            </Pressable>
          </View>
          {accountQuery.isLoading ? (
            <View style={styles.skeleton} />
          ) : (
            <Text style={styles.businessName}>{businessName}</Text>
          )}
        </View>

        <SettingsCard
          description={
            isSolo
              ? 'Gestiona tu actividad profesional'
              : 'Gestiona y administra tu negocio'
          }
          icon={isSolo ? 'person-outline' : 'storefront-outline'}
          onPress={() => router.push('/(onboarding)/business-settings')}
          title={isSolo ? 'Mi actividad' : 'Mi negocio'}
        />
        <SettingsCard
          description="Gestiona movimientos, reportes y otros informes que estarán disponibles próximamente."
          icon="bar-chart-outline"
          onPress={() => router.push('/(onboarding)/reports')}
          title="Estadísticas e informes"
        />
        <PromoCard
          description="Comparte el enlace de reservas de tu negocio en tus redes sociales y aumenta tus citas."
          icon="qr-code-outline"
          onPress={() =>
            bookingUrl
              ? void Share.share({ message: bookingUrl })
              : Alert.alert(
                  'Recibe reservas',
                  'Tu enlace de reservas todavia no esta disponible.',
                )
          }
          title="Recibe reservas"
        />

        <View style={styles.linkCard}>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>SuperLink de tu negocio</Text>
            <Text numberOfLines={2} style={styles.linkValue}>
              {bookingUrl || 'Enlace no disponible'}
            </Text>
          </View>
          <Pressable
            onPress={() => void openExternal(bookingUrl, 'SuperLink')}
            style={({ pressed }) => [
              styles.openButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.openLabel}>Abrir</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={logout}
          style={({ pressed }) => [
            styles.logout,
            pressed && styles.pressed,
            isSigningOut && styles.disabled,
          ]}
        >
          {isSigningOut ? (
            <ActivityIndicator color={appTheme.colors.accentDark} />
          ) : (
            <Ionicons
              color={appTheme.colors.accentDark}
              name="log-out-outline"
              size={21}
            />
          )}
          <Text style={styles.logoutLabel}>
            {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsDeleteOpen(true)}
          style={styles.deleteAction}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="trash-outline"
            size={19}
          />
          <Text style={styles.deleteLabel}>Borrar mi cuenta</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isCheckingForUpdate}
          onPress={() => void checkForUpdate()}
          style={({ pressed }) => [
            styles.version,
            pressed && styles.pressed,
            isCheckingForUpdate && styles.disabled,
          ]}
        >
          {isCheckingForUpdate ? (
            <ActivityIndicator
              color={appTheme.colors.accentDark}
              size="small"
            />
          ) : (
            <Ionicons
              color={appTheme.colors.accentDark}
              name="refresh-outline"
              size={22}
            />
          )}
          <View>
            <Text style={styles.versionTitle}>
              {isCheckingForUpdate
                ? 'Buscando actualización…'
                : 'Buscar actualización'}
            </Text>
            <Text style={styles.versionCopy}>Versión instalada {version}</Text>
          </View>
        </Pressable>
      </ScrollView>
      <BottomNavigation active="settings" />
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={closeDeleteModal}
        statusBarTranslucent
        transparent
        visible={isDeleteOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardArea}
        >
          <View style={styles.modalBackdrop}>
            <ScrollView
              contentContainerStyle={[
                styles.deleteModalContent,
                { paddingBottom: layout.bottomInset + 10 },
              ]}
              keyboardShouldPersistTaps="handled"
              style={[
                styles.deleteModal,
                { maxHeight: layout.sheetMaxHeight },
              ]}
            >
              <View style={styles.deleteIcon}>
                <Ionicons color="#B93838" name="warning-outline" size={28} />
              </View>
              <Text style={styles.deleteTitle}>Borrar mi cuenta</Text>
              <Text style={styles.deleteCopy}>
                Esta acción anonimiza tu perfil y revoca todas tus sesiones. Los
                registros de citas, Caja, comisiones y auditoría se conservan
                por integridad del negocio.
              </Text>
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  Si eres propietario, primero debes retirar colaboradores
                  activos, cerrar Caja y resolver citas futuras. Al continuar,
                  tu negocio y enlace de reservas quedarán cancelados.
                </Text>
              </View>
              <Text style={styles.inputLabel}>Contraseña actual</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="password"
                onChangeText={setDeletePassword}
                placeholder="Ingresa tu contraseña"
                secureTextEntry
                style={styles.input}
                value={deletePassword}
              />
              <Text style={styles.inputLabel}>
                Escribe ELIMINAR para confirmar
              </Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={setDeleteConfirmation}
                placeholder="ELIMINAR"
                style={styles.input}
                value={deleteConfirmation}
              />
              {deleteAccountMutation.error ? (
                <Text style={styles.deleteError}>
                  {deleteAccountMutation.error instanceof Error
                    ? deleteAccountMutation.error.message
                    : 'No pudimos borrar la cuenta.'}
                </Text>
              ) : null}
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={deleteAccountMutation.isPending}
                  onPress={closeDeleteModal}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelLabel}>Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canDelete || deleteAccountMutation.isPending}
                  onPress={() => deleteAccountMutation.mutate()}
                  style={[
                    styles.confirmDeleteButton,
                    (!canDelete || deleteAccountMutation.isPending) &&
                      styles.disabled,
                  ]}
                >
                  {deleteAccountMutation.isPending ? (
                    <ActivityIndicator
                      color={appTheme.colors.accentDark}
                      size="small"
                    />
                  ) : (
                    <Ionicons color="#FFFFFF" name="trash-outline" size={18} />
                  )}
                  <Text style={styles.confirmDeleteLabel}>Borrar cuenta</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SettingsCard({
  description,
  icon,
  onPress,
  title,
}: {
  readonly description: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly title: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingsCard, pressed && styles.pressed]}
    >
      <View style={styles.cardIcon}>
        <Ionicons color={PRIMARY} name={icon} size={25} />
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <Ionicons
        color={appTheme.colors.accentDark}
        name="chevron-forward"
        size={21}
      />
    </Pressable>
  );
}
function PromoCard({
  description,
  icon,
  onPress,
  title,
}: {
  readonly description: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly title: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.promoCard, pressed && styles.pressed]}
    >
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.promoDescription}>{description}</Text>
      </View>
      <View style={styles.promoIcon}>
        <Ionicons color={PRIMARY} name={icon} size={30} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cancelButton: {
    alignItems: 'center',
    borderColor: '#D8DDE4',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  cancelLabel: { color: '#303A48', fontSize: 14, fontWeight: '900' },
  confirmDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#B93838',
    borderRadius: 14,
    flex: 1.25,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 50,
  },
  confirmDeleteLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  deleteCopy: {
    color: '#5D6672',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  deleteError: {
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    color: '#A52F2F',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
    padding: 11,
  },
  deleteIcon: {
    alignItems: 'center',
    backgroundColor: '#FDECEC',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  deleteModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    maxWidth: 520,
    width: '100%',
  },
  deleteModalContent: { padding: 22 },
  deleteTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 14,
  },
  disabled: { opacity: 0.48 },
  input: {
    borderColor: '#D8DDE4',
    borderRadius: 14,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputLabel: {
    color: '#303A48',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 7,
    marginTop: 15,
  },
  keyboardArea: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 17, 27, 0.52)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  warningBox: {
    backgroundColor: '#FFF6E6',
    borderRadius: 14,
    marginTop: 14,
    padding: 12,
  },
  warningText: { color: '#78541C', fontSize: 12, lineHeight: 18 },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#EEEFF1',
    borderRadius: 52,
    height: 104,
    justifyContent: 'center',
    position: 'relative',
    width: 104,
  },
  businessName: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 15,
  },
  cardCopy: { flex: 1 },
  cardDescription: { color: '#697483', fontSize: 13, marginTop: 4 },
  cardTitle: { color: '#111827', fontSize: 16, fontWeight: '900' },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 15,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 118,
    paddingHorizontal: 22,
    width: '100%',
  },
  deleteAction: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 17,
    padding: 10,
  },
  deleteLabel: {
    color: '#5D6672',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  editAvatar: {
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
  eyebrow: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 18,
  },
  linkCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 12,
    marginTop: 13,
    padding: 17,
  },
  linkValue: { color: '#697483', fontSize: 13, lineHeight: 18, marginTop: 5 },
  logout: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 17,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 26,
    minHeight: 55,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  logoutLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  openButton: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 13,
    borderWidth: 0,
    paddingHorizontal: 15,
    paddingVertical: 10,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  openLabel: { color: PRIMARY, fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  profile: { alignItems: 'center', marginTop: 30 },
  promoCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 15,
    marginTop: 13,
    padding: 19,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  promoDescription: {
    color: '#536174',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  promoIcon: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  screen: appStyles.screen,
  settingsCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 13,
    marginTop: 28,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  skeleton: {
    backgroundColor: '#E9EDF2',
    borderRadius: 8,
    height: 23,
    marginTop: 15,
    width: 145,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 2,
  },
  version: {
    alignItems: 'center',
    borderTopColor: '#E0E5EC',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 11,
    justifyContent: 'center',
    marginTop: 29,
    paddingTop: 22,
  },
  versionCopy: {
    color: '#697483',
    fontSize: 13,
    marginTop: 3,
    textAlign: 'center',
  },
  versionTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
});
