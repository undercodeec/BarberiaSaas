import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  AvailabilityResponse,
  BookingLocationsResponse,
  ClientDetailResponse,
  ServicesResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';
import {
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';

type BookingStep = 'professional' | 'services' | 'schedule';
type TimePeriod = 'all' | 'afternoon' | 'morning' | 'night';
type SlotState = 'available' | 'blocked' | 'occupied' | 'past';
type ScheduleSlot = AvailabilityResponse['slots'][number] & {
  readonly state: SlotState;
};

const SLOT_PREVIEW_LIMIT = 9;
const TIME_PERIODS: ReadonlyArray<{
  readonly id: TimePeriod;
  readonly label: string;
  readonly range?: string;
}> = [
  { id: 'all', label: 'Todos' },
  { id: 'morning', label: 'Mañana', range: '06:00–11:59' },
  { id: 'afternoon', label: 'Tarde', range: '12:00–17:59' },
  { id: 'night', label: 'Noche', range: '18:00–05:59' },
];

function slotMatchesPeriod(
  startsAt: string,
  period: TimePeriod,
  timeZone: string,
) {
  if (period === 'all') return true;

  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone,
    })
      .formatToParts(new Date(startsAt))
      .find((part) => part.type === 'hour')?.value,
  );
  if (period === 'morning') return hour >= 6 && hour < 12;
  if (period === 'afternoon') return hour >= 12 && hour < 18;
  return hour >= 18 || hour < 6;
}

function periodEmptyLabel(period: TimePeriod) {
  return TIME_PERIODS.find(({ id }) => id === period)?.label.toLowerCase();
}

function slotStatusLabel(state: Exclude<SlotState, 'available'>) {
  if (state === 'past') return 'Pasado';
  if (state === 'occupied') return 'Ocupado';
  return 'Bloqueado';
}

function appointmentDateTime(startsAt: string) {
  return new Date(startsAt).toLocaleString('es-EC', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
  });
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function futureDates(timeZone: string) {
  const start = dateInTimeZone(timeZone);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function BookingDetailsScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const layout = useNativeLayoutMetrics();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const withoutClient = clientId === 'without-client';
  const [step, setStep] = useState<BookingStep>('professional');
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [selectedDateValue, setSelectedDateValue] = useState<string | null>(
    null,
  );
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInEmail, setWalkInEmail] = useState('');
  const [createdAppointment, setCreatedAppointment] =
    useState<AppointmentRecord | null>(null);

  const organizationQuery = useCurrentOrganization();
  const teamQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: tenant.key('team'),
  });
  const servicesQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ServicesResponse>('/v1/services'),
    queryKey: tenant.key('services'),
  });
  const bookingLocationsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<BookingLocationsResponse>(
        '/v1/locations/booking-context',
      ),
    queryKey: tenant.key('booking-locations'),
  });
  const clientQuery = useQuery({
    enabled: Boolean(session && clientId && !withoutClient),
    queryFn: () =>
      requireApiClient().request<ClientDetailResponse>(
        `/v1/clients/${clientId}`,
      ),
    queryKey: tenant.key('client-detail', clientId),
  });

  const availableLocations = bookingLocationsQuery.data?.locations ?? [];
  const defaultLocationId =
    availableLocations.find(
      (location) => location.id === organizationQuery.data?.location?.id,
    )?.id ??
    availableLocations[0]?.id ??
    null;
  const locationId = selectedLocationId ?? defaultLocationId;
  const selectedLocation = availableLocations.find(
    (location) => location.id === locationId,
  );
  const timeZone =
    selectedLocation?.timezone ??
    organizationQuery.data?.location?.timezone ??
    organizationQuery.data?.organization?.defaultTimezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC';
  const dates = useMemo(() => futureDates(timeZone), [timeZone]);
  const date =
    dates.find(
      (candidate) => localDateValue(candidate) === selectedDateValue,
    ) ?? dates[0]!;
  const professionals = useMemo(() => {
    if (!locationId) return [];
    const assignedIds = new Set(
      (servicesQuery.data?.services ?? []).flatMap((service) =>
        service.assignments
          .filter((assignment) => assignment.locationId === locationId)
          .map((assignment) => assignment.membershipId),
      ),
    );
    return (teamQuery.data?.members ?? []).filter(
      (member) => member.status === 'active' && assignedIds.has(member.id),
    );
  }, [locationId, servicesQuery.data?.services, teamQuery.data?.members]);

  const availableServices = useMemo(() => {
    if (!professionalId || !locationId) return [];
    return (servicesQuery.data?.services ?? []).filter((service) =>
      service.assignments.some(
        (assignment) =>
          assignment.locationId === locationId &&
          assignment.membershipId === professionalId,
      ),
    );
  }, [locationId, professionalId, servicesQuery.data?.services]);

  const availabilityQuery = useQuery({
    enabled: Boolean(locationId && professionalId && serviceIds.length),
    queryFn: () => {
      const query = new URLSearchParams({
        date: localDateValue(date),
        locationId: locationId!,
        membershipId: professionalId!,
        serviceIds: serviceIds.join(','),
      });
      return requireApiClient().request<AvailabilityResponse>(
        `/v1/availability?${query.toString()}`,
      );
    },
    queryKey: tenant.key(
      'availability',
      localDateValue(date),
      locationId,
      professionalId,
      serviceIds,
    ),
  });

  const [scheduleClock, setScheduleClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setScheduleClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const scheduleSlots = useMemo<ScheduleSlot[]>(() => {
    const availableSlots = (availabilityQuery.data?.slots ?? []).map(
      (slot): ScheduleSlot => ({
        ...slot,
        state:
          Date.parse(slot.startsAt) <= scheduleClock ? 'past' : 'available',
      }),
    );
    const unavailableSlots = (
      availabilityQuery.data?.unavailableSlots ?? []
    ).map((slot): ScheduleSlot => ({
      endsAt: slot.endsAt,
      startsAt: slot.startsAt,
      state: Date.parse(slot.startsAt) <= scheduleClock ? 'past' : slot.reason,
    }));
    return [...availableSlots, ...unavailableSlots].sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
  }, [
    availabilityQuery.data?.slots,
    availabilityQuery.data?.unavailableSlots,
    scheduleClock,
  ]);
  const filteredSlots = scheduleSlots.filter((slot) =>
    slotMatchesPeriod(slot.startsAt, timePeriod, timeZone),
  );
  const visibleSlots = showAllSlots
    ? filteredSlots
    : filteredSlots
        .filter((slot) => slot.state !== 'past')
        .slice(0, SLOT_PREVIEW_LIMIT);
  const hasMoreSlots = filteredSlots.length > visibleSlots.length;
  const hasAvailableSlots = filteredSlots.some(
    (slot) => slot.state === 'available',
  );

  const selectedProfessional = professionals.find(
    (professional) => professional.id === professionalId,
  );
  const selectedServices = availableServices.filter((service) =>
    serviceIds.includes(service.id),
  );
  const totalCents = selectedServices.reduce(
    (total, service) => total + service.priceCents,
    0,
  );
  const clientName = withoutClient
    ? walkInName.trim()
    : [clientQuery.data?.client.fullName, clientQuery.data?.client.lastName]
        .filter(Boolean)
        .join(' ');

  const createAppointment = useMutation({
    mutationFn: () => {
      if (!locationId || !professionalId || !startsAt) {
        throw new Error('Completa los datos de la cita.');
      }
      return requireApiClient().request<{ appointment: AppointmentRecord }>(
        '/v1/appointments',
        {
          body: {
            ...(withoutClient
              ? {
                  clientEmail: walkInEmail.trim() || undefined,
                  clientName: walkInName.trim(),
                  clientPhone: walkInPhone.trim() || undefined,
                }
              : { clientId }),
            locationId,
            professionalMembershipId: professionalId,
            serviceIds,
            startsAt,
          },
          method: 'POST',
        },
      );
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos crear la cita',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async ({ appointment }) => {
      setCreatedAppointment(appointment);
      setStartsAt(null);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('agenda-appointments'),
      });
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('availability'),
      });
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('client-detail'),
      });
      Alert.alert(
        'Cita agendada',
        'El horario quedó reservado correctamente.',
        [{ onPress: () => router.replace('/agenda'), text: 'Ver Agenda' }],
      );
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  const chooseProfessional = (id: string) => {
    const professional = professionals.find((item) => item.id === id);
    if (professional && !professional.planAvailable) {
      Alert.alert(
        'Profesional conservado',
        'Este profesional y sus datos siguen guardados, pero Nava Free permite operar con un solo profesional. Actualiza a Nava Local para volver a asignarle nuevas citas.',
      );
      return;
    }
    setProfessionalId(id);
    setServiceIds([]);
    setStartsAt(null);
  };
  const chooseLocation = (id: string) => {
    setSelectedLocationId(id);
    setProfessionalId(null);
    setServiceIds([]);
    setStartsAt(null);
    setShowAllSlots(false);
  };
  const toggleService = (id: string) => {
    setServiceIds((current) =>
      current.includes(id)
        ? current.filter((serviceId) => serviceId !== id)
        : [...current, id],
    );
    setStartsAt(null);
  };
  const chooseTimePeriod = (period: TimePeriod) => {
    setTimePeriod(period);
    setShowAllSlots(false);
    if (startsAt && !slotMatchesPeriod(startsAt, period, timeZone)) {
      setStartsAt(null);
    }
  };
  const chooseDate = (nextDate: Date) => {
    setSelectedDateValue(localDateValue(nextDate));
    setStartsAt(null);
    setShowAllSlots(false);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Regresar"
          onPress={() => {
            if (step === 'schedule') setStep('services');
            else if (step === 'services') setStep('professional');
            else if (router.canGoBack()) router.back();
            else router.replace('/new-booking');
          }}
          style={styles.backButton}
        >
          <Ionicons color={appTheme.colors.icon} name="arrow-back" size={23} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Nueva cita</Text>
          <Text style={styles.headerStep}>
            {step === 'professional'
              ? 'PASO 2 DE 4'
              : step === 'services'
                ? 'PASO 3 DE 4'
                : 'PASO 4 DE 4'}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 130 + layout.bottomInset },
        ]}
      >
        {step === 'professional' ? (
          <>
            <Text style={styles.title}>Elige al profesional</Text>
            <Text style={styles.copy}>
              Sólo aparecen integrantes con servicios asignados en esta sede.
            </Text>
            {availableLocations.length > 1 ? (
              <>
                <Text style={styles.sectionTitle}>Sucursal</Text>
                <ScrollView
                  contentContainerStyle={styles.locationRow}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {availableLocations.map((location) => {
                    const selected = location.id === locationId;
                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={location.id}
                        onPress={() => chooseLocation(location.id)}
                        style={[
                          styles.locationOption,
                          selected && styles.locationOptionSelected,
                        ]}
                      >
                        <Ionicons
                          color={
                            selected
                              ? appTheme.colors.accentDark
                              : appTheme.colors.textMuted
                          }
                          name="location-outline"
                          size={18}
                        />
                        <Text
                          style={[
                            styles.locationOptionText,
                            selected && styles.locationOptionTextSelected,
                          ]}
                        >
                          {location.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}
            {professionals.map((professional) => (
              <Pressable
                accessibilityState={{ disabled: !professional.planAvailable }}
                disabled={!professional.planAvailable}
                key={professional.id}
                onPress={() => chooseProfessional(professional.id)}
                style={[
                  styles.card,
                  !professional.planAvailable && styles.cardPlanLocked,
                  professionalId === professional.id && styles.cardSelected,
                ]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {professional.user.fullName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>
                    {professional.user.fullName}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {professional.role === 'owner'
                      ? 'Propietario'
                      : 'Profesional'}
                    {!professional.planAvailable
                      ? ' · Guardado: no disponible en tu acceso actual'
                      : ''}
                  </Text>
                </View>
                <Selection selected={professionalId === professional.id} />
              </Pressable>
            ))}
            {!professionals.length &&
            !teamQuery.isLoading &&
            !servicesQuery.isLoading ? (
              <Text style={styles.empty}>
                Asigna servicios y horario a un profesional para crear citas.
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 'services' ? (
          <>
            <Text style={styles.title}>Selecciona los servicios</Text>
            <Text style={styles.copy}>
              Puedes combinar varios servicios en una misma cita.
            </Text>
            {availableServices.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => toggleService(service.id)}
                style={[
                  styles.card,
                  serviceIds.includes(service.id) && styles.cardSelected,
                ]}
              >
                <View style={styles.serviceIcon}>
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name="cut-outline"
                    size={22}
                  />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{service.name}</Text>
                  <Text style={styles.cardMeta}>
                    {service.durationMinutes} min · $
                    {(service.priceCents / 100).toFixed(2)}
                  </Text>
                </View>
                <Selection selected={serviceIds.includes(service.id)} />
              </Pressable>
            ))}
            {serviceIds.length ? (
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>
                  {serviceIds.length} servicio
                  {serviceIds.length === 1 ? '' : 's'}
                </Text>
                <Text style={styles.totalValue}>
                  ${(totalCents / 100).toFixed(2)}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        {step === 'schedule' ? (
          <>
            <Text style={styles.title}>Fecha y horario</Text>
            <Text style={styles.copy}>
              La disponibilidad respeta horario, bloqueos y citas existentes.
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
                    onPress={() => chooseDate(item)}
                    style={[styles.dateCard, selected && styles.dateSelected]}
                  >
                    <Text
                      style={[
                        styles.dateDay,
                        selected && styles.dateTextSelected,
                      ]}
                    >
                      {item
                        .toLocaleDateString('es-EC', { weekday: 'short' })
                        .replace('.', '')}
                    </Text>
                    <Text
                      style={[
                        styles.dateNumber,
                        selected && styles.dateTextSelected,
                      ]}
                    >
                      {item.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.sectionTitle}>Horarios disponibles</Text>
            <View
              accessibilityLabel="Filtrar horarios por franja"
              accessibilityRole="radiogroup"
              style={styles.timePeriodFilters}
            >
              {TIME_PERIODS.map((period) => {
                const selected = timePeriod === period.id;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={period.id}
                    onPress={() => chooseTimePeriod(period.id)}
                    style={[
                      styles.timePeriodFilter,
                      selected && styles.timePeriodFilterSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.timePeriodLabel,
                        selected && styles.timePeriodLabelSelected,
                      ]}
                    >
                      {period.label}
                    </Text>
                    {period.range ? (
                      <Text
                        style={[
                          styles.timePeriodRange,
                          selected && styles.timePeriodRangeSelected,
                        ]}
                      >
                        {period.range}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            {availabilityQuery.isLoading ? (
              <Text style={styles.empty}>Consultando disponibilidad...</Text>
            ) : null}
            <View style={styles.slotGrid}>
              {visibleSlots.map((slot) => {
                const unavailable = slot.state !== 'available';
                const selected = !unavailable && startsAt === slot.startsAt;
                return (
                  <Pressable
                    accessibilityState={{ disabled: unavailable, selected }}
                    disabled={unavailable}
                    key={slot.startsAt}
                    onPress={() => setStartsAt(slot.startsAt)}
                    style={[
                      styles.slot,
                      unavailable && styles.slotUnavailable,
                      slot.state === 'past' && styles.slotPast,
                      slot.state === 'occupied' && styles.slotOccupied,
                      selected && styles.slotSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        unavailable && styles.slotTextUnavailable,
                        selected && styles.slotTextSelected,
                      ]}
                    >
                      {new Date(slot.startsAt).toLocaleTimeString('es-EC', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone,
                      })}
                    </Text>
                    {unavailable ? (
                      <Text style={styles.slotStatusLabel}>
                        {slotStatusLabel(slot.state)}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            {hasMoreSlots ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAllSlots((visible) => !visible)}
                style={styles.showMoreSlotsButton}
              >
                <Text style={styles.showMoreSlotsLabel}>
                  {showAllSlots
                    ? 'Mostrar menos horarios'
                    : `Ver ${filteredSlots.length - SLOT_PREVIEW_LIMIT} horarios más`}
                </Text>
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name={showAllSlots ? 'chevron-up' : 'chevron-down'}
                  size={20}
                />
              </Pressable>
            ) : null}
            {!availabilityQuery.isLoading &&
            filteredSlots.length &&
            !hasAvailableSlots ? (
              <Text style={styles.empty}>
                Los horarios mostrados ya no estan disponibles para reservar.
              </Text>
            ) : null}
            {!availabilityQuery.isLoading && !filteredSlots.length ? (
              <Text style={styles.empty}>
                {timePeriod === 'all'
                  ? 'No hay espacios disponibles para esta fecha.'
                  : `No hay horarios disponibles en la ${periodEmptyLabel(timePeriod)}.`}
              </Text>
            ) : null}

            {withoutClient ? (
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Cliente de mostrador</Text>
                <TextInput
                  onChangeText={setWalkInName}
                  placeholder="Nombre completo *"
                  placeholderTextColor="#87909D"
                  style={styles.input}
                  value={walkInName}
                />
                <TextInput
                  keyboardType="phone-pad"
                  onChangeText={setWalkInPhone}
                  placeholder="Teléfono"
                  placeholderTextColor="#87909D"
                  style={styles.input}
                  value={walkInPhone}
                />
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setWalkInEmail}
                  placeholder="Correo"
                  placeholderTextColor="#87909D"
                  style={styles.input}
                  value={walkInEmail}
                />
              </View>
            ) : null}

            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Resumen</Text>
              <SummaryRow label="Cliente" value={clientName || 'Cargando...'} />
              <SummaryRow
                label="Profesional"
                value={selectedProfessional?.user.fullName ?? ''}
              />
              <SummaryRow
                label="Servicios"
                value={selectedServices
                  .map((service) => service.name)
                  .join(', ')}
              />
              <SummaryRow
                label="Total"
                value={`$${(totalCents / 100).toFixed(2)}`}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: layout.bottomActionPadding }]}
      >
        {step === 'professional' ? (
          <ActionButton
            disabled={!professionalId}
            label="Continuar"
            onPress={() => setStep('services')}
          />
        ) : null}
        {step === 'services' ? (
          <ActionButton
            disabled={!serviceIds.length}
            label="Elegir horario"
            onPress={() => setStep('schedule')}
          />
        ) : null}
        {step === 'schedule' ? (
          <ActionButton
            disabled={
              !startsAt ||
              createAppointment.isPending ||
              (withoutClient && walkInName.trim().length < 2)
            }
            label={
              createAppointment.isPending ? 'Agendando...' : 'Confirmar cita'
            }
            onPress={() => createAppointment.mutate()}
          />
        ) : null}
      </View>
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={() => setCreatedAppointment(null)}
        statusBarTranslucent
        transparent
        visible={createdAppointment !== null}
      >
        <View
          style={[
            styles.successOverlay,
            {
              paddingBottom: layout.bottomInset,
              paddingTop: layout.topInset,
            },
          ]}
        >
          <View accessibilityRole="alert" style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons
                color={appTheme.colors.white}
                name="checkmark"
                size={30}
              />
            </View>
            <Text style={styles.successTitle}>Cita agendada</Text>
            <Text style={styles.successCopy}>
              Tu cita fue reservada correctamente.
            </Text>
            {createdAppointment ? (
              <Text style={styles.successDate}>
                {appointmentDateTime(createdAppointment.startsAt)}
              </Text>
            ) : null}
            <Pressable
              onPress={() => router.replace('/agenda')}
              style={styles.successPrimaryButton}
            >
              <Text style={styles.successPrimaryLabel}>Ver agenda</Text>
            </Pressable>
            <Pressable
              onPress={() => setCreatedAppointment(null)}
              style={styles.successSecondaryButton}
            >
              <Text style={styles.successSecondaryLabel}>Crear otra cita</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Selection({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.selection, selected && styles.selectionSelected]}>
      {selected ? (
        <Ionicons color={appTheme.colors.white} name="checkmark" size={15} />
      ) : null}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.actionDisabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
      <Ionicons color={appTheme.colors.white} name="arrow-forward" size={19} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
    ...goldButtonShadow,
  },
  actionDisabled: { opacity: 0.35 },
  actionText: { color: appTheme.colors.white, fontSize: 16, fontWeight: '900' },
  avatar: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: appTheme.colors.accentActive,
    fontSize: 17,
    fontWeight: '900',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  card: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 14,
  },
  cardCopy: { flex: 1, marginLeft: 12 },
  cardMeta: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 4 },
  cardSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accent,
  },
  cardPlanLocked: { opacity: 0.46 },
  cardTitle: { color: appTheme.colors.text, fontSize: 15, fontWeight: '900' },
  content: { padding: appTheme.spacing.page, paddingBottom: 130 },
  copy: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
    marginTop: 6,
  },
  dateCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateDay: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dateNumber: {
    color: appTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  dateRow: { gap: 8, paddingBottom: 6 },
  dateSelected: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  dateTextSelected: { color: appTheme.colors.white },
  empty: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: 18,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: appTheme.spacing.page,
    position: 'absolute',
    right: 0,
  },
  formCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    marginTop: 22,
    padding: 15,
  },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: appTheme.spacing.page,
    paddingVertical: 12,
  },
  headerSpacer: { width: 40 },
  headerStep: {
    color: appTheme.colors.accentDark,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  headerTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  input: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 14,
    marginTop: 10,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  locationOption: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationOptionSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accent,
  },
  locationOptionText: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  locationOptionTextSelected: { color: appTheme.colors.accentDark },
  locationRow: { gap: 8, paddingBottom: 3 },
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
  successCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radii.card,
    padding: 24,
    width: '86%',
  },
  successCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  successDate: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  successIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  successOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 18, 21, 0.48)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  successPrimaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    marginTop: 24,
    minHeight: 50,
    justifyContent: 'center',
    width: '100%',
  },
  successPrimaryLabel: {
    color: appTheme.colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  successSecondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 44,
    width: '100%',
  },
  successSecondaryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
  successTitle: {
    color: appTheme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 16,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 20,
  },
  selection: {
    borderColor: appTheme.colors.accentLight,
    borderRadius: 12,
    borderWidth: 1.5,
    height: 24,
    width: 24,
  },
  selectionSelected: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
    justifyContent: 'center',
  },
  serviceIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  slot: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    minWidth: '30%',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotSelected: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  slotOccupied: {
    backgroundColor: '#FDE9E6',
    borderColor: '#E8B6AF',
  },
  slotPast: { opacity: 0.48 },
  slotStatusLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  slotTextUnavailable: { color: appTheme.colors.textMuted },
  slotUnavailable: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  slotText: { color: appTheme.colors.text, fontSize: 13, fontWeight: '800' },
  slotTextSelected: { color: appTheme.colors.white },
  showMoreSlotsButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: 16,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  showMoreSlotsLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '900',
  },
  timePeriodFilter: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  timePeriodFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  timePeriodFilterSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accent,
  },
  timePeriodLabel: {
    color: appTheme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  timePeriodLabelSelected: { color: appTheme.colors.accentDark },
  timePeriodRange: {
    color: appTheme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  timePeriodRangeSelected: { color: appTheme.colors.accentDark },
  summary: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    marginTop: 22,
    padding: 17,
    shadowColor: appTheme.colors.accentDark,
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  summaryLabel: { color: appTheme.colors.textMuted, fontSize: 12 },
  summaryRow: {
    alignItems: 'flex-start',
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  summaryTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  summaryValue: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  totalCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    padding: 16,
  },
  totalLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  totalValue: {
    color: appTheme.colors.accentDark,
    fontSize: 18,
    fontWeight: '900',
  },
});
