import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type NavigationTab =
  | 'agenda'
  | 'cash'
  | 'clients'
  | 'dashboard'
  | 'settings';

/** Tema visual global basado en el dashboard. */
export const appTheme = {
  colors: {
    accent: '#C79532',
    accentActive: '#956816',
    accentDark: '#B47D17',
    accentLight: '#E1B85B',
    background: '#FAF9F6',
    border: '#E4E1DA',
    icon: '#292929',
    overlay: 'rgba(16, 28, 45, 0.58)',
    surface: '#FFFFFF',
    surfaceMuted: '#F4F4F3',
    text: '#1C1C1C',
    textMuted: '#555A63',
    white: '#FFFFFF',
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

function GoldIndicator() {
  const translateX = useRef(new Animated.Value(-14)).current;

  useEffect(() => {
    let isActive = true;

    const move = (toValue: number): void => {
      Animated.timing(translateX, {
        duration: 5_500,
        easing: Easing.inOut(Easing.sin),
        isInteraction: false,
        toValue,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && isActive) move(toValue > 0 ? -14 : 14);
      });
    };

    move(14);
    return () => {
      isActive = false;
      translateX.stopAnimation();
    };
  }, [translateX]);

  const opacity = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [-14, 0, 14],
    outputRange: [0.72, 1, 0.72],
  });
  const scale = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [-14, 0, 14],
    outputRange: [0.86, 1.2, 0.86],
  });

  return (
    <View pointerEvents="none" style={styles.goldIndicator}>
      <Animated.View
        style={[
          styles.goldIndicatorFlare,
          { opacity, transform: [{ translateX }, { scale }] },
        ]}
      />
    </View>
  );
}

export function BottomNavigation({
  active,
}: {
  readonly active: NavigationTab;
}) {
  const router = useRouter();
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
  return (
    <View accessibilityRole="tablist" style={styles.navigation}>
      {items.map((item) => {
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
                selected
                  ? appTheme.colors.accentActive
                  : appTheme.colors.icon
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
    boxShadow:
      '0 0 3px 1px rgba(255, 255, 255, 0.96), 0 0 8px 4px rgba(255, 231, 163, 0.64), 0 2px 14px 7px rgba(225, 184, 91, 0.28)',
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
    bottom: 12,
    boxShadow:
      '0 14px 32px rgba(235, 216, 170, 0.06), 0 5px 14px rgba(248, 238, 211, 0.05)',
    flexDirection: 'row',
    elevation: 20,
    left: 16,
    paddingBottom: 7,
    paddingHorizontal: 6,
    paddingTop: 7,
    position: 'absolute',
    right: 16,
    shadowColor: '#F3E6C8',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    zIndex: 1000,
  },
  pressedItem: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
