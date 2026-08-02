import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  AppointmentsResponse,
  BusinessScheduleResponse,
  ClientsResponse,
  CurrentOrganizationResponse,
  SchedulesResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  Alert,
  Easing,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  BottomNavigation,
  goldShadow,
} from '../../src/components/BottomNavigation';
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

function minuteAtTimeZone(value: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
}

type AgendaView = 'day' | 'month' | 'week';
type AgendaStatusFilter =
  | 'active'
  | 'all'
  | 'completed'
  | 'confirmed'
  | 'in_progress'
  | 'no_show'
  | 'paid'
  | 'scheduled'
  | 'waiting';

function localDateValue(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
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
  const queryClient = useQueryClient();
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
  const businessScheduleQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<BusinessScheduleResponse>(
        '/v1/business-schedule',
      ),
    queryKey: ['business-schedule'],
  });
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: ['clients'],
  });
  const teamQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: ['team'],
  });
  const cancelAppointment = useMutation({
    mutationFn: (appointmentId: string) =>
      requireApiClient().request<{ appointment: AppointmentRecord }>(
        `/v1/appointments/${appointmentId}/cancel`,
        {
          body: { reason: 'Cancelada manualmente desde Agenda.' },
          method: 'POST',
        },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos cancelar la cita',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setSelectedAppointment(null);
      await queryClient.invalidateQueries({
        queryKey: ['agenda-appointments'],
      });
    },
  });
  const manageAppointment = (appointment: AppointmentRecord) => {
    if (
      appointment.status === 'cancelled' ||
      appointment.status === 'completed' ||
      appointment.status === 'no_show'
    ) {
      Alert.alert(
        appointment.clientName,
        'Esta cita ya no ocupa un horario y conserva su historial.',
      );
      return;
    }
    setSelectedAppointment(appointment);
  };
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
  const [isAgendaSettingsOpen, setIsAgendaSettingsOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<AgendaView>('day');
  const [showAllHours, setShowAllHours] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AgendaStatusFilter>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<AppointmentRecord | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(today);
  const [dayContentOpacity] = useState(() => new Animated.Value(1));
  const [schedulePageSlide] = useState(() => new Animated.Value(0));
  const [settingsSheetTranslateY] = useState(() => new Animated.Value(0));
  const [isDayTransitioning, setIsDayTransitioning] = useState(false);
  const dismissAgendaSettings = useCallback(() => {
    Animated.timing(settingsSheetTranslateY, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 520,
      useNativeDriver: true,
    }).start(() => {
      setIsAgendaSettingsOpen(false);
      settingsSheetTranslateY.setValue(0);
    });
  }, [settingsSheetTranslateY]);
  const settingsSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          settingsSheetTranslateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 80) {
            dismissAgendaSettings();
            return;
          }
          Animated.spring(settingsSheetTranslateY, {
            bounciness: 0,
            speed: 18,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dismissAgendaSettings, settingsSheetTranslateY],
  );
  const moveSelectedDay = useCallback(
    (offset: number) => {
      if (isDayTransitioning) return;
      setIsDayTransitioning(true);
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
        setIsDayTransitioning(false);
      });
    },
    [dayContentOpacity, isDayTransitioning, schedulePageSlide, selectedDay],
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
          if (!isDayTransitioning) {
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
    [dayContentOpacity, isDayTransitioning, moveSelectedDay, schedulePageSlide],
  );
  const visibleDates = useMemo(() => {
    if (calendarView === 'day') return [selectedDay];
    if (calendarView === 'week') {
      const monday = mondayOfWeek(selectedDay);
      return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    }
    return daysInMonth(selectedDay);
  }, [calendarView, selectedDay]);
  const locationId = organizationQuery.data?.location?.id;
  const appointmentsQuery = useQuery({
    enabled: Boolean(session && locationId),
    queryFn: async () => {
      const results = await Promise.all(
        visibleDates.map((date) =>
          requireApiClient().request<AppointmentsResponse>(
            `/v1/appointments?date=${localDateValue(date)}&locationId=${locationId}`,
          ),
        ),
      );
      return results.flatMap((result) => result.appointments);
    },
    queryKey: [
      'agenda-appointments',
      calendarView,
      locationId,
      localDateValue(selectedDay),
    ],
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
  });
  const monthDays = useMemo(() => calendarGrid(calendarMonth), [calendarMonth]);
  const selectedDaySchedules = useMemo(
    () =>
      (schedulesQuery.data?.schedules ?? []).filter(
        (schedule) => schedule.weekday === selectedDay.getDay(),
      ),
    [schedulesQuery.data?.schedules, selectedDay],
  );
  const businessHoursTimeline = useMemo(() => {
    const day = businessScheduleQuery.data?.days.find(
      (schedule) => schedule.weekday === selectedDay.getDay(),
    );
    if (!day?.isOpen) return [];
    return timelineMinutes([
      { endMinute: day.endMinute, startMinute: day.startMinute },
    ]);
  }, [businessScheduleQuery.data?.days, selectedDay]);
  const configuredTimeline = useMemo(() => {
    const businessDay = businessScheduleQuery.data?.days.find(
      (schedule) => schedule.weekday === selectedDay.getDay(),
    );
    if (!businessDay?.isOpen) return [];
    if (!selectedDaySchedules.length) return businessHoursTimeline;
    return timelineMinutes(
      selectedDaySchedules
        .map((schedule) => ({
          endMinute: Math.min(schedule.endMinute, businessDay.endMinute),
          startMinute: Math.max(schedule.startMinute, businessDay.startMinute),
        }))
        .filter((schedule) => schedule.startMinute < schedule.endMinute),
    );
  }, [
    businessHoursTimeline,
    businessScheduleQuery.data?.days,
    selectedDay,
    selectedDaySchedules,
  ]);

  const filteredAppointments = useMemo(() => {
    return (appointmentsQuery.data ?? []).filter((appointment) => {
      if (!showCancelled && appointment.status === 'cancelled') return false;
      if (
        selectedMemberId &&
        appointment.professionalMembershipId !== selectedMemberId
      )
        return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active')
        return ['confirmed', 'checked_in', 'in_progress'].includes(
          appointment.status,
        );
      if (statusFilter === 'paid') return appointment.paymentStatus === 'paid';
      return appointment.status === statusFilter;
    });
  }, [appointmentsQuery.data, selectedMemberId, showCancelled, statusFilter]);
  const displayedTimeline = showAllHours
    ? Array.from({ length: 25 }, (_, index) => index * 60)
    : configuredTimeline;

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
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Lista espera"
            accessibilityRole="button"
            onPress={() => router.push('/waitlist')}
            style={styles.filterButton}
          >
            <Ionicons color="#111318" name="list-outline" size={23} />
          </Pressable>
          <Pressable
            accessibilityLabel="Ajustes agenda"
            accessibilityRole="button"
            onPress={() => {
              settingsSheetTranslateY.setValue(0);
              setIsAgendaSettingsOpen(true);
            }}
            style={styles.filterButton}
          >
            <Ionicons color="#111318" name="settings-outline" size={22} />
          </Pressable>
        </View>
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
          <Text style={styles.summaryValue}>
            {filteredAppointments.length} citas
          </Text>
          <Text style={styles.summaryLabel}>en la vista seleccionada</Text>
        </View>
        <View style={styles.availability}>
          <View style={styles.availabilityRing}>
            <Ionicons color="#111318" name="checkmark" size={22} />
          </View>
          <View>
            <Text style={styles.availabilityLabel}>Agenda disponible</Text>
            <Text style={styles.availabilityCopy}>
              {appointmentsQuery.isLoading
                ? 'Cargando reservas'
                : filteredAppointments.length
                  ? 'Filtros aplicados'
                  : 'Sin reservas registradas'}
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
            <Text style={styles.timelineTitle}>Citas y horario</Text>
          </View>
          <View style={styles.timeline}>
            {displayedTimeline.length ? (
              displayedTimeline.map((minute, index) => (
                <View key={minute} style={styles.hourRow}>
                  <Text style={styles.hour}>{formatMinute(minute)}</Text>
                  <View style={styles.hourContent}>
                    <View style={styles.hourDivider} />
                    {filteredAppointments
                      .filter((appointment) => {
                        const startsAtMinute = minuteAtTimeZone(
                          appointment.startsAt,
                          timeZone,
                        );
                        const nextMinute =
                          displayedTimeline[index + 1] ?? minute + 60;
                        return (
                          startsAtMinute >= minute &&
                          startsAtMinute < nextMinute
                        );
                      })
                      .map((appointment) => (
                        <Pressable
                          key={appointment.id}
                          onPress={() => manageAppointment(appointment)}
                          style={styles.appointmentCard}
                        >
                          <Text style={styles.appointmentTime}>
                            {new Date(appointment.startsAt).toLocaleTimeString(
                              'es-EC',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone,
                              },
                            )}
                          </Text>
                          <View style={styles.appointmentCopy}>
                            <Text style={styles.appointmentClient}>
                              {appointment.clientName}
                            </Text>
                            <Text
                              style={styles.appointmentMeta}
                              numberOfLines={1}
                            >
                              {appointment.services
                                .map((service) => service.serviceName)
                                .join(', ') || 'Sin servicio'}
                            </Text>
                            {appointment.source === 'public_booking' ? (
                              <Text style={styles.publicBookingBadge}>
                                Reserva online
                              </Text>
                            ) : null}
                          </View>
                          <Ionicons
                            color="#687282"
                            name="ellipsis-vertical"
                            size={18}
                          />
                        </Pressable>
                      ))}
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

      <Modal
        animationType="fade"
        onRequestClose={dismissAgendaSettings}
        transparent
        visible={isAgendaSettingsOpen}
      >
        <View style={styles.settingsOverlay}>
          <Pressable
            onPress={dismissAgendaSettings}
            style={styles.settingsBackdrop}
          />
          <Animated.View
            style={{ transform: [{ translateY: settingsSheetTranslateY }] }}
          >
            <ScrollView contentContainerStyle={styles.settingsSheet}>
              <View
                {...settingsSheetPanResponder.panHandlers}
                style={styles.settingsDragArea}
              >
                <View style={styles.settingsHandle} />
              </View>
              <Text style={styles.settingsTitle}>Ajustes de agenda</Text>
              {[
                {
                  label: 'Ver todas las horas del calendario',
                  onChange: setShowAllHours,
                  selected: showAllHours,
                },
                {
                  label: 'Mostrar citas canceladas',
                  onChange: setShowCancelled,
                  selected: showCancelled,
                },
              ].map(({ label, selected, onChange }) => (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  key={label}
                  onPress={() => onChange(!selected)}
                  style={styles.checkboxRow}
                >
                  <Ionicons
                    color="#111318"
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={23}
                  />
                  <Text style={styles.checkboxLabel}>{label}</Text>
                </Pressable>
              ))}
              <Text style={styles.settingsSection}>Vista de calendario</Text>
              <ScrollView
                contentContainerStyle={styles.horizontalOptions}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {[
                  ['Dia', 'day'],
                  ['Semana', 'week'],
                  ['Completo', 'month'],
                ].map(([label, value]) => {
                  const selected = calendarView === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setCalendarView(value as AgendaView)}
                      style={[
                        styles.optionTile,
                        selected && styles.optionTileSelected,
                      ]}
                    >
                      <Ionicons
                        color={selected ? '#FFFFFF' : '#111318'}
                        name={
                          value === 'day'
                            ? 'today-outline'
                            : value === 'week'
                              ? 'calendar-outline'
                              : 'calendar-number-outline'
                        }
                        size={23}
                      />
                      <Text
                        style={[
                          styles.optionTileLabel,
                          selected && styles.optionTileLabelSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.settingsSection}>Estado de las reservas</Text>
              <ScrollView
                contentContainerStyle={styles.horizontalOptions}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {[
                  ['Todos', 'all'],
                  ['Activa', 'active'],
                  ['No asistio', 'no_show'],
                  ['Pendiente de confirmacion', 'scheduled'],
                  ['Pagado', 'paid'],
                  ['En espera', 'waiting'],
                  ['Confirmado', 'confirmed'],
                  ['En proceso', 'in_progress'],
                  ['Finalizado', 'completed'],
                ].map(([label, value]) => {
                  const selected = statusFilter === value;
                  const icon =
                    value === 'active'
                      ? 'pulse-outline'
                      : value === 'no_show'
                        ? 'person-remove-outline'
                        : value === 'scheduled'
                          ? 'time-outline'
                          : value === 'paid'
                            ? 'cash-outline'
                            : value === 'waiting'
                              ? 'hourglass-outline'
                              : value === 'confirmed'
                                ? 'checkmark-circle-outline'
                                : value === 'in_progress'
                                  ? 'sync-outline'
                                  : value === 'completed'
                                    ? 'checkmark-done-outline'
                                    : 'options-outline';
                  return (
                    <Pressable
                      key={value}
                      onPress={() =>
                        setStatusFilter(value as AgendaStatusFilter)
                      }
                      style={[
                        styles.optionTile,
                        selected && styles.optionTileSelected,
                      ]}
                    >
                      <Ionicons
                        color={selected ? '#FFFFFF' : '#111318'}
                        name={icon}
                        size={23}
                      />
                      <Text
                        style={[
                          styles.optionTileLabel,
                          selected && styles.optionTileLabelSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.settingsSection}>Miembros del equipo</Text>
              <ScrollView
                contentContainerStyle={styles.horizontalOptions}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <Pressable
                  onPress={() => setSelectedMemberId(null)}
                  style={[
                    styles.optionTile,
                    !selectedMemberId && styles.optionTileSelected,
                  ]}
                >
                  <Ionicons
                    color={!selectedMemberId ? '#FFFFFF' : '#111318'}
                    name="people-outline"
                    size={23}
                  />
                  <Text
                    style={[
                      styles.optionTileLabel,
                      !selectedMemberId && styles.optionTileLabelSelected,
                    ]}
                  >
                    Todos
                  </Text>
                </Pressable>
                {(teamQuery.data?.members ?? []).map((member) => {
                  const selected = selectedMemberId === member.id;
                  return (
                    <Pressable
                      key={member.id}
                      onPress={() => setSelectedMemberId(member.id)}
                      style={[
                        styles.optionTile,
                        selected && styles.optionTileSelected,
                      ]}
                    >
                      <Ionicons
                        color={selected ? '#FFFFFF' : '#111318'}
                        name="person-outline"
                        size={23}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.optionTileLabel,
                          selected && styles.optionTileLabelSelected,
                        ]}
                      >
                        {member.user.fullName}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedAppointment(null)}
        transparent
        visible={Boolean(selectedAppointment)}
      >
        <Pressable
          onPress={() => setSelectedAppointment(null)}
          style={styles.appointmentModalBackdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.appointmentModal}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.appointmentModalTitle}>
              {selectedAppointment?.clientName}
            </Text>
            <Text style={styles.appointmentModalCopy}>
              {selectedAppointment?.services
                .map((service) => service.serviceName)
                .join(', ') || 'Sin servicio'}
            </Text>
            <Pressable
              onPress={() => {
                if (!selectedAppointment) return;
                setSelectedAppointment(null);
                router.push({
                  pathname: '/reschedule-booking' as never,
                  params: {
                    appointmentId: selectedAppointment.id,
                    membershipId: selectedAppointment.professionalMembershipId,
                    serviceIds: selectedAppointment.services
                      .map((service) => service.serviceId)
                      .join(','),
                  },
                });
              }}
              style={styles.modalPrimaryAction}
            >
              <Ionicons color="#ffffff" name="calendar-outline" size={20} />
              <Text style={styles.modalPrimaryText}>Reprogramar cita</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!selectedAppointment?.clientPhone) {
                  Alert.alert(
                    'WhatsApp no disponible',
                    'Esta cita no tiene un teléfono de cliente.',
                  );
                  return;
                }
                const phone = selectedAppointment.clientPhone.replace(
                  /\D/gu,
                  '',
                );
                const businessName =
                  organizationQuery.data?.organization?.name ??
                  organizationQuery.data?.location?.name ??
                  'nuestro negocio';
                const professionalName =
                  teamQuery.data?.members.find(
                    (member) =>
                      member.id ===
                      selectedAppointment.professionalMembershipId,
                  )?.user.fullName ?? 'tu profesional';
                const appointmentDate = new Intl.DateTimeFormat('es-EC', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                  timeZone,
                }).format(new Date(selectedAppointment.startsAt));
                const message = `Hola ${selectedAppointment.clientName}. Te recordamos tu cita en ${businessName} con ${professionalName}, el ${appointmentDate}. ¡Te esperamos!`;
                void Linking.openURL(
                  `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
                );
              }}
              style={styles.modalWhatsAppAction}
            >
              <Ionicons color="#176B3A" name="logo-whatsapp" size={20} />
              <Text style={styles.modalWhatsAppText}>
                Enviar recordatorio por WhatsApp
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                selectedAppointment &&
                cancelAppointment.mutate(selectedAppointment.id)
              }
              style={styles.modalDangerAction}
            >
              <Ionicons color="#B42318" name="close-circle-outline" size={20} />
              <Text style={styles.modalDangerText}>Cancelar cita</Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedAppointment(null)}
              style={styles.modalCloseAction}
            >
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
            router.push('/clients');
            return;
          }
          router.push('/new-booking');
        }}
        style={styles.floatingButton}
      >
        <Ionicons color="#ffffff" name="add" size={30} />
        <Text style={styles.floatingLabel}>Nueva cita</Text>
      </Pressable>

      <BottomNavigation active="agenda" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appointmentCard: {
    backgroundColor: '#EEF0F2',
    borderLeftColor: '#111318',
    borderLeftWidth: 4,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 12,
  },
  appointmentClient: { color: '#111318', fontSize: 15, fontWeight: '900' },
  appointmentCopy: { flex: 1 },
  appointmentMeta: { color: '#666666', fontSize: 12, marginTop: 3 },
  appointmentModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    left: 0,
    padding: 22,
    position: 'absolute',
    right: 0,
  },
  appointmentModalBackdrop: {
    backgroundColor: 'rgba(17, 19, 24, 0.42)',
    flex: 1,
  },
  appointmentModalCopy: { color: '#666666', fontSize: 15, marginTop: 6 },
  appointmentModalTitle: {
    color: '#111318',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 14,
  },
  publicBookingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DDEBFF',
    borderRadius: 999,
    color: '#174A8B',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 7,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modalCloseAction: { alignItems: 'center', paddingVertical: 16 },
  modalCloseText: { color: '#4F5965', fontSize: 15, fontWeight: '800' },
  modalDangerAction: {
    alignItems: 'center',
    borderColor: '#F4C7C3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 15,
  },
  modalDangerText: { color: '#B42318', fontSize: 15, fontWeight: '900' },
  modalHandle: {
    alignSelf: 'center',
    backgroundColor: '#C7CBD0',
    borderRadius: 3,
    height: 5,
    width: 46,
  },
  modalPrimaryAction: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 23,
    paddingVertical: 16,
  },
  modalPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  modalWhatsAppAction: {
    alignItems: 'center',
    backgroundColor: '#EAF6EE',
    borderColor: '#9DCCAC',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 54,
  },
  modalWhatsAppText: { color: '#176B3A', fontSize: 15, fontWeight: '900' },
  appointmentTime: { color: '#111318', fontSize: 13, fontWeight: '900' },
  checkboxLabel: { color: '#111318', flex: 1, fontSize: 15, fontWeight: '700' },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    marginTop: 16,
  },
  optionTile: {
    alignItems: 'center',
    backgroundColor: '#F2F3F4',
    borderColor: '#DDE0E3',
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 9,
    height: 82,
    paddingHorizontal: 10,
    width: 104,
  },
  optionTileLabel: { color: '#111318', fontSize: 14, fontWeight: '800' },
  optionTileLabelSelected: { color: '#FFFFFF' },
  optionTileSelected: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  settingsBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  horizontalOptions: { gap: 10, paddingRight: 22, paddingTop: 11 },
  settingsDragArea: { paddingBottom: 8 },
  settingsHandle: {
    alignSelf: 'center',
    backgroundColor: '#C7CBD0',
    borderRadius: 3,
    height: 5,
    width: 46,
  },
  settingsOverlay: {
    backgroundColor: 'rgba(17, 19, 24, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  settingsSection: {
    color: '#111318',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 27,
  },
  settingsSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: 42,
    paddingHorizontal: 22,
    paddingTop: 15,
  },
  settingsTitle: {
    color: '#111318',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 17,
  },
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
    color: appTheme.colors.accentDark,
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
  headerActions: { flexDirection: 'row', gap: 9 },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 28,
    bottom: 94,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 15,
    position: 'absolute',
    right: 20,
    shadowColor: appTheme.colors.accentDark,
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
  screen: appStyles.screen,
  summary: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    ...goldShadow,
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
    color: appTheme.colors.text,
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
    backgroundColor: appTheme.colors.accent,
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
    shadowColor: appTheme.colors.accentDark,
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
  monthDateSelected: {
    backgroundColor: appTheme.colors.accent,
    borderRadius: 14,
  },
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
