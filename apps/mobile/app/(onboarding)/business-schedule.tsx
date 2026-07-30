import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  BusinessScheduleDay,
  BusinessScheduleResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TimeField } from '../../src/components/RegistrationSelectors';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const COLORS = {
  accent: '#101c2d',
  border: '#d2d4d8',
  danger: '#b42318',
  muted: '#626872',
  screen: '#ffffff',
  surface: '#f4f4f3',
  surfaceStrong: '#e1e2e4',
  text: '#101c2d',
} as const;

const DAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  return `${String(hour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function minuteForTime(time: string) {
  const [hour = '0', minute = '0'] = time.split(':');
  return Number(hour) * 60 + Number(minute);
}

function orderedDays(days: readonly BusinessScheduleDay[]) {
  return DISPLAY_ORDER.map((weekday) =>
    days.find((day) => day.weekday === weekday),
  ).filter((day): day is BusinessScheduleDay => Boolean(day));
}

function scheduleSignature(days: readonly BusinessScheduleDay[]) {
  return JSON.stringify(
    [...days].sort((left, right) => left.weekday - right.weekday),
  );
}

export default function BusinessScheduleScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const [dayOverrides, setDayOverrides] = useState<
    Partial<Record<number, BusinessScheduleDay>>
  >({});
  const [editingDay, setEditingDay] = useState<BusinessScheduleDay | null>(
    null,
  );
  const [requestError, setRequestError] = useState<string | null>(null);

  const scheduleQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<BusinessScheduleResponse>(
        '/v1/business-schedule',
      ),
    queryKey: ['business-schedule', user?.id],
  });

  const saveMutation = useMutation({
    mutationFn: (input: { days: BusinessScheduleDay[]; locationId: string }) =>
      requireApiClient().request<BusinessScheduleResponse>(
        '/v1/business-schedule',
        { body: input, method: 'PUT' },
      ),
    onError: (error) => {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el horario.',
      );
    },
    onSuccess: async (response) => {
      setDayOverrides({});
      setRequestError(null);
      queryClient.setQueryData(['business-schedule', user?.id], response);
      await queryClient.invalidateQueries({
        queryKey: ['business-schedule'],
      });
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      Alert.alert('Horario guardado', 'Los cambios ya se aplican a tu agenda.');
    },
  });

  const days = useMemo(
    () =>
      (scheduleQuery.data?.days ?? []).map(
        (day) => dayOverrides[day.weekday] ?? day,
      ),
    [dayOverrides, scheduleQuery.data?.days],
  );
  const isDirty =
    days.length === 7 &&
    scheduleSignature(days) !==
      scheduleSignature(scheduleQuery.data?.days ?? []);
  const visibleDays = useMemo(() => orderedDays(days), [days]);

  const toggleDay = useCallback(
    (weekday: number) => {
      const day = days.find((item) => item.weekday === weekday);
      if (!day) return;
      setDayOverrides((current) => ({
        ...current,
        [weekday]: { ...day, isOpen: !day.isOpen },
      }));
    },
    [days],
  );

  const updateInterval = useCallback((next: BusinessScheduleDay) => {
    setDayOverrides((current) => ({
      ...current,
      [next.weekday]: next,
    }));
    setEditingDay(null);
  }, []);

  const goBack = useCallback(() => {
    const close = () => {
      if (router.canGoBack()) router.back();
      else router.replace('/business-settings');
    };
    if (!isDirty) {
      close();
      return;
    }
    Alert.alert(
      'Descartar cambios',
      'Tienes cambios sin guardar en el horario.',
      [
        { style: 'cancel', text: 'Seguir editando' },
        { onPress: close, style: 'destructive', text: 'Descartar' },
      ],
    );
  }, [isDirty, router]);

  const save = useCallback(() => {
    if (!scheduleQuery.data || days.length !== 7) return;
    setRequestError(null);
    saveMutation.mutate({
      days,
      locationId: scheduleQuery.data.locationId,
    });
  }, [days, saveMutation, scheduleQuery.data]);

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Pressable
            accessibilityLabel="Volver"
            accessibilityRole="button"
            hitSlop={6}
            onPress={goBack}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={COLORS.text} name="arrow-back" size={25} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Horario del negocio
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Ionicons color={COLORS.text} name="calendar-outline" size={28} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Horario general</Text>
            <Text style={styles.introText}>
              Define cuándo abre tu negocio. La agenda solo ofrecerá horarios
              que también estén disponibles para cada profesional.
            </Text>
          </View>
        </View>

        {scheduleQuery.isPending ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.stateText}>Cargando horario…</Text>
          </View>
        ) : scheduleQuery.isError ? (
          <View style={styles.errorCard}>
            <Ionicons color={COLORS.danger} name="alert-circle" size={25} />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>
                No pudimos cargar el horario
              </Text>
              <Text style={styles.errorText}>
                {scheduleQuery.error instanceof Error
                  ? scheduleQuery.error.message
                  : 'Revisa tu conexión e inténtalo nuevamente.'}
              </Text>
              <Pressable
                onPress={() => scheduleQuery.refetch()}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.dayList}>
            {visibleDays.map((day) => (
              <DayCard
                day={day}
                key={day.weekday}
                onConfigure={() => setEditingDay({ ...day })}
                onToggle={() => toggleDay(day.weekday)}
              />
            ))}
          </View>
        )}

        {requestError ? (
          <Text accessibilityRole="alert" style={styles.requestError}>
            {requestError}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!isDirty || saveMutation.isPending}
          onPress={save}
          style={({ pressed }) => [
            styles.saveButton,
            (!isDirty || saveMutation.isPending) && styles.disabledButton,
            pressed && isDirty && styles.pressed,
          ]}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons color="#ffffff" name="checkmark" size={22} />
              <Text style={styles.saveText}>Guardar cambios</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      {editingDay ? (
        <ScheduleSheet
          day={editingDay}
          key={`${editingDay.weekday}-${editingDay.startMinute}-${editingDay.endMinute}`}
          onClose={() => setEditingDay(null)}
          onSave={updateInterval}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DayCard({
  day,
  onConfigure,
  onToggle,
}: {
  readonly day: BusinessScheduleDay;
  readonly onConfigure: () => void;
  readonly onToggle: () => void;
}) {
  return (
    <View style={[styles.dayCard, !day.isOpen && styles.closedDayCard]}>
      <View style={styles.dayControls}>
        <Pressable
          accessibilityLabel={`${day.isOpen ? 'Desactivar' : 'Activar'} ${DAY_NAMES[day.weekday]}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: day.isOpen }}
          hitSlop={5}
          onPress={onToggle}
          style={[styles.checkbox, day.isOpen && styles.checkboxActive]}
        >
          {day.isOpen ? (
            <Ionicons color="#ffffff" name="checkmark" size={18} />
          ) : null}
        </Pressable>
        <Pressable
          accessibilityLabel={`Configurar horario del ${DAY_NAMES[day.weekday]}`}
          accessibilityRole="button"
          disabled={!day.isOpen}
          hitSlop={5}
          onPress={onConfigure}
          style={({ pressed }) => [
            styles.configureButton,
            !day.isOpen && styles.configureButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            color={day.isOpen ? COLORS.text : '#a7abb1'}
            name="settings-outline"
            size={20}
          />
        </Pressable>
      </View>
      <View style={styles.dayCopy}>
        <Text style={styles.dayName}>{DAY_NAMES[day.weekday]}</Text>
        <Text style={[styles.dayStatus, !day.isOpen && styles.closedText]}>
          {day.isOpen
            ? `${formatMinute(day.startMinute)} – ${formatMinute(day.endMinute)}`
            : 'Cerrado'}
        </Text>
      </View>
      <View style={[styles.statusPill, !day.isOpen && styles.closedStatusPill]}>
        <Text
          style={[
            styles.statusPillText,
            !day.isOpen && styles.closedStatusPillText,
          ]}
        >
          {day.isOpen ? 'Abierto' : 'Cerrado'}
        </Text>
      </View>
    </View>
  );
}

function ScheduleSheet({
  day,
  onClose,
  onSave,
}: {
  readonly day: BusinessScheduleDay;
  readonly onClose: () => void;
  readonly onSave: (day: BusinessScheduleDay) => void;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const [openingTime, setOpeningTime] = useState(() =>
    formatMinute(day.startMinute),
  );
  const [closingTime, setClosingTime] = useState(() =>
    formatMinute(day.endMinute),
  );
  const [error, setError] = useState<string | null>(null);

  const closeAnimated = useCallback(() => {
    Animated.timing(translateY, {
      duration: 180,
      toValue: 520,
      useNativeDriver: true,
    }).start(onClose);
  }, [onClose, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 90 || gesture.vy > 0.7) {
            closeAnimated();
            return;
          }
          Animated.spring(translateY, {
            friction: 8,
            tension: 70,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeAnimated, translateY],
  );

  const confirm = useCallback(() => {
    const startMinute = minuteForTime(openingTime);
    const endMinute = minuteForTime(closingTime);
    if (endMinute <= startMinute) {
      setError('La hora de cierre debe ser posterior a la hora de apertura.');
      return;
    }
    onSave({ ...day, endMinute, startMinute });
  }, [closingTime, day, onSave, openingTime]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={closeAnimated}
      transparent
      visible
    >
      <View style={styles.sheetLayer}>
        <Pressable
          accessibilityLabel="Cerrar configuración de horario"
          onPress={closeAnimated}
          style={styles.sheetBackdrop}
        />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.sheetDragArea} {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
          </View>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetEyebrow}>Horario de atención</Text>
              <Text style={styles.sheetTitle}>{DAY_NAMES[day.weekday]}</Text>
            </View>
            <Pressable
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              onPress={closeAnimated}
              style={styles.closeButton}
            >
              <Ionicons color={COLORS.text} name="close" size={24} />
            </Pressable>
          </View>
          <Text style={styles.sheetDescription}>
            Configura un único intervalo de apertura y cierre para este día.
          </Text>
          <View style={styles.timeFields}>
            <TimeField
              label="Apertura"
              onChange={(value) => {
                setOpeningTime(value);
                setError(null);
              }}
              value={openingTime}
            />
            <TimeField
              error={error ?? undefined}
              label="Cierre"
              onChange={(value) => {
                setClosingTime(value);
                setError(null);
              }}
              value={closingTime}
            />
          </View>
          <View style={styles.sheetActions}>
            <Pressable onPress={closeAnimated} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={confirm} style={styles.confirmButton}>
              <Text style={styles.confirmText}>Aplicar horario</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cancelButton: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  cancelText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  checkbox: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#8d939c',
    borderRadius: 7,
    borderWidth: 2,
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  checkboxActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  closedDayCard: { backgroundColor: '#fafafa' },
  closedStatusPill: { backgroundColor: COLORS.surfaceStrong },
  closedStatusPillText: { color: COLORS.muted },
  closedText: { color: COLORS.muted },
  configureButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceStrong,
    borderRadius: 9,
    height: 34,
    justifyContent: 'center',
    marginTop: 8,
    width: 34,
  },
  configureButtonDisabled: { backgroundColor: '#eeeeed' },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    flex: 1.4,
    justifyContent: 'center',
    minHeight: 52,
  },
  confirmText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 38,
    paddingHorizontal: 22,
    paddingTop: 16,
    width: '100%',
  },
  dayCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 92,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dayControls: { alignItems: 'center', width: 44 },
  dayCopy: { flex: 1, marginLeft: 11 },
  dayList: { gap: 12, marginTop: 20 },
  dayName: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  dayStatus: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
    marginTop: 6,
  },
  disabledButton: { backgroundColor: '#9ca1a8' },
  errorCard: {
    alignItems: 'flex-start',
    backgroundColor: '#fff4f2',
    borderColor: '#f2b8b2',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 20,
    padding: 16,
  },
  errorCopy: { flex: 1, marginLeft: 12 },
  errorText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  errorTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  header: { backgroundColor: COLORS.screen, paddingHorizontal: 22 },
  headerButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 8,
    width: 44,
  },
  headerContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    maxWidth: 720,
    minHeight: 64,
    width: '100%',
  },
  headerTitle: {
    color: COLORS.text,
    flex: 1,
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  intro: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    flexDirection: 'row',
    padding: 17,
  },
  introCopy: { flex: 1, marginLeft: 14 },
  introIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceStrong,
    borderRadius: 17,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  introText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  introTitle: { color: COLORS.text, fontSize: 19, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  requestError: {
    color: COLORS.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  retryText: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  saveButton: {
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 56,
  },
  saveText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  screen: { backgroundColor: COLORS.screen, flex: 1 },
  sheet: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxWidth: 720,
    paddingBottom: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    width: '100%',
  },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  sheetBackdrop: {
    backgroundColor: 'rgba(9, 16, 27, 0.44)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetDescription: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  sheetEyebrow: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sheetDragArea: {
    alignItems: 'center',
    marginHorizontal: -22,
    minHeight: 24,
  },
  sheetHandle: {
    backgroundColor: '#c8cbd0',
    borderRadius: 3,
    height: 5,
    marginBottom: 15,
    width: 46,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetLayer: { flex: 1, justifyContent: 'flex-end' },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '800',
    marginTop: 2,
  },
  stateContainer: { alignItems: 'center', paddingVertical: 58 },
  stateText: { color: COLORS.muted, fontSize: 15, marginTop: 12 },
  statusPill: {
    backgroundColor: '#dce7e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: { color: '#244a37', fontSize: 12, fontWeight: '800' },
  timeFields: { gap: 14, marginTop: 18 },
});
