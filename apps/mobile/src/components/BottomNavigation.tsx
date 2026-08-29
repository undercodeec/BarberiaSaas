import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentOrganization } from '../features/organization/useCurrentOrganization';

import {
  bottomActionPadding,
  bottomNavigationContentPadding,
  bottomSafeAreaInset,
} from '../lib/safe-area-layout';

export type NavigationTab =
  'agenda' | 'cash' | 'clients' | 'dashboard' | 'settings';

/** Tema visual global basado en el dashboard. */
export const appTheme = {
  colors: {
    accent: '#C79532',
    accentActive: '#956816',
    accentDark: '#B47D17',
    accentGhost: 'rgba(180, 125, 23, 0.08)',
    accentLight: '#E1B85B',
    accentSubtle: 'rgba(199, 149, 50, 0.06)',
    accentWash: 'rgba(235, 216, 170, 0.24)',
    background: '#FAF9F6',
    border: '#E4E1DA',
    danger: '#A72D27',
    dangerBorder: '#BD2D2D',
    dangerSurface: '#FFF0EE',
    icon: '#292929',
    overlay: 'rgba(16, 28, 45, 0.58)',
    surface: '#FFFFFF',
    surfaceElevated: 'rgba(255, 255, 255, 0.96)',
    surfaceMuted: '#F4F4F3',
    text: '#1C1C1C',
    textMuted: '#555A63',
    white: '#FFFFFF',
    whiteMuted: 'rgba(255, 255, 255, 0.82)',
  },
  radii: {
    card: 30,
    control: 17,
    navigation: 34,
    pill: 999,
    sheet: 40,
  },
  spacing: { page: 24 },
} as const;

export const appStyles = StyleSheet.create({
  screen: {
    backgroundColor: appTheme.colors.background,
    flex: 1,
  },
});

export const goldShadow = {
  elevation: 4,
  shadowColor: appTheme.colors.accentDark,
  shadowOffset: { height: 6, width: 0 },
  shadowOpacity: 0.1,
  shadowRadius: 14,
} as const;

export const goldButtonShadow = {
  ...Platform.select({
    android: {
      elevation: 5,
    },
    default: {
      shadowColor: appTheme.colors.accentDark,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.07,
      shadowRadius: 14,
    },
    web: {
      boxShadow:
        '0 12px 24px rgba(180, 125, 23, 0.07), 0 3px 8px rgba(225, 184, 91, 0.04)',
    },
  }),
} as const;

/** Medidas de paneles que respetan barras del sistema y tamaños Android reales. */
export function useNativeLayoutMetrics(sheetRatio = 0.88) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = Math.max(1, height - insets.top - insets.bottom - 12);
  const bottomInset = bottomSafeAreaInset(insets.bottom);

  return {
    bottomActionPadding: bottomActionPadding(insets.bottom),
    bottomInset,
    bottomNavigationContentPadding: bottomNavigationContentPadding(
      insets.bottom,
    ),
    sheetMaxHeight: Math.floor(Math.min(height * sheetRatio, availableHeight)),
    topInset: Math.max(insets.top, 12),
  } as const;
}

function GoldIndicator() {
  return (
    <View pointerEvents="none" style={styles.goldIndicator}>
      <View style={styles.goldIndicatorFlare} />
    </View>
  );
}

export function BottomNavigation({
  active,
}: {
  readonly active: NavigationTab;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const organizationQuery = useCurrentOrganization();
  const canAccessCash =
    organizationQuery.data?.membership.role === 'owner' ||
    organizationQuery.data?.membership.role === 'manager';
  const items: ReadonlyArray<{
    readonly icon: React.ComponentProps<typeof Ionicons>['name'];
    readonly label: string;
    readonly route: string;
    readonly value: NavigationTab;
  }> = [
    {
      icon: 'home-outline',
      label: 'Inicio',
      route: '/dashboard',
      value: 'dashboard',
    },
    {
      icon: 'calendar-outline',
      label: 'Agenda',
      route: '/agenda',
      value: 'agenda',
    },
    {
      icon: 'receipt-outline',
      label: 'Caja',
      route: '/cash-register',
      value: 'cash',
    },
    {
      icon: 'people-outline',
      label: 'Clientes',
      route: '/clients',
      value: 'clients',
    },
    {
      icon: 'settings-outline',
      label: 'Ajustes',
      route: '/settings',
      value: 'settings',
    },
  ];
  const visibleItems = items.filter(
    (item) => item.value !== 'cash' || canAccessCash,
  );
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.navigation,
        { bottom: bottomSafeAreaInset(insets.bottom) },
      ]}
    >
      {visibleItems.map((item) => {
        const selected = item.value === active;
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item.value}
            onPress={() => router.replace(item.route as never)}
            style={({ pressed }) => [
              styles.item,
              pressed && styles.pressedItem,
            ]}
          >
            <Ionicons
              color={
                selected ? appTheme.colors.accentActive : appTheme.colors.icon
              }
              name={item.icon}
              size={25}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, selected && styles.activeLabel]}
            >
              {item.label}
            </Text>
            {selected ? <GoldIndicator /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  activeLabel: {
    color: appTheme.colors.accentActive,
    fontWeight: '800',
  },
  goldIndicator: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.pill,
    bottom: -5,
    height: 3,
    left: '20%',
    position: 'absolute',
    right: '20%',
    shadowColor: appTheme.colors.accentLight,
    shadowOpacity: 0.85,
    shadowRadius: 6,
  },
  goldIndicatorFlare: {
    backgroundColor: '#FFFDF2',
    borderRadius: 3,
    bottom: -1,
    ...Platform.select({
      android: { elevation: 2 },
      default: {
        shadowColor: '#FFE7A3',
        shadowOpacity: 0.64,
        shadowRadius: 8,
      },
      web: {
        boxShadow:
          '0 0 3px 1px rgba(255, 255, 255, 0.96), 0 0 8px 4px rgba(255, 231, 163, 0.64), 0 2px 14px 7px rgba(225, 184, 91, 0.28)',
      },
    }),
    height: 3,
    position: 'absolute',
    width: 6,
    zIndex: 2,
  },
  label: {
    color: appTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  item: {
    alignItems: 'center',
    borderRadius: 26,
    flex: 1,
    gap: 4,
    height: 58,
    justifyContent: 'center',
  },
  navigation: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: appTheme.radii.navigation,
    ...Platform.select({
      android: { elevation: 20 },
      default: {
        shadowColor: '#F3E6C8',
        shadowOffset: { height: 12, width: 0 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
      },
      web: {
        boxShadow:
          '0 14px 32px rgba(235, 216, 170, 0.06), 0 5px 14px rgba(248, 238, 211, 0.05)',
      },
    }),
    flexDirection: 'row',
    left: 16,
    paddingBottom: 7,
    paddingHorizontal: 6,
    paddingTop: 7,
    position: 'absolute',
    right: 16,
    zIndex: 1000,
  },
  pressedItem: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
