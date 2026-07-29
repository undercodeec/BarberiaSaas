import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Redirect, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNavigation } from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const PRIMARY = '#1C1F24';
type IconName = ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details'],
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const account = accountQuery.data;
  const businessName = account?.businessName || 'Tu negocio';
  const bookingUrl = account?.bookingUrl ?? '';

  const version = Constants.expoConfig?.version ?? 'No disponible';

  const openExternal = async (url: string, title: string) => {
    if (!url)
      return Alert.alert(title, 'Este enlace todavia no esta configurado.');
    if (!(await Linking.canOpenURL(url)))
      return Alert.alert(title, 'No pudimos abrir este enlace.');
    await Linking.openURL(url);
  };
  const logout = () =>
    Alert.alert('Cerrar sesion', '¿Estas seguro de que deseas cerrar sesion?', [
      { style: 'cancel', text: 'Cancelar' },
      {
        onPress: () => void signOut(),
        style: 'destructive',
        text: 'Cerrar sesion',
      },
    ]);

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Cuenta y negocio</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Ajustes
            </Text>
          </View>
          <View style={styles.headerActions}>
            <IconButton
              icon="headset-outline"
              label="Soporte"
              onPress={() =>
                void openExternal('mailto:soporte@nava.app', 'Soporte')
              }
            />
          </View>
        </View>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Ionicons color={PRIMARY} name="storefront-outline" size={48} />
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
          description="Gestiona y administra tu negocio"
          icon="storefront-outline"
          onPress={() => router.push('/(onboarding)/business-settings')}
          title="Mi negocio"
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
          onPress={logout}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Ionicons color="#FFFFFF" name="log-out-outline" size={21} />
          <Text style={styles.logoutLabel}>Cerrar sesion</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Borrar mi cuenta',
              'Esta accion puede ser irreversible. Tu cuenta no se eliminara desde este aviso y requerira una verificacion adicional.',
              [{ style: 'cancel', text: 'Cancelar' }, { text: 'Entendido' }],
            )
          }
          style={styles.deleteAction}
        >
          <Ionicons color="#5D6672" name="trash-outline" size={19} />
          <Text style={styles.deleteLabel}>Borrar mi cuenta</Text>
        </Pressable>
        <View style={styles.version}>
          <Ionicons color="#5D6672" name="refresh-outline" size={22} />
          <View>
            <Text style={styles.versionTitle}>Actualizacion</Text>
            <Text style={styles.versionCopy}>Version instalada {version}</Text>
          </View>
        </View>
      </ScrollView>
      <BottomNavigation active="settings" />
    </SafeAreaView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons color="#111827" name={icon} size={22} />
    </Pressable>
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
      <Ionicons color="#7A8491" name="chevron-forward" size={21} />
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
    backgroundColor: '#EEEFF1',
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
  headerActions: { flexDirection: 'row', gap: 9 },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E5EC',
    borderRadius: 15,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  linkCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E5EC',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 13,
    padding: 17,
  },
  linkValue: { color: '#697483', fontSize: 13, lineHeight: 18, marginTop: 5 },
  logout: {
    alignItems: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 17,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 26,
    minHeight: 55,
  },
  logoutLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  openButton: {
    backgroundColor: '#EEEFF1',
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  openLabel: { color: PRIMARY, fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  profile: { alignItems: 'center', marginTop: 30 },
  promoCard: {
    alignItems: 'center',
    backgroundColor: '#EEEFF1',
    borderRadius: 22,
    flexDirection: 'row',
    gap: 15,
    marginTop: 13,
    padding: 19,
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
  screen: { backgroundColor: '#FFFFFF', flex: 1 },
  settingsCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E5EC',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    marginTop: 28,
    padding: 16,
    shadowColor: '#243247',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  skeleton: {
    backgroundColor: '#E9EDF2',
    borderRadius: 8,
    height: 23,
    marginTop: 15,
    width: 145,
  },
  title: {
    color: '#111827',
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
