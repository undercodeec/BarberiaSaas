import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type NavigationTab = 'agenda' | 'cash' | 'clients' | 'dashboard' | 'settings';

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
            {isGold && selected ? <View style={styles.goldIndicator} /> : null}
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
    borderColor: '#E4E1DA',
    borderRadius: 34,
    bottom: 14,
    paddingBottom: 7,
    paddingHorizontal: 6,
    paddingTop: 7,
    shadowColor: '#956816',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.12,
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
    borderColor: '#E1E1E1',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 17,
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
