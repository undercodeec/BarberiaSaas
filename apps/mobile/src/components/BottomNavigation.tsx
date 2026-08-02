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

type NavigationTab = 'agenda' | 'cash' | 'clients' | 'dashboard' | 'settings';

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
  appearance = 'default',
}: {
  readonly active: NavigationTab;
  readonly appearance?: 'default' | 'gold';
}) {
  const router = useRouter();
  const items: ReadonlyArray<{
    readonly icon: React.ComponentProps<typeof Ionicons>['name'];
    readonly goldLabel: string;
    readonly label: string;
    readonly route: string;
    readonly value: NavigationTab;
  }> = [
    {
      icon: 'home-outline',
      goldLabel: 'Inicio',
      label: 'Inicio',
      route: '/dashboard',
      value: 'dashboard',
    },
    {
      icon: 'calendar-outline',
      goldLabel: 'Calendario',
      label: 'Agenda',
      route: '/agenda',
      value: 'agenda',
    },
    {
      icon: 'receipt-outline',
      goldLabel: 'Ventas',
      label: 'Caja',
      route: '/cash-register',
      value: 'cash',
    },
    {
      icon: 'people-outline',
      goldLabel: 'Clientes',
      label: 'Clientes',
      route: '/clients',
      value: 'clients',
    },
    {
      icon: 'settings-outline',
      goldLabel: 'Ajustes',
      label: 'Ajustes',
      route: '/settings',
      value: 'settings',
    },
  ];
  return (
    <View
      style={[
        styles.navigation,
        appearance === 'gold' && styles.goldNavigation,
      ]}
    >
      {items.map((item) => {
        const selected = item.value === active;
        const isGold = appearance === 'gold';
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            key={item.value}
            onPress={() => router.replace(item.route as never)}
            style={[
              styles.item,
              isGold && styles.goldItem,
              selected && !isGold && styles.active,
            ]}
          >
            <Ionicons
              color={
                isGold
                  ? selected
                    ? '#956816'
                    : '#292929'
                  : selected
                    ? '#FFFFFF'
                    : '#111318'
              }
              name={item.icon}
              size={isGold ? 25 : 23}
            />
            {selected || isGold ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.activeLabel,
                  isGold && styles.goldLabel,
                  isGold && selected && styles.goldActiveLabel,
                ]}
              >
                {isGold ? item.goldLabel : item.label}
              </Text>
            ) : null}
            {isGold && selected ? <GoldIndicator /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  active: { backgroundColor: '#17191D' },
  activeLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  goldActiveLabel: { color: '#956816', fontWeight: '800' },
  goldIndicator: {
    alignItems: 'center',
    backgroundColor: '#C79532',
    borderRadius: 999,
    bottom: -5,
    height: 3,
    left: '20%',
    position: 'absolute',
    right: '20%',
    shadowColor: '#E1B85B',
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
  goldItem: {
    gap: 4,
    height: 58,
  },
  goldLabel: {
    color: '#555555',
    fontSize: 10,
    fontWeight: '500',
  },
  goldNavigation: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 34,
    boxShadow:
      '0 14px 32px rgba(235, 216, 170, 0.06), 0 5px 14px rgba(248, 238, 211, 0.05)',
    elevation: 20,
    paddingBottom: 7,
    paddingHorizontal: 6,
    paddingTop: 7,
    shadowColor: '#F3E6C8',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  item: {
    alignItems: 'center',
    borderRadius: 26,
    flex: 1,
    gap: 2,
    height: 53,
    justifyContent: 'center',
  },
  navigation: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    bottom: 12,
    flexDirection: 'row',
    elevation: 12,
    left: 16,
    padding: 5,
    position: 'absolute',
    right: 16,
    shadowColor: '#222222',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    zIndex: 1000,
  },
});
