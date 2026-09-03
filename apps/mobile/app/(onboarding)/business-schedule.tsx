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
import {
  appStyles,
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

const COLORS = {
  accent: appTheme.colors.accent,
  border: appTheme.colors.border,
  danger: appTheme.colors.danger,
  muted: appTheme.colors.textMuted,
  screen: appTheme.colors.background,
  surface: appTheme.colors.surface,
  surfaceStrong: appTheme.colors.accentWash,
  text: appTheme.colors.text,
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

type AccessibleLocationsResponse = {
  readonly locations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
};

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
  const { session } = useAuth();
  const tenant = useTenantScope();
  const [dayOverrides, setDayOverrides] = useState<
    Partial<Record<number, BusinessScheduleDay>>
  >({});
  const [editingDay, setEditingDay] = useState<BusinessScheduleDay | null>(
    null,
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [requestError, setRequestError] = useState<string | null>(null);

  const scheduleQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<BusinessScheduleResponse>(
        selectedLocationId
          ? `/v1/business-schedule?locationId=${encodeURIComponent(selectedLocationId)}`
          : '/v1/business-schedule',
      ),
    queryKey: tenant.key('business-schedule', selectedLocationId ?? 'default'),
  });
  const accessibleLocationsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<AccessibleLocationsResponse>(
        '/v1/locations/accessible',
      ),
    queryKey: tenant.key('accessible-locations'),
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
      queryClient.setQueryData(tenant.key('business-schedule'), response);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('business-schedule'),
      });
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('availability'),
      });
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
            <Ionicons
              color={appTheme.colors.accentDark}
              name="arrow-back"
              size={25}
            />
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
            <Ionicons
              color={appTheme.colors.accentDark}
              name="calendar-outline"
              size={28}
            />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Horario general</Text>
            <Text style={styles.introText}>
              Define cuándo abre tu negocio. La agenda solo ofrecerá horarios
              que también estén disponibles para cada profesional.
            </Text>
          </View>
        </View>
        {(accessibleLocationsQuery.data?.locations.length ?? 0) > 1 ? (
          <View style={styles.locationSelector}>
            <Text style={styles.locationSelectorLabel}>Sucursal</Text>
            <View style={styles.locationOptions}>
              {accessibleLocationsQuery.data?.locations.map((location) => {
                const selected =
                  (selectedLocationId ?? scheduleQuery.data?.locationId) ===
                  location.id;
                return (
                  <Pressable
                    key={location.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setDayOverrides({});
                      setSelectedLocationId(location.id);
                    }}
                    style={[
                      styles.locationOption,
                      selected && styles.locationOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.locationOptionLabel,
                        selected && styles.locationOptionLabelSelected,
                      ]}
                    >
                      {location.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

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
            <ActivityIndicator color={appTheme.colors.accentDark} />
          ) : (
            <>
              <Ionicons
                color={appTheme.colors.accentDark}
                name="checkmark"
                size={22}
              />
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
            <Ionicons
              color={appTheme.colors.white}
              name="checkmark"
              size={18}
            />
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
            color={
              day.isOpen
                ? appTheme.colors.accentDark
                : appTheme.colors.textMuted
            }
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
  const layout = useNativeLayoutMetrics();
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
      navigationBarTranslucent
      onRequestClose={closeAnimated}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.sheetLayer}>
        <Pressable
          accessibilityLabel="Cerrar configuración de horario"
          onPress={closeAnimated}
          style={styles.sheetBackdrop}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: layout.sheetMaxHeight,
              paddingBottom: layout.bottomInset + 16,
              transform: [{ translateY }],
            },
          ]}
        >
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
              <Ionicons
                color={appTheme.colors.accentDark}
                name="close"
                size={24}
              />
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
    backgroundColor: appTheme.colors.surface,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  cancelText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  checkbox: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.textMuted,
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
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  closedDayCard: { backgroundColor: appTheme.colors.surfaceMuted },
  closedStatusPill: { backgroundColor: COLORS.surfaceStrong },
  closedStatusPillText: { color: COLORS.muted },
  closedText: { color: COLORS.muted },
  configureButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 9,
    height: 44,
    justifyContent: 'center',
    marginTop: 8,
    width: 44,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  configureButtonDisabled: { backgroundColor: appTheme.colors.surfaceMuted },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 16,
    flex: 1.4,
    justifyContent: 'center',
    minHeight: 52,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  confirmText: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '800',
  },
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
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    borderWidth: 0,
    flexDirection: 'row',
    minHeight: 92,
    paddingHorizontal: 14,
    paddingVertical: 13,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
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
    backgroundColor: appTheme.colors.surface,
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 8,
    width: 44,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
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
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    flexDirection: 'row',
    padding: 17,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
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
  locationOption: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  locationOptionLabel: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  locationOptionLabelSelected: { color: appTheme.colors.accentDark },
  locationOptionSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accent,
  },
  locationOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationSelector: { gap: 9 },
  locationSelectorLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },
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
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 56,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  saveText: {
    color: appTheme.colors.accentDark,
    fontSize: 17,
    fontWeight: '800',
  },
  screen: appStyles.screen,
  sheet: {
    alignSelf: 'center',
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
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
    backgroundColor: appTheme.colors.border,
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
