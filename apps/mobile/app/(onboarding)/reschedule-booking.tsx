import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppointmentRecord } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appTheme,
  goldButtonShadow,
  goldShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { availabilityQueryOptions } from '../../src/features/agenda/agenda-queries';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

function localDateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function dateInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(value('year'), value('month') - 1, value('day'), 12);
}

export default function RescheduleBookingScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const router = useRouter();
  const queryClient = useQueryClient();
  const layout = useNativeLayoutMetrics();
  const {
    appointmentId,
    membershipId,
    serviceIds: rawServiceIds,
  } = useLocalSearchParams<{
    appointmentId: string;
    membershipId: string;
    serviceIds: string;
  }>();
  const serviceIds = useMemo(
    () => (rawServiceIds ?? '').split(',').filter(Boolean),
    [rawServiceIds],
  );
  const organizationQuery = useCurrentOrganization();
  const [selectedDateValue, setSelectedDateValue] = useState<string | null>(
    null,
  );
  const timeZone =
    organizationQuery.data?.location?.timezone ??
    organizationQuery.data?.organization?.defaultTimezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC';
  const dates = useMemo(() => {
    const start = dateInTimeZone(timeZone);
    return Array.from({ length: 21 }, (_, index) => {
      const value = new Date(start);
      value.setDate(start.getDate() + index);
      return value;
    });
  }, [timeZone]);
  const date =
    dates.find(
      (candidate) => localDateValue(candidate) === selectedDateValue,
    ) ?? dates[0]!;
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const locationId = organizationQuery.data?.location?.id ?? null;
  const availabilityQuery = useQuery({
    enabled: Boolean(locationId && membershipId && serviceIds.length),
    ...availabilityQueryOptions(requireApiClient(), tenant.scope, {
      date: localDateValue(date),
      locationId: locationId ?? '',
      membershipId,
      serviceIds,
    }),
  });
  const reschedule = useMutation({
    mutationFn: () =>
      requireApiClient().request<{ appointment: AppointmentRecord }>(
        `/v1/appointments/${appointmentId}/reschedule`,
        { body: { startsAt }, method: 'PATCH' },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos reprogramar',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('agenda-appointments'),
      });
      Alert.alert('Cita reprogramada', 'El nuevo horario quedó reservado.', [
        { onPress: () => router.replace('/agenda'), text: 'Ver Agenda' },
      ]);
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver a agenda"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/agenda')
          }
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons color={appTheme.colors.icon} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>AGENDA</Text>
          <Text style={styles.headerTitle}>Reprogramar cita</Text>
        </View>
        <View style={styles.spacer} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 100 + layout.bottomActionPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons
              color={appTheme.colors.accentActive}
              name="calendar-outline"
              size={22}
            />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.title}>Elige un nuevo horario</Text>
            <Text style={styles.copy}>
              Tu cita actual se mantiene reservada hasta confirmar el cambio.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Selecciona una fecha</Text>
            <Text style={styles.sectionCaption}>
              Disponibilidad de los próximos 21 días
            </Text>
          </View>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>
              {date
                .toLocaleDateString('es-EC', {
                  day: 'numeric',
                  month: 'short',
                })
                .replace('.', '')}
            </Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.dateRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {dates.map((item) => {
            const selected = localDateValue(item) === localDateValue(date);
            return (
              <Pressable
                key={localDateValue(item)}
                onPress={() => {
                  setSelectedDateValue(localDateValue(item));
                  setStartsAt(null);
                }}
                style={({ pressed }) => [
                  styles.date,
                  selected && styles.selectedDate,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.day, selected && styles.selectedText]}>
                  {item
                    .toLocaleDateString('es-EC', { weekday: 'short' })
                    .replace('.', '')}
                </Text>
                <Text style={[styles.number, selected && styles.selectedText]}>
                  {item.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.slotsHeading}>
          <View style={styles.slotsHeadingTitle}>
            <Ionicons
              color={appTheme.colors.accentActive}
              name="time-outline"
              size={19}
            />
            <Text style={styles.sectionTitle}>Horarios disponibles</Text>
          </View>
          <Text style={styles.slotCount}>
            {availabilityQuery.data?.slots.length ?? 0} disponibles
          </Text>
        </View>
        {availabilityQuery.isLoading ? (
          <View style={styles.statusCard}>
            <Ionicons
              color={appTheme.colors.accentActive}
              name="hourglass-outline"
              size={20}
            />
            <Text style={styles.statusText}>Consultando disponibilidad...</Text>
          </View>
        ) : null}
        <View style={styles.slots}>
          {(availabilityQuery.data?.slots ?? []).map((slot) => (
            <Pressable
              key={slot.startsAt}
              onPress={() => setStartsAt(slot.startsAt)}
              style={({ pressed }) => [
                styles.slot,
                startsAt === slot.startsAt && styles.selectedSlot,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={
                  startsAt === slot.startsAt
                    ? appTheme.colors.white
                    : appTheme.colors.accentActive
                }
                name="time-outline"
                size={16}
              />
              <Text
                style={[
                  styles.slotText,
                  startsAt === slot.startsAt && styles.selectedText,
                ]}
              >
                {new Date(slot.startsAt).toLocaleTimeString('es-EC', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone,
                })}
              </Text>
            </Pressable>
          ))}
        </View>
        {!availabilityQuery.isLoading &&
        !(availabilityQuery.data?.slots.length ?? 0) ? (
          <View style={styles.statusCard}>
            <Ionicons
              color={appTheme.colors.textMuted}
              name="calendar-clear-outline"
              size={21}
            />
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle}>Sin horarios para este día</Text>
              <Text style={styles.statusText}>
                Prueba seleccionando otra fecha.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View
        style={[styles.footer, { paddingBottom: layout.bottomActionPadding }]}
      >
        <Pressable
          disabled={!startsAt || reschedule.isPending}
          onPress={() => reschedule.mutate()}
          style={({ pressed }) => [
            styles.action,
            (!startsAt || reschedule.isPending) && styles.disabled,
            pressed &&
              Boolean(startsAt) &&
              !reschedule.isPending &&
              styles.actionPressed,
          ]}
        >
          <Ionicons
            color={appTheme.colors.white}
            name="checkmark-circle-outline"
            size={20}
          />
          <Text style={styles.actionText}>
            {reschedule.isPending ? 'Reprogramando...' : 'Confirmar cambio'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 56,
    ...goldButtonShadow,
  },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  actionPressed: { backgroundColor: appTheme.colors.accentActive },
  back: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: { gap: 20, padding: appTheme.spacing.page },
  copy: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  date: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    minWidth: 66,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  dateBadge: {
    backgroundColor: appTheme.colors.accentSubtle,
    borderRadius: appTheme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateBadgeText: {
    color: appTheme.colors.accentActive,
    fontSize: 12,
    fontWeight: '900',
  },
  dateRow: { gap: 10, paddingRight: 24 },
  day: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  disabled: { opacity: 0.45 },
  footer: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: appTheme.spacing.page,
    paddingTop: 16,
    position: 'absolute',
    right: 0,
  },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: appTheme.spacing.page,
    paddingVertical: 14,
  },
  headerCopy: { alignItems: 'center', flex: 1 },
  headerEyebrow: {
    color: appTheme.colors.accentActive,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  headerTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 1,
  },
  introCard: {
    alignItems: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    ...goldShadow,
  },
  introCopy: { flex: 1 },
  introIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentSubtle,
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  number: {
    color: appTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  pressed: { opacity: 0.84 },
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
  sectionCaption: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  selectedDate: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  selectedSlot: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  selectedText: { color: appTheme.colors.white },
  slot: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minWidth: '31%',
    paddingHorizontal: 8,
    paddingVertical: 13,
  },
  slotCount: {
    color: appTheme.colors.accentActive,
    fontSize: 12,
    fontWeight: '800',
  },
  slotText: { color: appTheme.colors.text, fontSize: 13, fontWeight: '800' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slotsHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  slotsHeadingTitle: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  spacer: { width: 44 },
  statusCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    justifyContent: 'center',
    minHeight: 72,
    padding: 16,
  },
  statusCopy: { flex: 1 },
  statusText: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  statusTitle: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
});
