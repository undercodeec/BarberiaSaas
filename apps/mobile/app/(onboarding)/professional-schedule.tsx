import Ionicons from '@expo/vector-icons/Ionicons';
import type { SchedulesResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { requireApiClient } from '../../src/lib/api';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

const DAYS = [
  ['Lunes', 1],
  ['Martes', 2],
  ['Miércoles', 3],
  ['Jueves', 4],
  ['Viernes', 5],
  ['Sábado', 6],
  ['Domingo', 0],
] as const;

type Interval = {
  readonly endMinute: number;
  readonly startMinute: number;
  readonly weekday: number;
};

function timeForMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(
    minute % 60,
  ).padStart(2, '0')}`;
}

function minuteForTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export default function ProfessionalScheduleScreen() {
  const router = useRouter();
  const layout = useNativeLayoutMetrics();
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const { session } = useAuth();
  const { locationId, locationName, membershipId, professionalName } =
    useLocalSearchParams<{
      locationId?: string;
      locationName?: string;
      membershipId?: string;
      professionalName?: string;
    }>();
  const selectedLocationId = Array.isArray(locationId)
    ? locationId[0]
    : locationId;
  const selectedMembershipId = Array.isArray(membershipId)
    ? membershipId[0]
    : membershipId;
  const [draft, setDraft] = useState<Interval[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schedulesQuery = useQuery({
    enabled: Boolean(session && selectedLocationId && selectedMembershipId),
    queryFn: () =>
      requireApiClient().request<SchedulesResponse>('/v1/schedules'),
    queryKey: tenant.key('schedules'),
  });
  const saved = useMemo(
    () =>
      (schedulesQuery.data?.schedules ?? [])
        .filter(
          (schedule) =>
            schedule.locationId === selectedLocationId &&
            schedule.membershipId === selectedMembershipId,
        )
        .map(({ endMinute, startMinute, weekday }) => ({
          endMinute,
          startMinute,
          weekday,
        })),
    [selectedLocationId, selectedMembershipId, schedulesQuery.data?.schedules],
  );

  const effectiveDraft = draft ?? saved;

  const saveMutation = useMutation({
    mutationFn: (schedules: readonly Interval[]) =>
      requireApiClient().request('/v1/schedules', {
        body: {
          locationId: selectedLocationId,
          membershipId: selectedMembershipId,
          schedules,
        },
        method: 'PUT',
      }),
    onError: (requestError) =>
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible guardar el horario.',
      ),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('schedules'),
      });
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('availability'),
      });
      Alert.alert('Horario guardado', 'La disponibilidad ya se actualizó.');
    },
  });

  const intervalForDay = (weekday: number) =>
    effectiveDraft.find((interval) => interval.weekday === weekday) ?? null;
  const toggleDay = (weekday: number) => {
    setDraft((current) => {
      const source = current ?? saved;
      const exists = source.some((interval) => interval.weekday === weekday);
      return exists
        ? source.filter((interval) => interval.weekday !== weekday)
        : [...source, { endMinute: 1080, startMinute: 540, weekday }];
    });
  };
  const updateTime = (
    weekday: number,
    field: 'startMinute' | 'endMinute',
    value: string,
  ) => {
    const minute = minuteForTime(value);
    if (minute === null) return;
    setDraft((current) =>
      (current ?? saved).map((interval) =>
        interval.weekday === weekday
          ? { ...interval, [field]: minute }
          : interval,
      ),
    );
  };
  const save = () => {
    if (!selectedLocationId || !selectedMembershipId) return;
    if (
      effectiveDraft.some(
        (interval) => interval.startMinute >= interval.endMinute,
      )
    ) {
      setError(
        'La hora de inicio debe ser anterior a la hora de finalización.',
      );
      return;
    }
    setError(null);
    saveMutation.mutate(effectiveDraft);
  };

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!selectedLocationId || !selectedMembershipId)
    return <Redirect href="/team-management" />;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={25}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Horario profesional</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {professionalName ?? 'Profesional'} · {locationName ?? 'Sucursal'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomInset + 34 },
        ]}
      >
        <View style={styles.notice}>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="information-circle-outline"
            size={22}
          />
          <Text style={styles.noticeText}>
            Este horario pertenece solo a esta sucursal. Desactiva un día para
            quitar su disponibilidad aquí sin cambiar las demás sucursales.
          </Text>
        </View>

        {schedulesQuery.isPending ? (
          <View style={styles.state}>
            <ActivityIndicator color={appTheme.colors.accent} />
            <Text style={styles.subtitle}>Cargando horario…</Text>
          </View>
        ) : null}
        {schedulesQuery.isError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>No pudimos cargar el horario.</Text>
            <Pressable onPress={() => schedulesQuery.refetch()}>
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
        {!schedulesQuery.isPending && !schedulesQuery.isError
          ? DAYS.map(([name, weekday]) => {
              const interval = intervalForDay(weekday);
              return (
                <View key={weekday} style={styles.dayCard}>
                  <Pressable
                    accessibilityLabel={`${interval ? 'Desactivar' : 'Activar'} ${name}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: Boolean(interval) }}
                    onPress={() => toggleDay(weekday)}
                    style={styles.dayHeader}
                  >
                    <Ionicons
                      color={interval ? appTheme.colors.accentDark : '#8b94a1'}
                      name={interval ? 'checkbox' : 'square-outline'}
                      size={23}
                    />
                    <Text style={styles.dayName}>{name}</Text>
                  </Pressable>
                  {interval ? (
                    <View style={styles.timeRow}>
                      <View style={styles.timeField}>
                        <Text style={styles.timeLabel}>Desde</Text>
                        <TextInput
                          accessibilityLabel={`Hora de inicio ${name}`}
                          defaultValue={timeForMinute(interval.startMinute)}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                          onEndEditing={(event) =>
                            updateTime(
                              weekday,
                              'startMinute',
                              event.nativeEvent.text,
                            )
                          }
                          placeholder="09:00"
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.timeField}>
                        <Text style={styles.timeLabel}>Hasta</Text>
                        <TextInput
                          accessibilityLabel={`Hora de finalización ${name}`}
                          defaultValue={timeForMinute(interval.endMinute)}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                          onEndEditing={(event) =>
                            updateTime(
                              weekday,
                              'endMinute',
                              event.nativeEvent.text,
                            )
                          }
                          placeholder="18:00"
                          style={styles.input}
                        />
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.closed}>Sin disponibilidad</Text>
                  )}
                </View>
              );
            })
          : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityLabel="Guardar horario profesional"
          accessibilityRole="button"
          disabled={saveMutation.isPending || schedulesQuery.isPending}
          onPress={save}
          style={[
            styles.saveButton,
            (saveMutation.isPending || schedulesQuery.isPending) &&
              styles.disabled,
          ]}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={appTheme.colors.accentDark} />
          ) : (
            <Text style={styles.saveText}>Guardar horario</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: { padding: 6 },
  closed: { color: '#737c89', fontSize: 13, marginLeft: 31 },
  content: { gap: 12, padding: 18 },
  dayCard: {
    backgroundColor: '#fff',
    borderColor: '#e4e2dc',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  dayHeader: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  dayName: { color: '#1e2633', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  errorCard: {
    backgroundColor: '#fff3f1',
    borderRadius: 12,
    gap: 6,
    padding: 14,
  },
  errorText: { color: '#b42318', fontSize: 13, lineHeight: 19 },
  header: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#e4e2dc',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  headerCopy: { flex: 1 },
  input: {
    backgroundColor: '#f7f6f2',
    borderColor: '#e4e2dc',
    borderRadius: 9,
    borderWidth: 1,
    color: '#1e2633',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: '#fdf5d8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    padding: 13,
  },
  noticeText: { color: '#5a4a16', flex: 1, fontSize: 13, lineHeight: 19 },
  retry: { color: appTheme.colors.accentDark, fontWeight: '800' },
  saveButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
    ...goldButtonShadow,
  },
  saveText: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  screen: { backgroundColor: '#f7f6f2', flex: 1 },
  state: { alignItems: 'center', gap: 9, padding: 28 },
  subtitle: { color: '#737c89', fontSize: 13 },
  timeField: { flex: 1, gap: 5 },
  timeLabel: { color: '#737c89', fontSize: 12, fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 10, marginLeft: 31 },
  title: { color: '#1e2633', fontSize: 18, fontWeight: '900' },
});
