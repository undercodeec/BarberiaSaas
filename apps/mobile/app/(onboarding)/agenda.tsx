import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  ClientsResponse,
  CurrentOrganizationResponse,
  OnboardingAccountDetailsResponse,
  SchedulesResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function mondayOfWeek(date: Date): Date {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function sameDate(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function calendarDateForTimeZone(timeZone: string): Date {
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

function daysInMonth(date: Date): Date[] {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const numberOfDays = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  return Array.from({ length: numberOfDays }, (_, index) =>
    addDays(firstDay, index),
  );
}

function calendarGrid(date: Date): ReadonlyArray<Date | null> {
  const monthDays = daysInMonth(date);
  const firstWeekday = monthDays[0]?.getDay() ?? 1;
  const leadingDays = firstWeekday === 0 ? 6 : firstWeekday - 1;
  return [...Array<Date | null>(leadingDays).fill(null), ...monthDays];
}

function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  return (
    String(hours).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
  );
}

function minuteForTime(value: string | null | undefined): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours === undefined || minutes === undefined
    ? null
    : hours * 60 + minutes;
}

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

function timelineMinutes(
  schedules: ReadonlyArray<{
    readonly endMinute: number;
    readonly startMinute: number;
  }>,
): number[] {
  const times = new Set<number>();
  for (const schedule of schedules) {
    for (
      let minute = schedule.startMinute;
      minute < schedule.endMinute;
      minute += 60
    )
      times.add(minute);
    times.add(schedule.endMinute);
  }
  return [...times].sort((first, second) => first - second);
}

export default function AgendaScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const organizationQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentOrganizationResponse>(
        '/v1/organizations/current',
      ),
    queryKey: ['current-organization'],
  });
  const schedulesQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<SchedulesResponse>('/v1/schedules'),
    queryKey: ['schedules'],
  });
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: ['clients'],
  });
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details'],
  });
  const timeZone =
    organizationQuery.data?.location?.timezone ??
    organizationQuery.data?.organization?.defaultTimezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC';
  const today = useMemo(() => calendarDateForTimeZone(timeZone), [timeZone]);
  const [selectedDay, setSelectedDay] = useState(today);
  const weekDays = useMemo(() => {
    const monday = mondayOfWeek(selectedDay);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, [selectedDay]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(today);
  const dayContentOpacity = useRef(new Animated.Value(1)).current;
  const schedulePageSlide = useRef(new Animated.Value(0)).current;
  const isDayTransitioning = useRef(false);
  const moveSelectedDay = useCallback(
    (offset: number) => {
      if (isDayTransitioning.current) return;
      isDayTransitioning.current = true;
      const direction = offset > 0 ? 1 : -1;
      const nextDay = addDays(selectedDay, offset);
      schedulePageSlide.setValue(direction * 42);
      dayContentOpacity.setValue(0.68);
      setSelectedDay(nextDay);
      setCalendarMonth(nextDay);
      Animated.parallel([
        Animated.timing(schedulePageSlide, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(dayContentOpacity, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isDayTransitioning.current = false;
      });
    },
    [dayContentOpacity, schedulePageSlide, selectedDay],
  );
  const dayPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= -42) moveSelectedDay(1);
          if (gesture.dx >= 42) moveSelectedDay(-1);
        },
      }),
    [moveSelectedDay],
  );
  const timelinePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          if (!isDayTransitioning.current) {
            schedulePageSlide.setValue(gesture.dx);
            dayContentOpacity.setValue(
              Math.max(0.55, 1 - Math.abs(gesture.dx) / 420),
            );
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= -52) {
            moveSelectedDay(1);
            return;
          }
          if (gesture.dx >= 52) {
            moveSelectedDay(-1);
            return;
          }
          Animated.parallel([
            Animated.spring(schedulePageSlide, {
              bounciness: 0,
              speed: 18,
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.timing(dayContentOpacity, {
              duration: 150,
              toValue: 1,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [dayContentOpacity, moveSelectedDay, schedulePageSlide],
  );
  const monthDays = useMemo(() => calendarGrid(calendarMonth), [calendarMonth]);
  const selectedDaySchedules = useMemo(
    () =>
      (schedulesQuery.data?.schedules ?? []).filter(
        (schedule) => schedule.weekday === selectedDay.getDay(),
      ),
    [schedulesQuery.data?.schedules, selectedDay],
  );
  const businessHoursTimeline = useMemo(() => {
    const startMinute = minuteForTime(accountQuery.data?.openingTime);
    const endMinute = minuteForTime(accountQuery.data?.closingTime);
    if (
      startMinute === null ||
      endMinute === null ||
      startMinute >= endMinute
    ) {
      return [];
    }
    return timelineMinutes([{ endMinute, startMinute }]);
  }, [accountQuery.data?.closingTime, accountQuery.data?.openingTime]);
  const configuredTimeline = useMemo(
    () =>
      selectedDaySchedules.length
        ? timelineMinutes(selectedDaySchedules)
        : businessHoursTimeline,
    [businessHoursTimeline, selectedDaySchedules],
  );

  useEffect(() => {
    setSelectedDay(today);
    setCalendarMonth(today);
  }, [today]);

  if (!session) return <Redirect href="/(auth)/login" />;

  const selectedLabel = selectedDay.toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Tu calendario</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Agenda
          </Text>
          <Text style={styles.date}>{selectedLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel="Filtrar agenda"
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              'Filtros',
              'Los filtros estaran disponibles proximamente.',
            )
          }
          style={styles.filterButton}
        >
          <Ionicons color="#111318" name="options-outline" size={22} />
        </Pressable>
      </View>

      <View style={styles.viewControls}>
        <Pressable
          accessibilityLabel="Dia anterior"
          accessibilityRole="button"
          onPress={() => moveSelectedDay(-1)}
          style={styles.viewControl}
        >
          <Ionicons color="#111318" name="chevron-back" size={18} />
        </Pressable>
        <Pressable
          accessibilityLabel="Abrir calendario"
          accessibilityRole="button"
          onPress={() => setIsCalendarOpen(true)}
          style={styles.weekPill}
        >
          <Ionicons color="#111318" name="calendar-outline" size={17} />
        </Pressable>
        <Pressable
          accessibilityLabel="Dia siguiente"
          accessibilityRole="button"
          onPress={() => moveSelectedDay(1)}
          style={styles.viewControl}
        >
          <Ionicons color="#111318" name="chevron-forward" size={18} />
        </Pressable>
      </View>

      <View {...dayPanResponder.panHandlers} style={styles.calendarSection}>
        <View style={styles.weekSelector}>
          {weekDays.map((day) => {
            const isSelected = sameDate(day, selectedDay);
            const isToday = sameDate(day, today);
            return (
              <Pressable
                accessibilityLabel={day.toLocaleDateString('es-EC', {
                  day: 'numeric',
                  month: 'long',
                  weekday: 'long',
                })}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={day.toISOString()}
                onPress={() => {
                  setSelectedDay(day);
                  setCalendarMonth(day);
                }}
                style={[
                  styles.dayButton,
                  isSelected && styles.dayButtonSelected,
                ]}
              >
                <Text
                  style={[styles.dayName, isSelected && styles.dayNameSelected]}
                >
                  {day
                    .toLocaleDateString('es-EC', { weekday: 'short' })
                    .replace('.', '')
                    .slice(0, 3)
                    .toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    isSelected && styles.dayNumberSelected,
                    isToday && !isSelected && styles.dayNumberToday,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryValue}>Sin citas</Text>
          <Text style={styles.summaryLabel}>para este dia</Text>
        </View>
        <View style={styles.availability}>
          <View style={styles.availabilityRing}>
            <Ionicons color="#111318" name="checkmark" size={22} />
          </View>
          <View>
            <Text style={styles.availabilityLabel}>Agenda disponible</Text>
            <Text style={styles.availabilityCopy}>
              Sin reservas registradas
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.timelineWrapper}>
        <AnimatedScrollView
          {...timelinePanResponder.panHandlers}
          contentContainerStyle={[
            styles.timelineContent,
            {
              opacity: dayContentOpacity,
              transform: [{ translateX: schedulePageSlide }],
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.timelineHeader}>
            <Text style={styles.timelineTitle}>Horario del dia</Text>
          </View>
          <View style={styles.timeline}>
            {configuredTimeline.length ? (
              configuredTimeline.map((minute) => (
                <View key={minute} style={styles.hourRow}>
                  <Text style={styles.hour}>{formatMinute(minute)}</Text>
                  <View style={styles.hourContent}>
                    <View style={styles.hourDivider} />
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptySchedule}>
                No hay horarios de atenci?n configurados para este dia.
              </Text>
            )}
          </View>
        </AnimatedScrollView>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsCalendarOpen(false)}
        transparent
        visible={isCalendarOpen}
      >
        <View style={styles.calendarModalBackdrop}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarModalHeader}>
              <Pressable
                accessibilityLabel="Mes anterior"
                accessibilityRole="button"
                onPress={() =>
                  setCalendarMonth(
                    (month) =>
                      new Date(
                        month.getFullYear(),
                        month.getMonth() - 1,
                        1,
                        12,
                      ),
                  )
                }
                style={styles.monthControl}
              >
                <Ionicons color="#111318" name="chevron-back" size={22} />
              </Pressable>
              <Text style={styles.calendarMonthLabel}>
                {calendarMonth.toLocaleDateString('es-EC', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <Pressable
                accessibilityLabel="Mes siguiente"
                accessibilityRole="button"
                onPress={() =>
                  setCalendarMonth(
                    (month) =>
                      new Date(
                        month.getFullYear(),
                        month.getMonth() + 1,
                        1,
                        12,
                      ),
                  )
                }
                style={styles.monthControl}
              >
                <Ionicons color="#111318" name="chevron-forward" size={22} />
              </Pressable>
            </View>
            <View style={styles.monthWeekdays}>
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((weekday) => (
                <Text key={weekday} style={styles.monthWeekday}>
                  {weekday}
                </Text>
              ))}
            </View>
            <View style={styles.monthGrid}>
              {monthDays.map((day, index) => {
                if (!day)
                  return (
                    <View key={'blank-' + index} style={styles.monthDate} />
                  );
                const isSelected = sameDate(day, selectedDay);
                const isToday = sameDate(day, today);
                return (
                  <Pressable
                    accessibilityLabel={day.toLocaleDateString('es-EC', {
                      day: 'numeric',
                      month: 'long',
                      weekday: 'long',
                    })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={day.toISOString()}
                    onPress={() => {
                      setSelectedDay(day);
                      setIsCalendarOpen(false);
                    }}
                    style={[
                      styles.monthDate,
                      isSelected && styles.monthDateSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthDateLabel,
                        isSelected && styles.monthDateLabelSelected,
                        isToday && !isSelected && styles.monthDateToday,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsCalendarOpen(false)}
              style={styles.calendarClose}
            >
              <Text style={styles.calendarCloseLabel}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Pressable
        accessibilityLabel="Crear cita"
        accessibilityRole="button"
        onPress={() => {
          if (
            clientsQuery.isLoading ||
            clientsQuery.isError ||
            !clientsQuery.data?.clients.length
          ) {
            router.push('/equipo');
            return;
          }
          Alert.alert(
            'Nueva cita',
            'La creacion de reservas se conectara en el siguiente paso.',
          );
        }}
        style={styles.floatingButton}
      >
        <Ionicons color="#ffffff" name="add" size={30} />
        <Text style={styles.floatingLabel}>Nueva cita</Text>
      </Pressable>

      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Inicio"
          accessibilityRole="button"
          onPress={() => router.replace('/dashboard')}
          style={styles.navItem}
        >
          <Ionicons color="#111318" name="home-outline" size={24} />
        </Pressable>
        <Pressable
          accessibilityLabel="Agenda"
          accessibilityRole="button"
          style={[styles.navItem, styles.navActive]}
        >
          <Ionicons color="#ffffff" name="calendar-outline" size={23} />
          <Text style={styles.navActiveLabel}>Agenda</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Caja"
          accessibilityRole="button"
          style={styles.navItem}
        >
          <Ionicons color="#111318" name="receipt-outline" size={24} />
        </Pressable>
        <Pressable
          accessibilityLabel="Equipo"
          accessibilityRole="button"
          onPress={() => router.push('/equipo')}
          style={styles.navItem}
        >
          <Ionicons color="#111318" name="people-outline" size={24} />
        </Pressable>
        <Pressable
          accessibilityLabel="Ajustes"
          accessibilityRole="button"
          style={styles.navItem}
        >
          <Ionicons color="#111318" name="settings-outline" size={24} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  availability: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  availabilityCopy: { color: '#666666', fontSize: 12, marginTop: 2 },
  availabilityLabel: { color: '#111318', fontSize: 13, fontWeight: '800' },
  availabilityRing: {
    alignItems: 'center',
    borderColor: '#111318',
    borderRadius: 26,
    borderWidth: 4,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  date: {
    color: '#5f5f5f',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 3,
    textTransform: 'capitalize',
  },
  dayButton: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 65,
  },
  dayButtonSelected: {
    backgroundColor: '#ffffff',
    shadowColor: '#111318',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 10,
  },
  dayName: { color: '#767676', fontSize: 10, fontWeight: '800' },
  dayNameSelected: { color: '#111318' },
  dayNumber: { color: '#111318', fontSize: 17, fontWeight: '900' },
  dayNumberSelected: { color: '#111318' },
  dayNumberToday: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  eyebrow: {
    color: '#111318',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dedede',
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: '#111318',
    borderRadius: 28,
    bottom: 94,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 15,
    position: 'absolute',
    right: 20,
    shadowColor: '#111318',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  floatingLabel: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  hour: {
    color: '#7a7a7a',
    fontSize: 12,
    fontWeight: '800',
    paddingTop: 1,
    width: 50,
  },
  hourContent: { flex: 1, minHeight: 89, paddingLeft: 10 },
  hourDivider: {
    borderStyle: 'dashed',
    borderTopColor: '#dddddd',
    borderTopWidth: 1,
    height: 1,
    marginBottom: 9,
  },
  hourRow: { flexDirection: 'row' },
  navActive: { backgroundColor: '#17191d' },
  navActiveLabel: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  navItem: {
    alignItems: 'center',
    borderRadius: 26,
    flex: 1,
    gap: 2,
    height: 53,
    justifyContent: 'center',
  },
  navigation: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e1e1e1',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 17,
    flexDirection: 'row',
    left: 16,
    padding: 5,
    position: 'absolute',
    right: 16,
    shadowColor: '#222222',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  screen: { backgroundColor: '#f8f8f7', flex: 1 },
  summary: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e3e3e3',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
  },
  summaryLabel: { color: '#737373', fontSize: 13, marginTop: 2 },
  summaryValue: { color: '#111318', fontSize: 21, fontWeight: '900' },
  timeline: { marginTop: 13, position: 'relative' },
  timelineWrapper: { flex: 1 },
  timelineContent: {
    paddingBottom: 132,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  timelineHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineTitle: { color: '#111318', fontSize: 18, fontWeight: '900' },
  title: {
    color: '#111318',
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -1,
  },
  viewControl: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e1e1e1',
    borderRadius: 13,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  viewControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginHorizontal: 22,
    marginTop: -36,
  },
  weekPill: {
    alignItems: 'center',
    backgroundColor: '#ececea',
    borderRadius: 13,
    flexDirection: 'row',
    height: 36,
    justifyContent: 'center',
    width: 42,
  },
  calendarClose: {
    alignItems: 'center',
    backgroundColor: '#111318',
    borderRadius: 14,
    marginTop: 18,
    paddingVertical: 13,
  },
  calendarCloseLabel: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  calendarModal: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    marginHorizontal: 20,
    padding: 20,
    shadowColor: '#111318',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    width: '100%',
  },
  calendarModalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 19, 24, 0.42)',
    flex: 1,
    justifyContent: 'center',
  },
  calendarModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarMonthLabel: {
    color: '#111318',
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  calendarSection: { marginHorizontal: 20, marginTop: 20 },
  emptySchedule: { color: '#767676', fontSize: 14, paddingVertical: 22 },
  monthControl: {
    alignItems: 'center',
    backgroundColor: '#f1f1ef',
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  monthDate: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: '14.2857%',
  },
  monthDateLabel: { color: '#111318', fontSize: 14, fontWeight: '700' },
  monthDateLabelSelected: { color: '#ffffff' },
  monthDateSelected: { backgroundColor: '#111318', borderRadius: 14 },
  monthDateToday: { color: '#2464e8', textDecorationLine: 'underline' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  monthWeekday: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    width: '14.2857%',
  },
  monthWeekdays: { flexDirection: 'row', marginTop: 22 },
  weekSelector: {
    backgroundColor: '#ececea',
    borderRadius: 23,
    flexDirection: 'row',
    padding: 6,
  },
});
