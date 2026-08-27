/* eslint-disable react-hooks/refs -- React Native Animated and PanResponder expose stable imperative values used by the floating control. */
import { styles } from '../../src/features/screens/agenda.styles';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  AppointmentsResponse,
  BusinessScheduleResponse,
  ClientsResponse,
  SchedulesResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Easing,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appTheme,
  BottomNavigation,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import {
  agendaRange,
  localCalendarDate,
  type AgendaView,
} from '../../src/lib/agenda-range';
import { requireApiClient } from '../../src/lib/api';
import { clientAccessForRole } from '../../src/lib/client-access';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

import { AgendaCalendarModal } from '../../src/features/screens/agenda-components';
import {
  addDays,
  calendarDateForTimeZone,
  calendarGrid,
  formatMinute,
  minuteAtTimeZone,
  mondayOfWeek,
  sameDate,
  timelineMinutes,
  type AgendaStatusFilter,
} from '../../src/features/screens/agenda-model';

export default function AgendaScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const layout = useNativeLayoutMetrics();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const { date: notificationDate } = useLocalSearchParams<{ date?: string }>();
  const queryClient = useQueryClient();
  const floatingBookingOffset = useRef(new Animated.ValueXY()).current;
  const floatingBookingOffsetRef = useRef({ x: 0, y: 0 });
  const floatingBookingSizeRef = useRef({ height: 58, width: 150 });
  const floatingBookingBoundsRef = useRef({
    bottomInset: layout.bottomInset,
    height: screenHeight,
    topInset: layout.topInset,
    width: screenWidth,
  });
  floatingBookingBoundsRef.current = {
    bottomInset: layout.bottomInset,
    height: screenHeight,
    topInset: layout.topInset,
    width: screenWidth,
  };
  const floatingBookingPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_, gesture) => {
        const bounds = floatingBookingBoundsRef.current;
        const button = floatingBookingSizeRef.current;
        const sideMargin = 16;
        const navigationHeight = 72;
        const navigationGap = 12;
        const baseX = bounds.width - 20 - button.width;
        const baseY = bounds.height - 94 - button.height;
        const minimumX = sideMargin - baseX;
        const maximumX = bounds.width - sideMargin - button.width - baseX;
        const minimumY = bounds.topInset + sideMargin - baseY;
        const maximumY =
          bounds.height -
          bounds.bottomInset -
          navigationHeight -
          navigationGap -
          button.height -
          baseY;
        floatingBookingOffset.setValue({
          x: Math.min(
            maximumX,
            Math.max(minimumX, floatingBookingOffsetRef.current.x + gesture.dx),
          ),
          y: Math.min(
            maximumY,
            Math.max(minimumY, floatingBookingOffsetRef.current.y + gesture.dy),
          ),
        });
      },
      onPanResponderRelease: (_, gesture) => {
        const bounds = floatingBookingBoundsRef.current;
        const button = floatingBookingSizeRef.current;
        const sideMargin = 16;
        const navigationHeight = 72;
        const navigationGap = 12;
        const baseX = bounds.width - 20 - button.width;
        const baseY = bounds.height - 94 - button.height;
        floatingBookingOffsetRef.current = {
          x: Math.min(
            bounds.width - sideMargin - button.width - baseX,
            Math.max(
              sideMargin - baseX,
              floatingBookingOffsetRef.current.x + gesture.dx,
            ),
          ),
          y: Math.min(
            bounds.height -
              bounds.bottomInset -
              navigationHeight -
              navigationGap -
              button.height -
              baseY,
            Math.max(
              bounds.topInset + sideMargin - baseY,
              floatingBookingOffsetRef.current.y + gesture.dy,
            ),
          ),
        };
        floatingBookingOffset.setValue(floatingBookingOffsetRef.current);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  const organizationQuery = useCurrentOrganization();
  const clientAccess = clientAccessForRole(
    organizationQuery.data?.membership.role,
  );
  const schedulesQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<SchedulesResponse>('/v1/schedules'),
    queryKey: tenant.key('schedules'),
  });
  const businessScheduleQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<BusinessScheduleResponse>(
        '/v1/business-schedule',
      ),
    queryKey: tenant.key('business-schedule'),
  });
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: tenant.key('clients'),
  });
  const teamQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: tenant.key('team'),
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
        queryKey: tenantQueryPrefix('agenda-appointments'),
      });
    },
  });
  const completeAppointment = useMutation({
    mutationFn: (appointmentId: string) =>
      requireApiClient().request<{ appointment: AppointmentRecord }>(
        `/v1/appointments/${appointmentId}/status`,
        { body: { status: 'completed' }, method: 'PATCH' },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos completar la cita',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setSelectedAppointment(null);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('agenda-appointments'),
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
  const [calendarMonth, setCalendarMonth] = useState(today);
  const notificationDay = useMemo(() => {
    if (!notificationDate) return null;
    const startsAt = new Date(notificationDate);
    if (Number.isNaN(startsAt.getTime())) return null;
    return calendarDateForTimeZone(timeZone, startsAt);
  }, [notificationDate, timeZone]);
  useEffect(() => {
    if (!notificationDay) return;
    // El parámetro de navegación es un evento externo que puede cambiar con la
    // pantalla montada y debe sincronizar ambos controles del calendario.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDay(notificationDay);
    setCalendarMonth(notificationDay);
  }, [notificationDay]);
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
      const nextDay =
        calendarView === 'month'
          ? new Date(
              selectedDay.getFullYear(),
              selectedDay.getMonth() + offset,
              1,
              12,
            )
          : addDays(selectedDay, calendarView === 'week' ? offset * 7 : offset);
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
      calendarView,
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
  const locationId = organizationQuery.data?.location?.id;
  const appointmentsQuery = useQuery({
    enabled: Boolean(session && locationId),
    queryFn: async () => {
      const search = new URLSearchParams({
        ...agendaRange(calendarView, selectedDay),
        locationId: locationId ?? '',
      });
      const result = await requireApiClient().request<AppointmentsResponse>(
        `/v1/appointments?${search.toString()}`,
      );
      return result.appointments;
    },
    queryKey: tenant.key(
      'agenda-appointments',
      calendarView,
      localCalendarDate(selectedDay),
    ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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

  /* La confirmación manual está deshabilitada: Nava no marcará un pago como
   * aprobado sin una verificación criptográfica o servidor-a-servidor. */
  /* const manualPaymentQuery = useQuery({
    enabled: Boolean(session && selectedAppointment),
    queryFn: () =>
      requireApiClient().request<PayphoneManualConfirmationResponse>(
        `/v1/appointments/${selectedAppointment!.id}/payphone/manual-confirmation`,
      ),
    queryKey: tenant.key(
      'payphone-manual-confirmation',
      selectedAppointment?.id,
    ),
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
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('agenda-appointments'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('cash-register-summary'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('commission-overview'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('payphone-manual-confirmation'),
        }),
      ]);
    },
  });
  */
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
  const canRescheduleSelectedAppointment =
    !selectedAppointment ||
    teamQuery.data?.members.find(
      (member) => member.id === selectedAppointment.professionalMembershipId,
    )?.planAvailable !== false;
  const displayedTimeline = showAllHours
    ? Array.from({ length: 25 }, (_, index) => index * 60)
    : configuredTimeline;
  const appointmentsForDay = (day: Date) =>
    filteredAppointments.filter((appointment) =>
      sameDate(
        calendarDateForTimeZone(timeZone, new Date(appointment.startsAt)),
        day,
      ),
    );
  const weekTimeline = useMemo(() => {
    if (showAllHours)
      return Array.from({ length: 25 }, (_, index) => index * 60);
    return timelineMinutes(
      weekDays.flatMap((day) => {
        const businessDay = businessScheduleQuery.data?.days.find(
          (schedule) => schedule.weekday === day.getDay(),
        );
        return businessDay?.isOpen
          ? [
              {
                endMinute: businessDay.endMinute,
                startMinute: businessDay.startMinute,
              },
            ]
          : [];
      }),
    );
  }, [businessScheduleQuery.data?.days, showAllHours, weekDays]);
  const moveCalendarPeriod = (offset: number) => {
    moveSelectedDay(offset);
  };

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
          onPress={() => moveCalendarPeriod(-1)}
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
          onPress={() => moveCalendarPeriod(1)}
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
        {calendarView === 'day' ? (
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
                              {new Date(
                                appointment.startsAt,
                              ).toLocaleTimeString('es-EC', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone,
                              })}
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
                  No hay horarios de atención configurados para este día.
                </Text>
              )}
            </View>
          </ScrollView>
        ) : calendarView === 'week' ? (
          <ScrollView
            contentContainerStyle={[
              styles.timelineContent,
              { paddingBottom: layout.bottomInset + 84 },
            ]}
            showsVerticalScrollIndicator={false}
            style={styles.timelinePage}
          >
            <View style={styles.timelineHeader}>
              <Text style={styles.timelineTitle}>Semana</Text>
            </View>
            {weekTimeline.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.weekTimelineScroll}
              >
                <View style={styles.weekTimeline}>
                  <View style={styles.weekTimelineHeader}>
                    <Text style={styles.weekHourHeader}>Hora</Text>
                    {weekDays.map((day) => (
                      <Pressable
                        key={day.toISOString()}
                        onPress={() => {
                          setSelectedDay(day);
                          setCalendarMonth(day);
                        }}
                        style={[
                          styles.weekDayHeader,
                          sameDate(day, selectedDay) &&
                            styles.weekDayHeaderSelected,
                        ]}
                      >
                        <Text style={styles.weekDayName}>
                          {day
                            .toLocaleDateString('es-EC', { weekday: 'short' })
                            .replace('.', '')
                            .toUpperCase()}
                        </Text>
                        <Text style={styles.weekDayNumber}>
                          {day.getDate()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {weekTimeline.map((minute, index) => {
                    const nextMinute = weekTimeline[index + 1] ?? minute + 60;
                    return (
                      <View key={minute} style={styles.weekHourRow}>
                        <Text style={styles.weekHour}>
                          {formatMinute(minute)}
                        </Text>
                        {weekDays.map((day) => (
                          <View key={day.toISOString()} style={styles.weekCell}>
                            {appointmentsForDay(day)
                              .filter((appointment) => {
                                const startsAtMinute = minuteAtTimeZone(
                                  appointment.startsAt,
                                  timeZone,
                                );
                                return (
                                  startsAtMinute >= minute &&
                                  startsAtMinute < nextMinute
                                );
                              })
                              .map((appointment) => (
                                <Pressable
                                  key={appointment.id}
                                  onPress={() => manageAppointment(appointment)}
                                  style={styles.weekAppointmentCard}
                                >
                                  <Text
                                    numberOfLines={1}
                                    style={styles.weekAppointmentTime}
                                  >
                                    {new Date(
                                      appointment.startsAt,
                                    ).toLocaleTimeString('es-EC', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      timeZone,
                                    })}
                                  </Text>
                                  <Text
                                    numberOfLines={2}
                                    style={styles.weekAppointmentClient}
                                  >
                                    {appointment.clientName}
                                  </Text>
                                </Pressable>
                              ))}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.emptySchedule}>
                No hay horarios de atención configurados para esta semana.
              </Text>
            )}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.timelineContent,
              { paddingBottom: layout.bottomInset + 84 },
            ]}
            showsVerticalScrollIndicator={false}
            style={styles.timelinePage}
          >
            <View style={styles.timelineHeader}>
              <Text style={styles.timelineTitle}>
                {calendarMonth.toLocaleDateString('es-EC', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
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
                    <View key={`empty-${index}`} style={styles.monthCell} />
                  );
                const appointments = appointmentsForDay(day);
                const isSelected = sameDate(day, selectedDay);
                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => {
                      setSelectedDay(day);
                      setCalendarMonth(day);
                      setCalendarView('day');
                    }}
                    style={[
                      styles.monthCell,
                      isSelected && styles.monthCellSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthCellNumber,
                        isSelected && styles.monthCellNumberSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                    {appointments.length ? (
                      <View style={styles.monthAppointmentCount}>
                        <Text style={styles.monthAppointmentCountLabel}>
                          {appointments.length}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.monthHint}>
              Toca un día para abrir su agenda detallada.
            </Text>
          </ScrollView>
        )}
      </Animated.View>

      <AgendaCalendarModal
        bottomInset={layout.bottomInset}
        calendarMonth={calendarMonth}
        days={monthDays}
        onClose={() => setIsCalendarOpen(false)}
        onMonthChange={setCalendarMonth}
        onSelectDay={(day) => {
          setSelectedDay(day);
          setIsCalendarOpen(false);
        }}
        selectedDay={selectedDay}
        today={today}
        topInset={layout.topInset}
        visible={isCalendarOpen}
      />

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
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.settingsBackdrop,
              { opacity: settingsBackdropOpacity },
            ]}
          >
            <Pressable
              accessibilityState={{
                disabled: !canRescheduleSelectedAppointment,
              }}
              disabled={!canRescheduleSelectedAppointment}
              accessibilityLabel="Cerrar ajustes de agenda"
              accessibilityRole="button"
              onPress={dismissAgendaSettings}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
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
              style={[
                styles.modalPrimaryAction,
                !canRescheduleSelectedAppointment && { opacity: 0.42 },
              ]}
            >
              <Ionicons color="#ffffff" name="calendar-outline" size={20} />
              <Text style={styles.modalPrimaryText}>
                {canRescheduleSelectedAppointment
                  ? 'Reprogramar cita'
                  : 'Profesional histórico (Nava Local)'}
              </Text>
            </Pressable>
            <Pressable
              disabled={completeAppointment.isPending}
              onPress={() => {
                if (!selectedAppointment) return;
                Alert.alert(
                  'Completar cita',
                  selectedAppointment.source === 'public_booking'
                    ? 'La cita se marcará como completada y se enviará al cliente un correo para dejar su reseña.'
                    : 'La cita se marcará como completada.',
                  [
                    { style: 'cancel', text: 'Cancelar' },
                    {
                      onPress: () =>
                        completeAppointment.mutate(selectedAppointment.id),
                      text: 'Completar',
                    },
                  ],
                );
              }}
              style={styles.modalPrimaryAction}
            >
              <Ionicons
                color="#ffffff"
                name="checkmark-circle-outline"
                size={20}
              />
              <Text style={styles.modalPrimaryText}>
                Marcar como completada
              </Text>
            </Pressable>
            {/* La confirmación manual PayPhone permanece deshabilitada hasta
                integrar la verificación oficial del proveedor. */}
            {/* {selectedAppointment?.paymentStatus === 'pending' &&
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
            ) : null} */}
            {clientAccess.canCommunicate ? (
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
            ) : null}
            <Pressable
              accessibilityState={{
                disabled: !canRescheduleSelectedAppointment,
              }}
              disabled={!canRescheduleSelectedAppointment}
              onPress={() =>
                selectedAppointment &&
                cancelAppointment.mutate(selectedAppointment.id)
              }
              style={[
                styles.modalDangerAction,
                !canRescheduleSelectedAppointment && { opacity: 0.42 },
              ]}
            >
              <Ionicons color="#B42318" name="close-circle-outline" size={20} />
              <Text style={styles.modalDangerText}>
                {canRescheduleSelectedAppointment
                  ? 'Cancelar cita'
                  : 'Profesional histórico'}
              </Text>
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

      {/* <PayphonePaymentModal
        bottomInset={layout.bottomInset}
        confirmed={manualPaymentConfirmed}
        data={manualPaymentQuery.data}
        note={manualPaymentNote}
        onClose={() => setManualPaymentSheetOpen(false)}
        onConfirmedChange={setManualPaymentConfirmed}
        onNoteChange={setManualPaymentNote}
        onReferenceChange={setManualPaymentReference}
        onSubmit={() => confirmPayphonePayment.mutate()}
        pending={confirmPayphonePayment.isPending}
        reference={manualPaymentReference}
        sheetMaxHeight={layout.sheetMaxHeight}
        visible={manualPaymentSheetOpen}
      /> */}
      <Animated.View
        {...floatingBookingPanResponder.panHandlers}
        onLayout={({ nativeEvent }) => {
          floatingBookingSizeRef.current = nativeEvent.layout;
        }}
        style={[
          styles.floatingButton,
          { transform: floatingBookingOffset.getTranslateTransform() },
        ]}
      >
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
          style={styles.floatingButtonContent}
        >
          <Ionicons color="#ffffff" name="add" size={30} />
          <Text style={styles.floatingLabel}>Nueva cita</Text>
        </Pressable>
      </Animated.View>

      <BottomNavigation active="agenda" />
    </SafeAreaView>
  );
}
