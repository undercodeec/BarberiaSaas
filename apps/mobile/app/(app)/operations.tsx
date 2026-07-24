import type {
  ServicesResponse,
  SchedulesResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { SelectionList } from '../../src/components/SelectionList';
import { TextField } from '../../src/components/TextField';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { theme } from '../../src/theme';

const weekdayOptions = [
  { id: '1', label: 'Lun' },
  { id: '2', label: 'Mar' },
  { id: '3', label: 'Mié' },
  { id: '4', label: 'Jue' },
  { id: '5', label: 'Vie' },
  { id: '6', label: 'Sáb' },
  { id: '0', label: 'Dom' },
];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No fue posible completar la acción.';
}

function timeToMinute(value: string): number {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match) throw new Error('Usa horas con formato HH:MM.');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error('La hora no es válida.');
  return hours * 60 + minutes;
}

export default function OperationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const organizationQuery = useCurrentOrganization();
  const current = organizationQuery.data;
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<
    readonly string[]
  >([]);
  const [serviceName, setServiceName] = useState('');
  const [duration, setDuration] = useState('30');
  const [price, setPrice] = useState('12');
  const [selectedBarberIds, setSelectedBarberIds] = useState<readonly string[]>(
    [],
  );
  const [selectedServiceIds, setSelectedServiceIds] = useState<
    readonly string[]
  >([]);
  const [customDuration, setCustomDuration] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState<readonly string[]>([
    '1',
    '2',
    '3',
    '4',
    '5',
  ]);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('17:00');
  const [blockStartsAt, setBlockStartsAt] = useState('');
  const [blockEndsAt, setBlockEndsAt] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const canManage =
    current?.membership.role === 'owner' ||
    current?.membership.role === 'manager';
  const canInvite = current?.membership.role === 'owner';

  const teamQuery = useQuery({
    enabled: Boolean(current),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: ['team'],
  });
  const servicesQuery = useQuery({
    enabled: Boolean(current),
    queryFn: () => requireApiClient().request<ServicesResponse>('/v1/services'),
    queryKey: ['services'],
  });
  const schedulesQuery = useQuery({
    enabled: Boolean(current),
    queryFn: () =>
      requireApiClient().request<SchedulesResponse>('/v1/schedules'),
    queryKey: ['schedules'],
  });

  const selectedBarberId = selectedBarberIds[0];
  const selectedServiceId = selectedServiceIds[0];
  const selectedCategoryId = selectedCategoryIds[0];
  const locationId = current?.location?.id;
  const barberOptions =
    teamQuery.data?.members
      .filter(
        (member) =>
          member.role === 'barber' &&
          (member.status === 'active' || member.status === 'invited'),
      )
      .map((member) => ({
        id: member.id,
        label: `${member.user.fullName}${member.status === 'invited' ? ' · invitación pendiente' : ''}`,
      })) ?? [];
  const configuredBarbers = barberOptions.length;
  const pendingInvitations = teamQuery.data?.pendingInvitations ?? [];
  const serviceOptions =
    servicesQuery.data?.services.map((service) => ({
      id: service.id,
      label: `${service.name} · ${service.durationMinutes} min`,
    })) ?? [];
  const categoryOptions =
    servicesQuery.data?.categories.map((category) => ({
      id: category.id,
      label: category.name,
    })) ?? [];

  const notifyError = (error: unknown) => {
    setSuccess(false);
    setMessage(errorMessage(error));
  };
  const notifySuccess = (text: string) => {
    setSuccess(true);
    setMessage(text);
  };
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team'] }),
      queryClient.invalidateQueries({ queryKey: ['services'] }),
      queryClient.invalidateQueries({ queryKey: ['schedules'] }),
    ]);
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/team/invitations', {
        body: { email, fullName, locationId, role: 'barber' },
        method: 'POST',
      }),
    onError: notifyError,
    onSuccess: async () => {
      setEmail('');
      setFullName('');
      notifySuccess(
        'Barbero creado e invitación enviada por email. Ya puedes configurar sus servicios y horarios; podrá operar cuando acepte la invitación.',
      );
      await refresh();
    },
  });

  const categoryMutation = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/service-categories', {
        body: { name: categoryName },
        method: 'POST',
      }),
    onError: notifyError,
    onSuccess: async () => {
      setCategoryName('');
      notifySuccess('Categoría creada correctamente.');
      await refresh();
    },
  });

  const serviceMutation = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/services', {
        body: {
          categoryId: selectedCategoryId,
          durationMinutes: Number(duration),
          name: serviceName,
          priceCents: Math.round(Number(price) * 100),
        },
        method: 'POST',
      }),
    onError: notifyError,
    onSuccess: async () => {
      setServiceName('');
      notifySuccess('Servicio creado correctamente.');
      await refresh();
    },
  });

  const assignmentMutation = useMutation({
    mutationFn: () => {
      if (!selectedBarberId || !selectedServiceId || !locationId) {
        throw new Error('Selecciona un barbero y un servicio.');
      }
      return requireApiClient().request('/v1/services/assignments', {
        body: {
          customDurationMinutes: customDuration
            ? Number(customDuration)
            : undefined,
          customPriceCents: customPrice
            ? Math.round(Number(customPrice) * 100)
            : undefined,
          locationId,
          membershipId: selectedBarberId,
          serviceId: selectedServiceId,
        },
        method: 'POST',
      });
    },
    onError: notifyError,
    onSuccess: () => notifySuccess('Servicio asignado correctamente.'),
  });

  const scheduleMutation = useMutation({
    mutationFn: () => {
      if (!selectedBarberId || !locationId || selectedWeekdays.length === 0) {
        throw new Error('Selecciona un barbero y al menos un día.');
      }
      const startMinute = timeToMinute(scheduleStart);
      const endMinute = timeToMinute(scheduleEnd);
      return requireApiClient().request('/v1/schedules', {
        body: {
          locationId,
          membershipId: selectedBarberId,
          schedules: selectedWeekdays.map((weekday) => ({
            endMinute,
            startMinute,
            weekday: Number(weekday),
          })),
        },
        method: 'PUT',
      });
    },
    onError: notifyError,
    onSuccess: async () => {
      notifySuccess('Horario configurado correctamente.');
      await refresh();
    },
  });

  const blockMutation = useMutation({
    mutationFn: () => {
      if (!selectedBarberId || !locationId) {
        throw new Error('Selecciona el barbero que tendrá el bloqueo.');
      }
      return requireApiClient().request('/v1/schedule-blocks', {
        body: {
          endsAt: blockEndsAt,
          locationId,
          membershipId: selectedBarberId,
          reason: blockReason || undefined,
          startsAt: blockStartsAt,
        },
        method: 'POST',
      });
    },
    onError: notifyError,
    onSuccess: async () => {
      setBlockStartsAt('');
      setBlockEndsAt('');
      setBlockReason('');
      notifySuccess('Bloqueo creado correctamente.');
      await refresh();
    },
  });

  return (
    <Screen
      description="Configura la capacidad operativa de tu barbería."
      title="Operación"
    >
      {message ? (
        <InlineMessage message={message} tone={success ? 'success' : 'error'} />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.heading}>Estado de configuración</Text>
        <Text style={styles.item}>
          {configuredBarbers} barbero(s) configurado(s) ·{' '}
          {servicesQuery.data?.services.length ?? 0} servicio(s) ·{' '}
          {schedulesQuery.data?.schedules.length ?? 0} horario(s)
        </Text>
        {configuredBarbers === 0 ? (
          <InlineMessage message="Aún no hay barberos. Crea el perfil y podrás configurar sus servicios y horarios mientras acepta la invitación enviada por email." />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Equipo</Text>
        {teamQuery.data?.members.map((member) => (
          <Text key={member.id} style={styles.item}>
            {member.user.fullName} · {member.role}
          </Text>
        ))}
        {canInvite ? (
          <>
            <TextField
              autoComplete="name"
              label="Nombre del nuevo barbero"
              onChangeText={setFullName}
              value={fullName}
            />
            <TextField
              autoCapitalize="none"
              keyboardType="email-address"
              label="Correo del nuevo barbero"
              onChangeText={setEmail}
              value={email}
            />
            <PrimaryButton
              disabled={!email || !fullName.trim() || !locationId}
              label="Crear e invitar barbero"
              loading={inviteMutation.isPending}
              onPress={() => inviteMutation.mutate()}
            />
            {pendingInvitations.map((invitation) => (
              <Text key={invitation.id} style={styles.item}>
                Pendiente: {invitation.email} · vence{' '}
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </Text>
            ))}
          </>
        ) : null}
      </View>

      {canManage ? (
        <>
          <View style={styles.section}>
            <Text style={styles.heading}>Categorías y servicios</Text>
            <TextField
              label="Nueva categoría"
              onChangeText={setCategoryName}
              value={categoryName}
            />
            <PrimaryButton
              disabled={!categoryName}
              label="Crear categoría"
              loading={categoryMutation.isPending}
              onPress={() => categoryMutation.mutate()}
              variant="secondary"
            />
            {servicesQuery.data?.categories.map((category) => (
              <Text key={category.id} style={styles.item}>
                Categoría guardada: {category.name}
              </Text>
            ))}
            <SelectionList
              label="Categoría del servicio (opcional)"
              onChange={setSelectedCategoryIds}
              options={categoryOptions}
              selectedIds={selectedCategoryIds}
            />
            <TextField
              label="Nombre del servicio"
              onChangeText={setServiceName}
              value={serviceName}
            />
            <TextField
              keyboardType="number-pad"
              label="Duración en minutos"
              onChangeText={setDuration}
              value={duration}
            />
            <TextField
              keyboardType="decimal-pad"
              label="Precio"
              onChangeText={setPrice}
              value={price}
            />
            <PrimaryButton
              disabled={!serviceName || !duration || !price}
              label="Crear servicio"
              loading={serviceMutation.isPending}
              onPress={() => serviceMutation.mutate()}
            />
            {servicesQuery.data?.services.map((service) => (
              <Text key={service.id} style={styles.item}>
                Servicio guardado: {service.name} · {service.durationMinutes}{' '}
                min · ${(service.priceCents / 100).toFixed(2)}
              </Text>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.heading}>Asignaciones</Text>
            {configuredBarbers === 0 ? (
              <InlineMessage message="Crea primero el perfil del barbero. Podrás asignarle servicios aunque su invitación siga pendiente." />
            ) : null}
            <SelectionList
              label="Barbero"
              onChange={setSelectedBarberIds}
              options={barberOptions}
              selectedIds={selectedBarberIds}
            />
            <SelectionList
              label="Servicio"
              onChange={setSelectedServiceIds}
              options={serviceOptions}
              selectedIds={selectedServiceIds}
            />
            <TextField
              keyboardType="number-pad"
              label="Duración personalizada (opcional)"
              onChangeText={setCustomDuration}
              value={customDuration}
            />
            <TextField
              keyboardType="decimal-pad"
              label="Precio personalizado (opcional)"
              onChangeText={setCustomPrice}
              value={customPrice}
            />
            <PrimaryButton
              disabled={!selectedBarberId || !selectedServiceId || !locationId}
              label="Asignar servicio"
              loading={assignmentMutation.isPending}
              onPress={() => assignmentMutation.mutate()}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.heading}>Horarios</Text>
            {configuredBarbers === 0 ? (
              <InlineMessage message="Crea primero el perfil del barbero. Su horario puede configurarse antes de que acepte la invitación." />
            ) : null}
            <Text style={styles.item}>
              {schedulesQuery.data?.schedules.length ?? 0} intervalos y{' '}
              {schedulesQuery.data?.blocks.length ?? 0} bloqueos vigentes
            </Text>
            <SelectionList
              label="Días de trabajo"
              multiple
              onChange={setSelectedWeekdays}
              options={weekdayOptions}
              selectedIds={selectedWeekdays}
            />
            <TextField
              label="Hora de inicio (HH:MM)"
              onChangeText={setScheduleStart}
              value={scheduleStart}
            />
            <TextField
              label="Hora de fin (HH:MM)"
              onChangeText={setScheduleEnd}
              value={scheduleEnd}
            />
            <PrimaryButton
              disabled={!selectedBarberId || selectedWeekdays.length === 0}
              label="Guardar horario"
              loading={scheduleMutation.isPending}
              onPress={() => scheduleMutation.mutate()}
            />
            <Text style={styles.subheading}>Nuevo bloqueo</Text>
            <TextField
              autoCapitalize="none"
              label="Inicio ISO (ej. 2030-01-15T14:00:00-05:00)"
              onChangeText={setBlockStartsAt}
              value={blockStartsAt}
            />
            <TextField
              autoCapitalize="none"
              label="Fin ISO"
              onChangeText={setBlockEndsAt}
              value={blockEndsAt}
            />
            <TextField
              label="Motivo (opcional)"
              onChangeText={setBlockReason}
              value={blockReason}
            />
            <PrimaryButton
              disabled={!selectedBarberId || !blockStartsAt || !blockEndsAt}
              label="Crear bloqueo"
              loading={blockMutation.isPending}
              onPress={() => blockMutation.mutate()}
              variant="secondary"
            />
          </View>
        </>
      ) : (
        <View style={styles.section}>
          <Text style={styles.heading}>Servicios y horarios</Text>
          {servicesQuery.data?.services.map((service) => (
            <Text key={service.id} style={styles.item}>
              {service.name} · {service.durationMinutes} min · $
              {(service.priceCents / 100).toFixed(2)}
            </Text>
          ))}
          <Text style={styles.item}>
            {schedulesQuery.data?.schedules.length ?? 0} intervalos configurados
          </Text>
        </View>
      )}

      <PrimaryButton
        label="Volver"
        onPress={() => router.back()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 14,
  },
  item: { color: theme.colors.muted, fontSize: 14, marginBottom: 10 },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 20,
    padding: 18,
  },
  subheading: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 24,
  },
});
