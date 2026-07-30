import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  AvailabilityResponse,
  CurrentOrganizationResponse,
} from '@barber-saas/api-client';
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

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

function localDateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function RescheduleBookingScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
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
  const dates = useMemo(() => {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    return Array.from({ length: 21 }, (_, index) => {
      const value = new Date(start);
      value.setDate(start.getDate() + index);
      return value;
    });
  }, []);
  const [date, setDate] = useState(dates[0]!);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const organizationQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentOrganizationResponse>(
        '/v1/organizations/current',
      ),
    queryKey: ['current-organization'],
  });
  const locationId = organizationQuery.data?.location?.id ?? null;
  const availabilityQuery = useQuery({
    enabled: Boolean(locationId && membershipId && serviceIds.length),
    queryFn: () => {
      const query = new URLSearchParams({
        date: localDateValue(date),
        locationId: locationId!,
        membershipId,
        serviceIds: serviceIds.join(','),
      });
      return requireApiClient().request<AvailabilityResponse>(
        `/v1/availability?${query.toString()}`,
      );
    },
    queryKey: [
      'availability',
      localDateValue(date),
      locationId,
      membershipId,
      serviceIds,
    ],
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
        queryKey: ['agenda-appointments'],
      });
      Alert.alert('Cita reprogramada', 'El nuevo horario quedó reservado.', [
        { onPress: () => router.replace('/agenda'), text: 'Ver Agenda' },
      ]);
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons color="#111827" name="arrow-back" size={23} />
        </Pressable>
        <Text style={styles.headerTitle}>Reprogramar cita</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Elige un nuevo horario</Text>
        <Text style={styles.copy}>
          El horario anterior se conserva hasta que confirmes uno nuevo.
        </Text>
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
                  setDate(item);
                  setStartsAt(null);
                }}
                style={[styles.date, selected && styles.selected]}
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
        <Text style={styles.sectionTitle}>Horarios disponibles</Text>
        {availabilityQuery.isLoading ? (
          <Text style={styles.empty}>Consultando disponibilidad...</Text>
        ) : null}
        <View style={styles.slots}>
          {(availabilityQuery.data?.slots ?? []).map((slot) => (
            <Pressable
              key={slot.startsAt}
              onPress={() => setStartsAt(slot.startsAt)}
              style={[
                styles.slot,
                startsAt === slot.startsAt && styles.selected,
              ]}
            >
              <Text
                style={[
                  styles.slotText,
                  startsAt === slot.startsAt && styles.selectedText,
                ]}
              >
                {new Date(slot.startsAt).toLocaleTimeString('es-EC', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </Pressable>
          ))}
        </View>
        {!availabilityQuery.isLoading &&
        !(availabilityQuery.data?.slots.length ?? 0) ? (
          <Text style={styles.empty}>
            No hay espacios disponibles para esta fecha.
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          disabled={!startsAt || reschedule.isPending}
          onPress={() => reschedule.mutate()}
          style={[
            styles.action,
            (!startsAt || reschedule.isPending) && styles.disabled,
          ]}
        >
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
    backgroundColor: '#111318',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
  },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  back: {
    alignItems: 'center',
    borderColor: '#E2E5EA',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: { padding: 20, paddingBottom: 120 },
  copy: { color: '#667085', lineHeight: 21, marginBottom: 20, marginTop: 7 },
  date: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E5EA',
    borderRadius: 15,
    borderWidth: 1,
    minWidth: 58,
    paddingVertical: 10,
  },
  dateRow: { gap: 8 },
  day: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  disabled: { opacity: 0.35 },
  empty: {
    color: '#687282',
    lineHeight: 21,
    paddingVertical: 20,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#ECEEF1',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  headerTitle: { color: '#111827', fontSize: 16, fontWeight: '900' },
  number: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  screen: { backgroundColor: '#F7F8FA', flex: 1 },
  sectionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 24,
  },
  selected: { backgroundColor: '#111318', borderColor: '#111318' },
  selectedText: { color: '#FFFFFF' },
  slot: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE1E7',
    borderRadius: 12,
    borderWidth: 1,
    minWidth: '30%',
    padding: 12,
  },
  slotText: { color: '#111827', fontSize: 13, fontWeight: '800' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spacer: { width: 40 },
  title: {
    color: '#111827',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
});
