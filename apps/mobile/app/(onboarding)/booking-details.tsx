import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  AvailabilityResponse,
  ClientDetailResponse,
  CurrentOrganizationResponse,
  ServicesResponse,
  TeamResponse,
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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';
import {
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';

type BookingStep = 'professional' | 'services' | 'schedule';
type TimePeriod = 'all' | 'afternoon' | 'morning' | 'night';

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

function slotMatchesPeriod(startsAt: string, period: TimePeriod) {
  if (period === 'all') return true;

  const hour = new Date(startsAt).getHours();
  if (period === 'morning') return hour >= 6 && hour < 12;
  if (period === 'afternoon') return hour >= 12 && hour < 18;
  return hour >= 18 || hour < 6;
}

function periodEmptyLabel(period: TimePeriod) {
  return TIME_PERIODS.find(({ id }) => id === period)?.label.toLowerCase();
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function futureDates() {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function BookingDetailsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const withoutClient = clientId === 'without-client';
  const [step, setStep] = useState<BookingStep>('professional');
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const dates = useMemo(() => futureDates(), []);
  const [date, setDate] = useState(dates[0]!);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInEmail, setWalkInEmail] = useState('');

  const organizationQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentOrganizationResponse>(
        '/v1/organizations/current',
      ),
    queryKey: ['current-organization'],
  });
  const teamQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: ['team'],
  });
  const servicesQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ServicesResponse>('/v1/services'),
    queryKey: ['services'],
  });
  const clientQuery = useQuery({
    enabled: Boolean(session && clientId && !withoutClient),
    queryFn: () =>
      requireApiClient().request<ClientDetailResponse>(
        `/v1/clients/${clientId}`,
      ),
    queryKey: ['client', clientId],
  });

  const locationId = organizationQuery.data?.location?.id ?? null;
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
    queryKey: [
      'availability',
      localDateValue(date),
      locationId,
      professionalId,
      serviceIds,
    ],
  });

  const filteredSlots = useMemo(
    () =>
      (availabilityQuery.data?.slots ?? []).filter((slot) =>
        slotMatchesPeriod(slot.startsAt, timePeriod),
      ),
    [availabilityQuery.data?.slots, timePeriod],
  );
  const visibleSlots = showAllSlots
    ? filteredSlots
    : filteredSlots.slice(0, SLOT_PREVIEW_LIMIT);
  const hasMoreSlots = filteredSlots.length > SLOT_PREVIEW_LIMIT;

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['agenda-appointments'],
      });
      await queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      Alert.alert(
        'Cita agendada',
        'El horario quedó reservado correctamente.',
        [{ onPress: () => router.replace('/agenda'), text: 'Ver Agenda' }],
      );
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  const chooseProfessional = (id: string) => {
    setProfessionalId(id);
    setServiceIds([]);
    setStartsAt(null);
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
    if (startsAt && !slotMatchesPeriod(startsAt, period)) {
      setStartsAt(null);
    }
  };
  const chooseDate = (nextDate: Date) => {
    setDate(nextDate);
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
            else router.back();
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

      <ScrollView contentContainerStyle={styles.content}>
        {step === 'professional' ? (
          <>
            <Text style={styles.title}>Elige al profesional</Text>
            <Text style={styles.copy}>
              Sólo aparecen integrantes con servicios asignados en esta sede.
            </Text>
            {professionals.map((professional) => (
              <Pressable
                key={professional.id}
                onPress={() => chooseProfessional(professional.id)}
                style={[
                  styles.card,
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
              {visibleSlots.map((slot) => (
                <Pressable
                  key={slot.startsAt}
                  onPress={() => setStartsAt(slot.startsAt)}
                  style={[
                    styles.slot,
                    startsAt === slot.startsAt && styles.slotSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.slotText,
                      startsAt === slot.startsAt && styles.slotTextSelected,
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

      <View style={styles.footer}>
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
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
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
