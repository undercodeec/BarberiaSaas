import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Redirect, useRouter } from 'expo-router';
import { useCallback } from 'react';
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

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const COLORS = {
  border: '#d9dde3',
  muted: '#667080',
  screen: '#ffffff',
  surface: '#f4f4f3',
  text: '#101c2d',
} as const;

export default function AdvancedSettingsScreen() {
  const router = useRouter();
  const { session, user } = useAuth();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });
  const account = accountQuery.data;
  const isBusiness = account?.accountType === 'business';
  const bookingUrl = account?.bookingUrl ?? '';

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/business-settings');
  }, [router]);

  const copyBookingUrl = async () => {
    if (!bookingUrl) return;
    await Clipboard.setStringAsync(bookingUrl);
    Alert.alert('Enlace copiado', 'Ya puedes compartir tu enlace de reservas.');
  };

  const shareBookingUrl = async () => {
    if (!bookingUrl) return;
    await Share.share({ message: bookingUrl, title: 'Mi enlace de reservas' });
  };

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={goBack}
          style={styles.backButton}
        >
          <Ionicons color={COLORS.text} name="arrow-back" size={25} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Configuración avanzada
          </Text>
          <Text style={styles.subtitle}>
            Preferencias adicionales de tu cuenta
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account-type' as never)}
          style={({ pressed }) => [
            styles.card,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.cardIcon}>
            <Ionicons
              color={COLORS.text}
              name={isBusiness ? 'storefront-outline' : 'person-outline'}
              size={26}
            />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Tipo de cuenta</Text>
            <Text style={styles.cardDescription}>
              {isBusiness ? 'Tengo un negocio' : 'Solo yo'}
            </Text>
          </View>
          <Ionicons color={COLORS.text} name="chevron-forward" size={23} />
        </Pressable>

        {isBusiness ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/collaborator-permissions' as never)}
            style={({ pressed }) => [
              styles.card,
              pressed ? styles.pressed : null,
            ]}
          >
            <View style={styles.cardIcon}>
              <Ionicons
                color={COLORS.text}
                name="shield-checkmark-outline"
                size={26}
              />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>Permisos a colaboradores</Text>
              <Text style={styles.cardDescription}>
                Asigna perfiles de acceso y consulta sus capacidades.
              </Text>
            </View>
            <Ionicons color={COLORS.text} name="chevron-forward" size={23} />
          </Pressable>
        ) : null}

        <View style={styles.linkCard}>
          <View style={styles.linkHeading}>
            <View style={styles.cardIcon}>
              <Ionicons color={COLORS.text} name="link-outline" size={26} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>Enlace de reserva</Text>
              <Text style={styles.cardDescription}>
                Comparte el acceso público a tus reservas.
              </Text>
            </View>
          </View>
          <View style={styles.linkBox}>
            <Text numberOfLines={2} style={styles.linkValue}>
              {bookingUrl || 'Preparando enlace…'}
            </Text>
          </View>
          <View style={styles.linkActions}>
            <SmallAction
              icon="copy-outline"
              label="Copiar"
              onPress={() => void copyBookingUrl()}
            />
            <SmallAction
              icon="share-social-outline"
              label="Compartir"
              onPress={() => void shareBookingUrl()}
            />
            <SmallAction
              icon="open-outline"
              label="Abrir"
              onPress={() => {
                if (bookingUrl) void Linking.openURL(bookingUrl);
              }}
            />
          </View>
        </View>

        <ComingSoonRow
          description="Idioma, zona horaria, moneda, formatos regionales y preferencias operativas por defecto."
          title="Configuración general"
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/booking-settings' as never)}
          style={({ pressed }) => [
            styles.soonRow,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Política de reservas</Text>
            <Text style={styles.cardDescription}>
              Confirmación, cancelación y reprogramación.
            </Text>
          </View>
          <Ionicons color={COLORS.text} name="chevron-forward" size={23} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/reviews-management' as never)}
          style={({ pressed }) => [
            styles.soonRow,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Reseñas públicas</Text>
            <Text style={styles.cardDescription}>
              Consulta, muestra u oculta reseñas verificadas.
            </Text>
          </View>
          <Ionicons color={COLORS.text} name="chevron-forward" size={23} />
        </Pressable>
        <ComingSoonRow
          description="Contenido adicional para mejorar tu sitio de reservas."
          title="Información adicional"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function SmallAction({
  icon,
  label,
  onPress,
}: {
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallAction,
        pressed ? styles.pressed : null,
      ]}
    >
      <Ionicons color={COLORS.text} name={icon} size={20} />
      <Text style={styles.smallActionLabel}>{label}</Text>
    </Pressable>
  );
}

function ComingSoonRow({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <View style={styles.soonRow}>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <View style={styles.soonBadge}>
        <Text style={styles.soonLabel}>Próximamente</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 88,
    padding: 16,
  },
  cardCopy: { flex: 1 },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: '#e5e7ea',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    marginRight: 13,
    width: 52,
  },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  configuredBadge: {
    backgroundColor: '#e8f3ec',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  configuredLabel: { color: '#287247', fontSize: 11, fontWeight: '800' },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    paddingBottom: 36,
    paddingHorizontal: 22,
    paddingTop: 20,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
    maxWidth: 720,
    minHeight: 72,
    paddingHorizontal: 18,
    width: '100%',
  },
  headerCopy: { flex: 1 },
  linkActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  linkBox: {
    backgroundColor: '#ffffff',
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 13,
  },
  linkCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  linkHeading: { alignItems: 'center', flexDirection: 'row' },
  linkValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  pressed: { opacity: 0.72 },
  screen: { backgroundColor: COLORS.screen, flex: 1 },
  smallAction: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: COLORS.border,
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 55,
    justifyContent: 'center',
  },
  smallActionLabel: { color: COLORS.text, fontSize: 11, fontWeight: '800' },
  soonBadge: {
    backgroundColor: '#eceef1',
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  soonLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  soonRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 82,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  subtitle: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
});
