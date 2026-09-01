import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  BottomNavigation,
} from '../../src/components/BottomNavigation';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import {
  quickGuideDestination,
  type QuickGuideId,
} from '../../src/features/guides/guide-navigation';

const guides = [
  {
    description: 'Recorre los accesos principales del panel de tu negocio.',
    icon: 'grid-outline' as const,
    id: 'dashboard-tour',
    title: 'Conocer mi dashboard',
  },
  {
    description: 'Te mostramos dónde iniciar una cita y qué ocurre después.',
    icon: 'calendar-outline' as const,
    id: 'first-booking',
    title: 'Crear una cita',
  },
  {
    description: 'Ubica el enlace que puedes enviar por WhatsApp y redes.',
    icon: 'share-social-outline' as const,
    id: 'share-booking-link',
    title: 'Compartir mi enlace de reservas',
  },
  {
    description: 'Conoce dónde registrar un servicio para tu catálogo.',
    icon: 'cut-outline' as const,
    id: 'add-service',
    title: 'Crear un servicio',
  },
  {
    description: 'Te mostramos dónde agregar un cliente a tu directorio.',
    icon: 'person-add-outline' as const,
    id: 'add-client',
    title: 'Agregar un cliente',
  },
] as const;

export default function GuidesScreen() {
  const router = useRouter();
  const organizationQuery = useCurrentOrganization();
  const role = organizationQuery.data?.membership.role ?? '';
  const canManageBusiness = ['manager', 'owner'].includes(role);
  const visibleGuides = guides.filter(
    (guide) =>
      (guide.id !== 'dashboard-tour' || canManageBusiness) &&
      (guide.id !== 'add-client' || canManageBusiness),
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityLabel="Volver a Ajustes"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={21}
          />
          <Text style={styles.backLabel}>Ajustes</Text>
        </Pressable>
        <Text style={styles.eyebrow}>AYUDA</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Guías rápidas
        </Text>
        <Text style={styles.description}>
          Elige lo que quieres aprender. Puedes repetir una guía cuando quieras.
        </Text>
        <View style={styles.list}>
          {visibleGuides.map((guide) => (
            <Pressable
              accessibilityHint="Abre la pantalla y destaca la acción indicada"
              accessibilityLabel={`Ver guía: ${guide.title}`}
              accessibilityRole="button"
              key={guide.id}
              onPress={() => {
                router.push(
                  quickGuideDestination(
                    guide.id as QuickGuideId,
                    Date.now().toString(),
                  ) as never,
                );
              }}
              style={styles.card}
            >
              <View style={styles.iconShell}>
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name={guide.icon}
                  size={23}
                />
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>{guide.title}</Text>
                <Text style={styles.cardDescription}>{guide.description}</Text>
              </View>
              <Ionicons
                color={appTheme.colors.accentDark}
                name="arrow-forward"
                size={20}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <BottomNavigation active="settings" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
    paddingRight: 10,
  },
  backLabel: { color: appTheme.colors.accentDark, fontWeight: '800' },
  card: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 88,
    padding: 14,
  },
  cardDescription: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  cardTitle: { color: appTheme.colors.text, fontSize: 15, fontWeight: '900' },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 620,
    paddingBottom: 116,
    paddingHorizontal: 22,
    paddingTop: 8,
    width: '100%',
  },
  copy: { flex: 1 },
  description: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
  },
  eyebrow: {
    color: appTheme.colors.accentDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginTop: 16,
  },
  iconShell: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  list: { gap: 11, marginTop: 24 },
  screen: appStyles.screen,
  title: {
    color: appTheme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 4,
  },
});
