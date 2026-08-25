import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  AppointmentsResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  goldShadow,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { InlineMessage } from '../../src/components/InlineMessage';
import {
  addDays,
  calendarDateForTimeZone,
} from '../../src/features/screens/agenda-model';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

type WaitlistTab = 'pending' | 'accepted' | 'rejected';

const tabs: ReadonlyArray<{
  readonly label: string;
  readonly value: WaitlistTab;
}> = [
  { label: 'Pendientes', value: 'pending' },
  { label: 'Aceptados', value: 'accepted' },
  { label: 'Rechazados', value: 'rejected' },
];

const emptyCopy: Record<WaitlistTab, string> = {
  accepted: 'Las solicitudes aceptadas aparecerán aquí.',
  pending: 'No hay solicitudes pendientes por revisar.',
  rejected: 'Las solicitudes rechazadas aparecerán aquí.',
};

function localDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function waitlistTabFor(
  status: AppointmentRecord['status'],
): WaitlistTab | null {
  if (status === 'waiting') return 'pending';
  if (status === 'cancelled') return 'rejected';
  if (status === 'confirmed' || status === 'scheduled') return 'accepted';
  return null;
}

function appointmentDate(value: string) {
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

export default function WaitlistScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const router = useRouter();
  const organizationQuery = useCurrentOrganization();
  const [activeTab, setActiveTab] = useState<WaitlistTab>('pending');
  const [search, setSearch] = useState('');
  const location = organizationQuery.data?.location;
  const period = useMemo(() => {
    if (!location) return null;
    const from = calendarDateForTimeZone(location.timezone);
    return { from: localDate(from), to: localDate(addDays(from, 30)) };
  }, [location]);
  const waitlistQuery = useQuery({
    enabled: Boolean(session && location && period),
    queryFn: async () => {
      if (!location || !period) return [];
      const params = new URLSearchParams({
        from: period.from,
        locationId: location.id,
        to: period.to,
      });
      const result = await requireApiClient().request<AppointmentsResponse>(
        `/v1/appointments?${params.toString()}`,
      );
      return result.appointments;
    },
    queryKey: tenant.key(
      'waitlist-appointments',
      location?.id ?? 'none',
      period?.from ?? 'none',
      period?.to ?? 'none',
    ),
    refetchInterval: 30_000,
    refetchOnMount: 'always',
  });
  const activeLabel = useMemo(
    () => tabs.find((tab) => tab.value === activeTab)?.label ?? 'Pendientes',
    [activeTab],
  );
  const appointments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-EC');
    return (waitlistQuery.data ?? []).filter((appointment) => {
      if (waitlistTabFor(appointment.status) !== activeTab) return false;
      if (!term) return true;
      const text = [
        appointment.clientName,
        appointment.clientPhone ?? '',
        ...appointment.services.map((service) => service.serviceName),
      ]
        .join(' ')
        .toLocaleLowerCase('es-EC');
      return text.includes(term);
    });
  }, [activeTab, search, waitlistQuery.data]);

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver a agenda"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/dashboard')
          }
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="chevron-back"
            size={23}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Lista de espera
          </Text>
          <Text style={styles.subtitle}>
            Solicitudes de reserva de tus clientes
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.searchLabel}>Buscar solicitud</Text>
        <View style={styles.searchBox}>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="search-outline"
            size={21}
          />
          <TextInput
            accessibilityLabel="Buscar en lista de espera"
            onChangeText={setSearch}
            placeholder="Buscar cliente"
            placeholderTextColor={appTheme.colors.textMuted}
            style={styles.searchInput}
            value={search}
          />
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.value;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={tab.value}
                onPress={() => setActiveTab(tab.value)}
                style={[styles.tab, selected && styles.tabActive]}
              >
                <Text
                  style={[styles.tabLabel, selected && styles.tabLabelActive]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.periodLabel}>
          Solicitudes desde hoy hasta los próximos 30 días
        </Text>

        {waitlistQuery.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator
              color={appTheme.colors.accentDark}
              size="large"
            />
            <Text style={styles.emptyCopy}>Cargando solicitudes…</Text>
          </View>
        ) : null}
        {waitlistQuery.error ? (
          <View style={styles.errorState}>
            <InlineMessage
              message={
                waitlistQuery.error instanceof Error
                  ? waitlistQuery.error.message
                  : 'No pudimos cargar la lista de espera.'
              }
            />
            <Pressable onPress={() => void waitlistQuery.refetch()}>
              <Text style={styles.retryLabel}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
        {!waitlistQuery.isLoading && !waitlistQuery.error ? (
          appointments.length ? (
            <View style={styles.requestList}>
              {appointments.map((appointment) => (
                <View key={appointment.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestCopy}>
                      <Text style={styles.clientName}>
                        {appointment.clientName}
                      </Text>
                      <Text style={styles.requestDate}>
                        {appointmentDate(appointment.startsAt)}
                      </Text>
                    </View>
                    <Ionicons
                      color={appTheme.colors.accentDark}
                      name="calendar-outline"
                      size={22}
                    />
                  </View>
                  <Text style={styles.serviceNames}>
                    {appointment.services
                      .map((service) => service.serviceName)
                      .join(' · ')}
                  </Text>
                  {appointment.clientPhone ? (
                    <Text style={styles.clientPhone}>
                      {appointment.clientPhone}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name="people-outline"
                  size={35}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {search.trim() ? 'Sin resultados' : activeLabel}
              </Text>
              <Text style={styles.emptyCopy}>
                {search.trim()
                  ? 'No encontramos solicitudes que coincidan con tu búsqueda.'
                  : emptyCopy[activeTab]}
              </Text>
            </View>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentLight,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
    ...goldShadow,
  },
  content: { padding: appTheme.spacing.page, paddingBottom: 42 },
  emptyCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 45,
    height: 90,
    justifyContent: 'center',
    width: 90,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    marginTop: 34,
    paddingHorizontal: 30,
    paddingVertical: 34,
    ...goldShadow,
  },
  emptyTitle: {
    color: appTheme.colors.accentDark,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 18,
  },
  errorState: { gap: 12, marginTop: 26 },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    flexDirection: 'row',
    gap: 13,
    paddingHorizontal: appTheme.spacing.page,
    paddingVertical: 18,
  },
  headerCopy: { flex: 1 },
  loadingState: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  periodLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 16,
  },
  requestCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    padding: 16,
    ...goldShadow,
  },
  requestCopy: { flex: 1 },
  requestDate: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    marginTop: 4,
  },
  requestHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  requestList: { gap: 12, marginTop: 16 },
  clientName: { color: appTheme.colors.text, fontSize: 17, fontWeight: '900' },
  clientPhone: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 8 },
  retryLabel: { color: appTheme.colors.accentDark, fontWeight: '900' },
  serviceNames: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 14,
  },
  screen: appStyles.screen,
  searchBox: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 9,
    minHeight: 55,
    paddingHorizontal: 15,
  },
  searchHint: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 15,
    textAlign: 'center',
  },
  searchInput: { color: appTheme.colors.text, flex: 1, fontSize: 15 },
  searchLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 3 },
  tab: {
    alignItems: 'center',
    borderRadius: appTheme.radii.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  tabActive: { backgroundColor: appTheme.colors.accent },
  tabLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  tabLabelActive: { color: appTheme.colors.white },
  tabs: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 26,
    padding: 5,
    ...goldShadow,
  },
  title: {
    color: appTheme.colors.accentDark,
    fontSize: 24,
    fontWeight: '900',
  },
});
