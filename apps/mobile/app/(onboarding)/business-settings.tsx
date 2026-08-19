import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  Alert,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { accountQueryKey } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];
type SettingsMenuItem = {
  readonly description: string;
  readonly icon: IconName;
  readonly id: string;
  readonly route?: string;
  readonly title: string;
};
type SettingsSection = {
  readonly id: string;
  readonly items: readonly SettingsMenuItem[];
  readonly title: string;
};

const COLORS = {
  border: appTheme.colors.border,
  iconBackground: appTheme.colors.accentWash,
  muted: appTheme.colors.textMuted,
  screen: appTheme.colors.background,
  surface: appTheme.colors.surface,
  text: appTheme.colors.text,
} as const;

const settingsSections: readonly SettingsSection[] = [
  {
    id: 'recent-options',
    title: 'Opciones recientes',
    items: [
      {
        description:
          'Gestiona tus colaboradores: crea, edita y administra su informaci\u00f3n.',
        icon: 'people-outline',
        id: 'collaborators',
        route: '/team-management',
        title: 'Gesti\u00f3n de colaboradores',
      },
      {
        description:
          'Gestiona el horario del negocio y los d\u00edas de atenci\u00f3n.',
        icon: 'calendar-outline',
        id: 'business-schedule',
        route: '/business-schedule',
        title: 'Horario del negocio',
      },
    ],
  },
  {
    id: 'my-business',
    title: 'Mi negocio',
    items: [
      {
        description: 'Edita la informaci\u00f3n de tu negocio.',
        icon: 'information-circle-outline',
        id: 'edit-business',
        route: '/profile-edit',
        title: 'Editar informaci\u00f3n',
      },
      {
        description: 'Crea y configura las sucursales incluidas en tu plan.',
        icon: 'business-outline',
        id: 'locations',
        route: '/location-management',
        title: 'Sucursales',
      },
      {
        description:
          'Configuraci\u00f3n adicional para hacer funcionar tu negocio.',
        icon: 'settings-outline',
        id: 'advanced-settings',
        route: '/advanced-settings',
        title: 'Configuraci\u00f3n avanzada',
      },
      {
        description: 'Solicita pagos adelantados de tus clientes.',
        icon: 'wallet-outline',
        id: 'wallet',
        route: '/wallet',
        title: 'Nava Wallet',
      },
      {
        description: 'Consulta, crea y organiza tu cat\u00e1logo de servicios.',
        icon: 'briefcase-outline',
        id: 'services-management',
        route: '/service-management',
        title: 'Gesti\u00f3n de servicios',
      },
      {
        description: 'Controla productos, existencias y alertas de stock.',
        icon: 'cube-outline',
        id: 'inventory',
        route: '/inventory',
        title: 'Inventario',
      },
      {
        description: '\u00a1Tu negocio est\u00e1 en buenas manos!',
        icon: 'sparkles-outline',
        id: 'subscription',
        route: '/subscription',
        title: 'Suscripci\u00f3n',
      },
    ],
  },
];

export default function BusinessSettingsScreen() {
  const { session, user } = useAuth();
  const router = useRouter();
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const isOpening = useRef(false);
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
  });
  const isSolo = accountQuery.data?.accountType === 'professional';
  const isBusiness = accountQuery.data?.accountType === 'business';
  const visibleSections = settingsSections.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.id !== 'collaborators' || isBusiness,
    ),
  }));

  const unavailable = useCallback((title: string) => {
    if (isOpening.current) return;
    isOpening.current = true;
    Alert.alert(
      title,
      'Esta secci\u00f3n estar\u00e1 disponible pr\u00f3ximamente.',
      [
        {
          text: 'Entendido',
          onPress: () => {
            isOpening.current = false;
          },
        },
      ],
    );
  }, []);

  const openItem = useCallback(
    (item: SettingsMenuItem) => {
      if (item.route) {
        router.push(item.route as never);
        return;
      }
      unavailable(item.title);
    },
    [router, unavailable],
  );

  const toggle = useCallback(
    (setExpanded: (value: boolean) => void, value: boolean) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(!value);
    },
    [],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/settings');
  }, [router]);
  const clearCache = useCallback(() => {
    queryClient.removeQueries({ type: 'inactive' });
    Alert.alert(
      'Caché limpiada',
      'Se eliminaron los datos temporales de la app. Tu sesión permanece activa.',
    );
  }, [queryClient]);

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Pressable
            accessibilityLabel="Volver"
            accessibilityRole="button"
            hitSlop={6}
            onPress={goBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={appTheme.colors.accentDark}
              name="arrow-back"
              size={25}
            />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {isSolo ? 'Mi actividad' : 'Ajustes'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {visibleSections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {section.title}
            </Text>
            <View style={styles.cardList}>
              {section.items.map((item) => (
                <SettingsNavigationCard
                  item={item}
                  key={item.id}
                  onPress={() => openItem(item)}
                />
              ))}
            </View>
          </View>
        ))}

        <SettingsAccordion
          expanded={isMoreExpanded}
          onPress={() => toggle(setIsMoreExpanded, isMoreExpanded)}
          title="Más opciones"
        >
          <Pressable
            accessibilityHint="Elimina datos temporales sin cerrar sesión"
            accessibilityLabel="Limpiar caché de la aplicación"
            accessibilityRole="button"
            onPress={clearCache}
            style={({ pressed }) => [
              styles.moreOption,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.moreOptionIcon}>
              <Ionicons
                color={appTheme.colors.accentDark}
                name="refresh-outline"
                size={23}
              />
            </View>
            <View style={styles.moreOptionCopy}>
              <Text style={styles.moreOptionTitle}>Limpiar caché</Text>
              <Text style={styles.moreOptionDescription}>
                Elimina datos temporales de la aplicación.
              </Text>
            </View>
          </Pressable>
        </SettingsAccordion>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsNavigationCard({
  item,
  onPress,
}: {
  readonly item: SettingsMenuItem;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint="Abre esta configuraci\u00f3n"
      accessibilityLabel={[item.title, item.description].join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          color={appTheme.colors.accentDark}
          name={item.icon}
          size={27}
        />
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.cardDescription}
        >
          {item.description}
        </Text>
      </View>
      <View style={styles.chevron}>
        <Ionicons
          color={appTheme.colors.accentDark}
          name="chevron-forward"
          size={24}
        />
      </View>
    </Pressable>
  );
}

function SettingsAccordion({
  children,
  expanded,
  onPress,
  title,
}: {
  readonly children: ReactNode;
  readonly expanded: boolean;
  readonly onPress: () => void;
  readonly title: string;
}) {
  return (
    <View style={styles.accordion}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.accordionHeader,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.accordionTitle}>{title}</Text>
        <Ionicons
          color={appTheme.colors.accentDark}
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={24}
        />
      </Pressable>
      {expanded ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  accordion: {
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    marginTop: 8,
    paddingBottom: 20,
  },
  accordionBody: { paddingHorizontal: 4, paddingTop: 8 },
  accordionCopy: {
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 23,
    paddingBottom: 8,
  },
  accordionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 4,
  },
  accordionTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    borderWidth: 0,
    height: 44,
    justifyContent: 'center',
    marginRight: 8,
    transform: [{ translateY: -3 }],
    width: 44,
    ...goldButtonShadow,
  },
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 0,
    flexDirection: 'row',
    minHeight: 88,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  cardCopy: { flex: 1, marginLeft: 14 },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 5,
  },
  cardList: { gap: 16, marginTop: 14 },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
  },
  chevron: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: 8,
    width: 28,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 22,
    paddingTop: 22,
    width: '100%',
  },
  header: { backgroundColor: COLORS.screen, paddingHorizontal: 22 },
  headerContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    maxWidth: 720,
    minHeight: 64,
    width: '100%',
  },
  headerTitle: {
    color: COLORS.text,
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  iconContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.iconBackground,
    borderRadius: 18,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  moreOption: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    padding: 14,
    ...goldButtonShadow,
  },
  moreOptionCopy: { flex: 1 },
  moreOptionDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  moreOptionIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.iconBackground,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  moreOptionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  screen: appStyles.screen,
  section: { marginBottom: 36 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
});
