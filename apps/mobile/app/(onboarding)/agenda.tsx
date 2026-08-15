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
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
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
  BottomNavigation,
  goldButtonShadow,
  goldShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
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

type PayphoneManualConfirmationResponse = {
  readonly activeConfiguration: boolean;
  readonly appointment: {
    readonly clientName: string;
    readonly startsAt: string;
    readonly totalCents: number;
  };
  readonly eligible: boolean;
  readonly paymentStatus: 'paid' | 'pending';
  readonly attempt: {
    readonly confirmedAt: string | null;
    readonly confirmedByName: string | null;
    readonly currencyCode: string;
    readonly expiresAt: string;
    readonly note: string | null;
    readonly reference: string | null;
    readonly status: 'confirmed_manually' | 'expired' | 'pending_verification';
    readonly transactionReference: string;
  } | null;
};
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
  const layout = useNativeLayoutMetrics();
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
  const [manualPaymentSheetOpen, setManualPaymentSheetOpen] = useState(false);
  const [manualPaymentConfirmed, setManualPaymentConfirmed] = useState(false);
  const [manualPaymentNote, setManualPaymentNote] = useState('');
  const [manualPaymentReference, setManualPaymentReference] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(today);
  const [dayContentOpacity] = useState(() => new Animated.Value(1));
  const [timelineTransitionX] = useState(() => new Animated.Value(0));
  const [settingsSheetTranslateY] = useState(() => new Animated.Value(0));
  const [settingsBackdropOpacity] = useState(() => new Animated.Value(1));
  const [isDismissingSettings, setIsDismissingSettings] = useState(false);
  const [isDayTransitioning, setIsDayTransitioning] = useState(false);
  const openAgendaSettings = useCallback(() => {
    settingsSheetTranslateY.stopAnimation();
    settingsBackdropOpacity.stopAnimation();
    setIsDismissingSettings(false);
    settingsBackdropOpacity.setValue(1);
    settingsSheetTranslateY.setValue(0);
    setIsAgendaSettingsOpen(true);
  }, [settingsBackdropOpacity, settingsSheetTranslateY]);
  const dismissAgendaSettings = useCallback(() => {
    if (isDismissingSettings) return;
    setIsDismissingSettings(true);
    Animated.parallel([
      Animated.timing(settingsSheetTranslateY, {
        duration: 210,
        easing: Easing.in(Easing.cubic),
        toValue: 520,
        useNativeDriver: true,
      }),
      Animated.timing(settingsBackdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsAgendaSettingsOpen(false);
      settingsSheetTranslateY.setValue(0);
      settingsBackdropOpacity.setValue(1);
      setIsDismissingSettings(false);
    });
  }, [isDismissingSettings, settingsBackdropOpacity, settingsSheetTranslateY]);
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
      const nextDay = addDays(selectedDay, offset);
      const exitOffset = offset > 0 ? -28 : 28;
      Animated.parallel([
        Animated.timing(dayContentOpacity, {
          duration: 140,
          easing: Easing.in(Easing.cubic),
          toValue: 0.28,
          useNativeDriver: true,
        }),
        Animated.timing(timelineTransitionX, {
          duration: 140,
          easing: Easing.in(Easing.cubic),
          toValue: exitOffset,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSelectedDay(nextDay);
        setCalendarMonth(nextDay);
        timelineTransitionX.setValue(-exitOffset);
        Animated.parallel([
          Animated.timing(dayContentOpacity, {
            duration: 210,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(timelineTransitionX, {
            duration: 210,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setIsDayTransitioning(false);
        });
      });
    },
    [
      dayContentOpacity,
      isDayTransitioning,
      selectedDay,
      setCalendarMonth,
      setIsDayTransitioning,
      setSelectedDay,
      timelineTransitionX,
    ],
  );
  const dayPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 28 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= -56) moveSelectedDay(1);
          if (gesture.dx >= 56) moveSelectedDay(-1);
        },
      }),
    [moveSelectedDay],
  );
  const restoreTimelinePosition = useCallback(() => {
    Animated.parallel([
      Animated.spring(dayContentOpacity, {
        bounciness: 0,
        speed: 18,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(timelineTransitionX, {
        bounciness: 0,
        speed: 18,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dayContentOpacity, timelineTransitionX]);
  const timelinePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 20 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderMove: (_, gesture) => {
          if (isDayTransitioning) return;
          const previewOffset = Math.max(-22, Math.min(22, gesture.dx * 0.18));
          timelineTransitionX.setValue(previewOffset);
          dayContentOpacity.setValue(
            Math.max(0.72, 1 - Math.abs(previewOffset) / 100),
          );
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldChangeDay =
            Math.abs(gesture.dx) >= 64 || Math.abs(gesture.vx) >= 0.42;
          if (shouldChangeDay) {
            moveSelectedDay(gesture.dx < 0 ? 1 : -1);
            return;
          }
          restoreTimelinePosition();
        },
        onPanResponderTerminate: restoreTimelinePosition,
      }),
    [
      dayContentOpacity,
      isDayTransitioning,
      moveSelectedDay,
      restoreTimelinePosition,
      timelineTransitionX,
    ],
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

  const manualPaymentQuery = useQuery({
    enabled: Boolean(session && selectedAppointment),
    queryFn: () =>
      requireApiClient().request<PayphoneManualConfirmationResponse>(
        `/v1/appointments/${selectedAppointment!.id}/payphone/manual-confirmation`,
      ),
    queryKey: ['payphone-manual-confirmation', selectedAppointment?.id],
  });
  const confirmPayphonePayment = useMutation({
    mutationFn: () => {
      if (!selectedAppointment)
        throw new Error('Selecciona una cita para registrar el cobro.');
      return requireApiClient().request(
        `/v1/appointments/${selectedAppointment.id}/payphone/manual-confirmation`,
        {
          body: {
            confirmed: true,
            note: manualPaymentNote.trim() || undefined,
            providerReference: manualPaymentReference.trim(),
          },
          method: 'POST',
        },
      );
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos registrar el cobro',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setManualPaymentSheetOpen(false);
      setManualPaymentConfirmed(false);
      setManualPaymentNote('');
      setManualPaymentReference('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agenda-appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-register-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['commission-overview'] }),
        queryClient.invalidateQueries({
          queryKey: ['payphone-manual-confirmation'],
        }),
      ]);
    },
  });
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
        return !['cancelled', 'completed', 'expired', 'no_show'].includes(
          appointment.status,
        );
      if (statusFilter === 'scheduled')
        return [
          'awaiting_confirmation',
          'pending_verification',
          'scheduled',
        ].includes(appointment.status);
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
        <View style={styles.headerCopy}>
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
            <Ionicons
              color={appTheme.colors.accentDark}
              name="list-outline"
              size={23}
            />
          </Pressable>
          <Pressable
          accessibilityLabel="Ajustes agenda"
          accessibilityRole="button"
            onPress={openAgendaSettings}
            style={styles.filterButton}
          >
            <Ionicons
              color={appTheme.colors.accentDark}
              name="settings-outline"
              size={22}
            />
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
          <Ionicons
            color={appTheme.colors.accentDark}
            name="chevron-back"
            size={18}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Abrir calendario"
          accessibilityRole="button"
          onPress={() => setIsCalendarOpen(true)}
          style={styles.weekPill}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="calendar-outline"
            size={17}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Dia siguiente"
          accessibilityRole="button"
          onPress={() => moveSelectedDay(1)}
          style={styles.viewControl}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="chevron-forward"
            size={18}
          />
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
        <View style={styles.summaryPrimary}>
          <Text style={styles.summaryValue}>
            {filteredAppointments.length} citas
          </Text>
          <Text style={styles.summaryLabel}>en la vista seleccionada</Text>
        </View>
        <View style={styles.availability}>
          <View style={styles.availabilityRing}>
            <Ionicons
              color={appTheme.colors.accentDark}
              name="checkmark"
              size={22}
            />
          </View>
          <View style={styles.availabilityText}>
            <Text numberOfLines={2} style={styles.availabilityLabel}>
              Agenda disponible
            </Text>
            <Text numberOfLines={2} style={styles.availabilityCopy}>
              {appointmentsQuery.isLoading
                ? 'Cargando reservas'
                : filteredAppointments.length
                  ? 'Filtros aplicados'
                  : 'Sin reservas registradas'}
            </Text>
          </View>
        </View>
      </View>

      <Animated.View
        {...timelinePanResponder.panHandlers}
        style={[
          styles.timelineWrapper,
          {
            opacity: dayContentOpacity,
            transform: [{ translateX: timelineTransitionX }],
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.timelineContent,
            { paddingBottom: layout.bottomInset + 84 },
          ]}
          showsVerticalScrollIndicator={false}
          style={styles.timelinePage}
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
                            color={appTheme.colors.accentDark}
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
        </ScrollView>
      </Animated.View>

      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={() => setIsCalendarOpen(false)}
        statusBarTranslucent
        transparent
        visible={isCalendarOpen}
      >
        <View
          style={[
            styles.calendarModalBackdrop,
            {
              paddingBottom: layout.bottomInset,
              paddingTop: layout.topInset,
            },
          ]}
        >
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
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name="chevron-back"
                  size={22}
                />
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
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name="chevron-forward"
                  size={22}
                />
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
        animationType="none"
        navigationBarTranslucent
        onRequestClose={dismissAgendaSettings}
        onShow={openAgendaSettings}
        statusBarTranslucent
        transparent
        visible={isAgendaSettingsOpen}
      >
        <View style={styles.settingsOverlay}>
          <Pressable
            onPress={dismissAgendaSettings}
            style={[
              styles.settingsBackdrop,
              { opacity: settingsBackdropOpacity },
            ]}
          />
          <Animated.View
            style={[
              styles.settingsSheet,
              {
                height: layout.sheetMaxHeight,
                transform: [{ translateY: settingsSheetTranslateY }],
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={[
                styles.settingsContent,
                { paddingBottom: layout.bottomInset + 8 },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.settingsScroll}
            >
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
                  style={({ pressed }) => [
                    styles.checkboxRow,
                    selected && styles.checkboxRowSelected,
                    pressed && styles.settingsControlPressed,
                  ]}
                >
                  <Ionicons
                    color={appTheme.colors.text}
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
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      key={value}
                      onPress={() => setCalendarView(value as AgendaView)}
                      style={({ pressed }) => [
                        styles.optionTile,
                        selected && styles.optionTileSelected,
                        pressed && styles.settingsControlPressed,
                      ]}
                    >
                      <Ionicons
                        color={appTheme.colors.text}
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
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      key={value}
                      onPress={() =>
                        setStatusFilter(value as AgendaStatusFilter)
                      }
                      style={({ pressed }) => [
                        styles.optionTile,
                        selected && styles.optionTileSelected,
                        pressed && styles.settingsControlPressed,
                      ]}
                    >
                      <Ionicons
                        color={appTheme.colors.text}
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected: !selectedMemberId }}
                  onPress={() => setSelectedMemberId(null)}
                  style={({ pressed }) => [
                    styles.optionTile,
                    !selectedMemberId && styles.optionTileSelected,
                    pressed && styles.settingsControlPressed,
                  ]}
                >
                  <Ionicons
                    color={appTheme.colors.text}
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
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      key={member.id}
                      onPress={() => setSelectedMemberId(member.id)}
                      style={({ pressed }) => [
                        styles.optionTile,
                        selected && styles.optionTileSelected,
                        pressed && styles.settingsControlPressed,
                      ]}
                    >
                      <Ionicons
                        color={appTheme.colors.text}
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
        navigationBarTranslucent
        onRequestClose={() => setSelectedAppointment(null)}
        statusBarTranslucent
        transparent
        visible={Boolean(selectedAppointment)}
      >
        <Pressable
          onPress={() => setSelectedAppointment(null)}
          style={styles.appointmentModalBackdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              styles.appointmentModal,
              { paddingBottom: layout.bottomInset + 12 },
            ]}
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
            {selectedAppointment?.paymentStatus === 'pending' &&
            manualPaymentQuery.data?.eligible ? (
              <Pressable
                onPress={() => {
                  setManualPaymentConfirmed(false);
                  setManualPaymentNote('');
                  setManualPaymentReference('');
                  setManualPaymentSheetOpen(true);
                }}
                style={styles.modalPayphoneAction}
              >
                <Ionicons color="#FFFFFF" name="card-outline" size={20} />
                <Text style={styles.modalPrimaryText}>
                  Registrar cobro PayPhone
                </Text>
              </Pressable>
            ) : null}{' '}
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

      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={() => setManualPaymentSheetOpen(false)}
        statusBarTranslucent
        transparent
        visible={manualPaymentSheetOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.paymentSheetRoot}
        >
          <Pressable
            onPress={() => setManualPaymentSheetOpen(false)}
            style={styles.appointmentModalBackdrop}
          />
          <ScrollView
            contentContainerStyle={[
              styles.paymentSheet,
              { paddingBottom: layout.bottomInset + 20 },
            ]}
            style={{ maxHeight: layout.sheetMaxHeight }}
          >
            <Text style={styles.appointmentModalTitle}>
              Confirmar cobro PayPhone
            </Text>
            <Text style={styles.paymentWarning}>
              Antes de continuar, verifica en PayPhone Business que el pago fue
              aprobado y que el monto recibido coincide con el total de la cita.
              Nava no puede comprobar este pago automáticamente.
            </Text>
            <View style={styles.paymentDetails}>
              <Text style={styles.paymentDetail}>
                Cliente:{' '}
                {manualPaymentQuery.data?.appointment.clientName ?? '-'}
              </Text>
              <Text style={styles.paymentDetail}>
                Fecha:{' '}
                {manualPaymentQuery.data?.appointment.startsAt
                  ? new Date(
                      manualPaymentQuery.data.appointment.startsAt,
                    ).toLocaleString('es-EC')
                  : '-'}
              </Text>
              <Text style={styles.paymentDetail}>
                Total esperado: $
                {(
                  (manualPaymentQuery.data?.appointment.totalCents ?? 0) / 100
                ).toFixed(2)}{' '}
                {manualPaymentQuery.data?.attempt?.currencyCode ?? 'USD'}
              </Text>
              <Text style={styles.paymentDetail}>
                Enlace generado:{' '}
                {manualPaymentQuery.data?.attempt
                  ? new Date(
                      new Date(
                        manualPaymentQuery.data.attempt.expiresAt,
                      ).getTime() -
                        60 * 60 * 1000,
                    ).toLocaleString('es-EC')
                  : '-'}
              </Text>
              <Text style={styles.paymentDetail}>
                Referencia interna:{' '}
                {manualPaymentQuery.data?.attempt?.transactionReference ?? '-'}
              </Text>
            </View>
            <Text style={styles.inputLabel}>Referencia de PayPhone</Text>
            <TextInput
              autoCapitalize="characters"
              editable={!confirmPayphonePayment.isPending}
              onChangeText={setManualPaymentReference}
              placeholder="Número de transacción verificado"
              placeholderTextColor={appTheme.colors.textMuted}
              style={styles.paymentInput}
              value={manualPaymentReference}
            />
            <Text style={styles.inputLabel}>Nota (opcional)</Text>
            <TextInput
              editable={!confirmPayphonePayment.isPending}
              multiline
              onChangeText={setManualPaymentNote}
              placeholder="Detalle de la verificación"
              placeholderTextColor={appTheme.colors.textMuted}
              style={[styles.paymentInput, styles.paymentNoteInput]}
              value={manualPaymentNote}
            />
            <Pressable
              onPress={() => setManualPaymentConfirmed((value) => !value)}
              style={styles.confirmationCheck}
            >
              <Ionicons
                color={
                  manualPaymentConfirmed
                    ? appTheme.colors.accentDark
                    : appTheme.colors.textMuted
                }
                name={
                  manualPaymentConfirmed ? 'checkbox-outline' : 'square-outline'
                }
                size={23}
              />
              <Text style={styles.confirmationCheckText}>
                Confirmo que verifiqué el pago aprobado en PayPhone Business.
              </Text>
            </Pressable>
            <Pressable
              disabled={
                !manualPaymentConfirmed ||
                !manualPaymentReference.trim() ||
                confirmPayphonePayment.isPending
              }
              onPress={() => confirmPayphonePayment.mutate()}
              style={styles.modalPrimaryAction}
            >
              <Text style={styles.modalPrimaryText}>
                {confirmPayphonePayment.isPending
                  ? 'Registrando...'
                  : 'Registrar como pagado'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
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
    backgroundColor: appTheme.colors.surface,
    borderLeftColor: appTheme.colors.accent,
    borderLeftWidth: 4,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
    ...goldShadow,
  },
  appointmentClient: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  appointmentCopy: { flex: 1 },
  appointmentMeta: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
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
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
  },
  appointmentModalCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    marginTop: 6,
  },
  confirmationCheck: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  confirmationCheckText: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  modalPayphoneAction: {
    alignItems: 'center',
    backgroundColor: '#287247',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 12,
    padding: 14,
  },
  paymentDetail: { color: appTheme.colors.text, fontSize: 13, lineHeight: 19 },
  paymentDetails: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    gap: 6,
    marginTop: 14,
    padding: 14,
  },
  paymentInput: {
    borderColor: appTheme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 15,
    padding: 12,
  },
  paymentNoteInput: { minHeight: 72, textAlignVertical: 'top' },
  paymentSheet: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 10,
    marginTop: 'auto',
    padding: 22,
    paddingBottom: 36,
  },
  paymentSheetRoot: { backgroundColor: appTheme.colors.overlay, flex: 1 },
  paymentWarning: {
    color: '#7A4300',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  appointmentModalTitle: {
    color: appTheme.colors.accentDark,
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
  modalCloseText: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '800',
  },
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
    backgroundColor: appTheme.colors.accentLight,
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
  appointmentTime: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '900',
  },
  checkboxLabel: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  checkboxRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    marginTop: 12,
    minHeight: 62,
    paddingHorizontal: 15,
    ...goldButtonShadow,
  },
  checkboxRowSelected: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.accent,
    borderWidth: 2,
  },
  optionTile: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 9,
    minHeight: 88,
    paddingHorizontal: 10,
    width: 116,
    ...goldButtonShadow,
  },
  optionTileLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
  },
  optionTileLabelSelected: { color: appTheme.colors.text },
  optionTileSelected: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.accent,
    borderWidth: 2,
    zIndex: 1,
  },
  settingsBackdrop: {
    backgroundColor: appTheme.colors.overlay,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  horizontalOptions: { gap: 10, paddingHorizontal: 2, paddingTop: 11 },
  settingsDragArea: { paddingBottom: 8 },
  settingsHandle: {
    alignSelf: 'center',
    backgroundColor: '#C8C9CB',
    borderRadius: 3,
    height: 5,
    width: 46,
  },
  settingsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  settingsSection: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 25,
  },
  settingsSheet: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    overflow: 'hidden',
    width: '100%',
  },
  settingsContent: {
    paddingBottom: 20,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  settingsScroll: {
    backgroundColor: appTheme.colors.surface,
    width: '100%',
  },
  settingsControlPressed: {
    elevation: 9,
    shadowOpacity: 0.2,
    transform: [{ translateY: -3 }],
  },
  settingsTitle: {
    color: appTheme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 17,
  },
  availability: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 10,
    maxWidth: '58%',
    minWidth: 0,
  },
  availabilityCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  availabilityLabel: {
    color: appTheme.colors.accentDark,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  availabilityText: { flex: 1, minWidth: 0 },
  availabilityRing: {
    alignItems: 'center',
    borderColor: appTheme.colors.accent,
    borderRadius: 26,
    borderWidth: 4,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  date: {
    color: appTheme.colors.textMuted,
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
    backgroundColor: appTheme.colors.surface,
    shadowColor: appTheme.colors.accentDark,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 10,
  },
  dayName: {
    color: appTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  dayNameSelected: { color: appTheme.colors.accentDark },
  dayNumber: {
    color: appTheme.colors.accentDark,
    fontSize: 17,
    fontWeight: '900',
  },
  dayNumberSelected: { color: appTheme.colors.accentDark },
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
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  // El acceso global a notificaciones ocupa el extremo superior derecho.
  // Reservamos ese espacio para que los dos controles de Agenda sigan siendo
  // visibles y táctiles en pantallas angostas.
  headerActions: { flexDirection: 'row', gap: 14, paddingRight: 72 },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 14 },
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
  inputLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },
  hourContent: { flex: 1, minHeight: 89, paddingLeft: 10 },
  hourDivider: {
    borderStyle: 'dashed',
    borderTopColor: appTheme.colors.border,
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
  summaryPrimary: { flex: 1, minWidth: 0, paddingRight: 12 },
  summaryLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  summaryValue: {
    color: appTheme.colors.accentDark,
    fontSize: 21,
    fontWeight: '900',
  },
  timeline: { marginTop: 13, position: 'relative' },
  timelinePage: { flex: 1 },
  timelineWrapper: { flex: 1, overflow: 'hidden' },
  timelineContent: {
    backgroundColor: appTheme.colors.surface,
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    marginTop: 12,
    paddingBottom: 132,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  timelineHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineTitle: {
    color: appTheme.colors.accentDark,
    fontSize: 18,
    fontWeight: '900',
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -1,
  },
  viewControl: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 13,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  viewControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'flex-end',
    marginHorizontal: 22,
    marginTop: -36,
  },
  weekPill: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
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
    alignSelf: 'stretch',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 26,
    marginHorizontal: 20,
    padding: 20,
    shadowColor: appTheme.colors.accentDark,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
  },
  calendarModalBackdrop: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
    justifyContent: 'center',
  },
  calendarModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarMonthLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  calendarSection: { marginHorizontal: 20, marginTop: 20 },
  emptySchedule: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    paddingVertical: 22,
  },
  monthControl: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
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
  monthDateLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '700',
  },
  monthDateLabelSelected: { color: '#ffffff' },
  monthDateSelected: {
    backgroundColor: appTheme.colors.accent,
    borderRadius: 14,
  },
  monthDateToday: {
    color: appTheme.colors.accentDark,
    textDecorationLine: 'underline',
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  monthWeekday: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    width: '14.2857%',
  },
  monthWeekdays: { flexDirection: 'row', marginTop: 22 },
  weekSelector: {
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 23,
    flexDirection: 'row',
    padding: 6,
  },
});
