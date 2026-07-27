import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { BookingLinkSheet } from '../../src/components/BookingLinkSheet';
import { useAuth } from '../../src/providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const communityImage = require('../../assets/Felicidadez.png') as number;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '?Buenos d?as! Bienvenido';
  if (hour < 19) return '?Buenas tardes! Bienvenido';
  return '?Buenas noches! Bienvenido';
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.quickAction}>
      <View style={styles.quickIcon}>
        <Ionicons color="#101c2d" name={icon} size={27} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { session, user } = useAuth();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });


  const businessName = accountQuery.data?.businessName ?? 'Tu negocio';
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false);
  const bookingUrl = accountQuery.data?.bookingUrl ?? '';
  const unavailable = (title: string) =>
    Alert.alert(title, 'Esta funcionalidad estar? disponible pr?ximamente.');

  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right', 'top']} style={styles.screen}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text accessibilityRole="header" style={styles.businessName}>
              {businessName}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Notificaciones"
            accessibilityRole="button"
            onPress={() => unavailable('Notificaciones')}
            style={styles.notificationButton}
          >
            <Ionicons color="#101c2d" name="notifications-outline" size={29} />
          </Pressable>
        </View>

        <View style={styles.salesCard}>
          <View style={styles.salesHeader}>
            <Text style={styles.salesTitle}>Tus ventas ? Julio 2026</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => unavailable('Resumen')}
              style={styles.summaryButton}
            >
              <Text style={styles.summaryLabel}>Resumen</Text>
              <Ionicons color="#101c2d" name="bar-chart-outline" size={22} />
            </Pressable>
          </View>
          <Text style={styles.salesValue}>$0</Text>
          <View style={styles.salesMeta}>
            <Text style={styles.salesMetaText}>D?a 26 de 31</Text>
            <Text style={styles.salesMetaText}>84% del mes</Text>
          </View>
          <View accessibilityLabel="84% del mes" accessibilityRole="progressbar" style={styles.progressTrack}>
            <View style={styles.progressValue} />
          </View>
        </View>

        <View style={styles.quickActions}>
          <QuickAction icon="people-outline" label="Referidos" onPress={() => unavailable('Referidos')} />
          <QuickAction icon="flash-outline" label="Crece" onPress={() => unavailable('Crece')} />
          <QuickAction icon="sparkles-outline" label="Suscripci?n" onPress={() => unavailable('Suscripci?n')} />
          <QuickAction icon="grid-outline" label="Ver todas" onPress={() => unavailable('Funciones')} />
        </View>

        <View style={styles.welcome}>
          <Text style={styles.welcomeTitle}>?Bienvenido a Nava!</Text>
          <Text style={styles.welcomeCopy}>Descubre todo lo que podemos hacer juntos</Text>
        </View>

        <View style={styles.reservationCard}>
          <View style={styles.cardHeading}>
            <Text style={styles.cardTitle}>Recibe reservas</Text>
            <View style={styles.qrBadge}>
              <Ionicons color="#3478f6" name="qr-code-outline" size={29} />
            </View>
          </View>
          <Text style={styles.cardCopy}>
            Comparte el enlace de reservas de tu negocio en tus redes sociales y aumenta tus citas.
          </Text>
          <View style={styles.linkBox}>
            <View style={styles.linkCopy}>
              <Text style={styles.linkLabel}>Enlace de tu negocio</Text>
              <Text numberOfLines={2} style={styles.linkValue}>
                {bookingUrl || 'Preparando tu enlace de reservas'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsBookingSheetOpen(true)}
              style={styles.openButton}
            >
              <Text style={styles.openLabel}>Abrir</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.communityCard}>
          <View style={styles.communityCopy}>
            <Text style={styles.cardTitle}>??nete a nuestra comunidad!</Text>
            <Text style={styles.cardCopy}>
              Consejos, novedades e inspiraci?n para hacer crecer tu negocio.
            </Text>
          </View>
          <Image
            accessibilityLabel="Comunidad Nava"
            resizeMode="contain"
            source={communityImage}
            style={styles.communityImage}
          />
        </View>
      </ScrollView>

      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" style={[styles.navItem, styles.navActive]}>
          <Ionicons color="#3478f6" name="home-outline" size={25} />
          <Text style={styles.navActiveLabel}>Inicio</Text>
        </Pressable>
        <Pressable accessibilityLabel="Agenda" accessibilityRole="button" onPress={() => unavailable('Agenda')} style={styles.navItem}>
          <Ionicons color="#101c2d" name="calendar-outline" size={25} />
        </Pressable>
        <Pressable accessibilityLabel="Caja" accessibilityRole="button" onPress={() => unavailable('Caja')} style={styles.navItem}>
          <Ionicons color="#101c2d" name="receipt-outline" size={25} />
        </Pressable>
        <Pressable accessibilityLabel="Equipo" accessibilityRole="button" onPress={() => unavailable('Equipo')} style={styles.navItem}>
          <Ionicons color="#101c2d" name="people-outline" size={25} />
        </Pressable>
        <Pressable accessibilityLabel="Ajustes" accessibilityRole="button" onPress={() => unavailable('Ajustes')} style={styles.navItem}>
          <Ionicons color="#101c2d" name="settings-outline" size={25} />
        </Pressable>
      </View>
      <BookingLinkSheet
        onClose={() => setIsBookingSheetOpen(false)}
        url={bookingUrl}
        visible={isBookingSheetOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  businessName: { color: '#101c2d', fontSize: 33, fontWeight: '900', letterSpacing: -1.1, marginTop: 4 },
  cardCopy: { color: '#596b86', fontSize: 16, lineHeight: 23, marginTop: 12 },
  cardHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: '#101c2d', fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  communityCard: { backgroundColor: '#eef4ff', borderColor: '#dce8fb', borderRadius: 30, borderWidth: 1, height: 236, marginTop: 20, overflow: 'hidden', padding: 24 },
  communityCopy: { maxWidth: '61%', zIndex: 1 },
  communityImage: { bottom: -72, height: 245, position: 'absolute', right: -30, width: 275 },
  content: { paddingBottom: 128, paddingHorizontal: 24, paddingTop: 20 },
  greeting: { color: '#596b86', fontSize: 20, lineHeight: 28 },
  linkBox: { alignItems: 'center', backgroundColor: '#dce9ff', borderRadius: 19, flexDirection: 'row', gap: 12, marginTop: 22, minHeight: 84, padding: 13 },
  linkCopy: { flex: 1 },
  linkLabel: { color: '#596b86', fontSize: 13, marginBottom: 6 },
  linkValue: { color: '#101c2d', fontSize: 15, fontWeight: '800', lineHeight: 21 },
  navActive: { backgroundColor: '#e0ecff' },
  navActiveLabel: { color: '#3478f6', fontSize: 14, fontWeight: '800' },
  navItem: { alignItems: 'center', borderRadius: 26, flex: 1, gap: 3, height: 64, justifyContent: 'center' },
  navigation: { backgroundColor: 'rgba(255, 255, 255, 0.96)', borderColor: '#dfe8f8', borderRadius: 33, borderWidth: 1, bottom: 18, elevation: 8, flexDirection: 'row', left: 24, padding: 5, position: 'absolute', right: 24, shadowColor: '#101c2d', shadowOpacity: 0.12, shadowRadius: 14 },
  notificationButton: { alignItems: 'center', backgroundColor: '#edf3ff', borderRadius: 28, height: 64, justifyContent: 'center', width: 64 },
  openButton: { alignItems: 'center', backgroundColor: '#c5d9ff', borderRadius: 15, justifyContent: 'center', minHeight: 49, paddingHorizontal: 15 },
  openLabel: { color: '#3478f6', fontSize: 16, fontWeight: '900' },
  progressTrack: { backgroundColor: '#d5e2f8', borderRadius: 10, height: 9, marginTop: 12, overflow: 'hidden' },
  progressValue: { backgroundColor: '#3478f6', borderRadius: 10, height: '100%', width: '84%' },
  qrBadge: { alignItems: 'center', backgroundColor: '#dce9ff', borderRadius: 22, height: 55, justifyContent: 'center', width: 55 },
  quickAction: { alignItems: 'center', flex: 1, gap: 9 },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  quickIcon: { alignItems: 'center', backgroundColor: '#e3edff', borderRadius: 26, height: 60, justifyContent: 'center', width: 60 },
  quickLabel: { color: '#101c2d', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  reservationCard: { backgroundColor: '#eef4ff', borderColor: '#dce8fb', borderRadius: 30, borderWidth: 1, marginTop: 38, padding: 24 },
  salesCard: { backgroundColor: '#ffffff', borderColor: '#dce8fb', borderRadius: 30, borderWidth: 1, marginTop: 48, padding: 21, shadowColor: '#56719b', shadowOpacity: 0.06, shadowRadius: 12 },
  salesHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  salesMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  salesMetaText: { color: '#596b86', fontSize: 15 },
  salesTitle: { color: '#596b86', fontSize: 18, fontWeight: '600' },
  salesValue: { color: '#27c574', fontSize: 47, fontWeight: '900', marginTop: 24 },
  screen: { backgroundColor: '#f7f9ff', flex: 1 },
  summaryButton: { alignItems: 'center', backgroundColor: '#e5efff', borderRadius: 22, flexDirection: 'row', gap: 7, minHeight: 48, paddingHorizontal: 15 },
  summaryLabel: { color: '#101c2d', fontSize: 16, fontWeight: '800' },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  welcome: { alignItems: 'center', marginTop: 52 },
  welcomeCopy: { color: '#596b86', fontSize: 19, marginTop: 10, textAlign: 'center' },
  welcomeTitle: { color: '#101c2d', fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
});
