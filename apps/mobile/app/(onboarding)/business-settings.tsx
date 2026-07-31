import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
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

import { requireApiClient } from '../../src/lib/api';
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
  border: '#d2d4d8',
  iconBackground: '#e1e2e4',
  muted: '#555a63',
  screen: '#ffffff',
  surface: '#f4f4f3',
  text: '#101c2d',
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
        route: '/account-details',
        title: 'Editar informaci\u00f3n',
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
        description: '\u00a1Tu negocio est\u00e1 en buenas manos!',
        icon: 'sparkles-outline',
        id: 'subscription',
        title: 'Suscripci\u00f3n',
      },
    ],
  },
];

export default function BusinessSettingsScreen() {
  const { session, user } = useAuth();
  const router = useRouter();
  const [isFlexExpanded, setIsFlexExpanded] = useState(true);
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const isOpening = useRef(false);
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
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
            <Ionicons color={COLORS.text} name="arrow-back" size={25} />
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
          expanded={isFlexExpanded}
          onPress={() => toggle(setIsFlexExpanded, isFlexExpanded)}
          title="Nava Flex"
        >
          <Text style={styles.accordionCopy}>
            En Nava, estamos emocionados de lanzar Nava Flex, un conjunto de
            potentes complementos dise\u00f1ados para llevar tu negocio al
            siguiente nivel.
          </Text>
        </SettingsAccordion>

        <SettingsAccordion
          expanded={isMoreExpanded}
          onPress={() => toggle(setIsMoreExpanded, isMoreExpanded)}
          title="M\u00e1s opciones"
        >
          <Text style={styles.accordionCopy}>
            No hay m\u00e1s opciones disponibles por el momento.
          </Text>
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
        <Ionicons color={COLORS.text} name={item.icon} size={27} />
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
        <Ionicons color={COLORS.text} name="chevron-forward" size={24} />
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
          color={COLORS.text}
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
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 8,
    width: 44,
  },
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 88,
    padding: 16,
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
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  screen: { backgroundColor: COLORS.screen, flex: 1 },
  section: { marginBottom: 36 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
});
