import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { requireApiClient } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type NavigationTab = 'agenda' | 'cash' | 'dashboard' | 'settings' | 'team';

export function BottomNavigation({
  active,
}: {
  readonly active: NavigationTab;
}) {
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
  const isBusiness = accountQuery.data?.accountType === 'business';
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
      label: 'Equipo',
      route: '/team-management',
      value: 'team',
    },
    {
      icon: 'settings-outline',
      label: 'Ajustes',
      route: '/settings',
      value: 'settings',
    },
  ];
  const visibleItems = items.filter(
    (item) => item.value !== 'team' || isBusiness,
  );

  return (
    <View style={styles.navigation}>
      {visibleItems.map((item) => {
        const selected = item.value === active;
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            key={item.value}
            onPress={() => router.replace(item.route as never)}
            style={[styles.item, selected && styles.active]}
          >
            <Ionicons
              color={selected ? '#FFFFFF' : '#111318'}
              name={item.icon}
              size={23}
            />
            {selected ? (
              <Text style={styles.activeLabel}>{item.label}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  active: { backgroundColor: '#17191D' },
  activeLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
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
