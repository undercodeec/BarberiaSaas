import type {
  AppointmentEventsResponse,
  AppointmentRecord,
  AppointmentsResponse,
  AvailabilityResponse,
  ServicesResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { SelectionList } from '../../src/components/SelectionList';
import { TextField } from '../../src/components/TextField';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { theme } from '../../src/theme';

function today(): string {
  const date = new Date();
  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return offsetDate.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No fue posible actualizar la agenda.';
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AgendaScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const organizationQuery = useCurrentOrganization();
  const current = organizationQuery.data;
  const [date, setDate] = useState(today());
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('Solicitud del cliente');
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<
    readonly string[]
  >([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<
    readonly string[]
  >([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState<readonly string[]>([]);
  const [rescheduleTarget, setRescheduleTarget] =
    useState<AppointmentRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const latestEventId = useRef('0');
  const locationId = current?.location?.id;

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
  const professionalOptions =
    teamQuery.data?.members
      .filter(
        (member) => member.role === 'barber' && member.status === 'active',
      )
      .map((member) => ({ id: member.id, label: member.user.fullName })) ?? [];
  const selectedProfessionalId = selectedProfessionalIds[0];
  const serviceOptions =
    servicesQuery.data?.services
      .filter(
        (service) =>
          !selectedProfessionalId ||
          service.assignments.some(
            (assignment) =>
              assignment.membershipId === selectedProfessionalId &&
              assignment.locationId === locationId,
          ),
      )
      .map((service) => ({
        id: service.id,
        label: `${service.name} · ${service.durationMinutes} min`,
      })) ?? [];
  const availabilityProfessionalId =
    rescheduleTarget?.professionalMembershipId ?? selectedProfessionalIds[0];
  const availabilityServiceIds = rescheduleTarget
    ? rescheduleTarget.services.map((service) => service.serviceId)
    : selectedServiceIds;

  const availabilityQuery = useQuery({
    enabled: Boolean(
      locationId &&
      availabilityProfessionalId &&
      availabilityServiceIds.length > 0 &&
      date,
    ),
    queryFn: () =>
      requireApiClient().request<AvailabilityResponse>(
        `/v1/availability?date=${encodeURIComponent(date)}&locationId=${locationId}&membershipId=${availabilityProfessionalId}&serviceIds=${availabilityServiceIds.join(',')}`,
      ),
    queryKey: [
      'availability',
      date,
      locationId,
      availabilityProfessionalId,
      availabilityServiceIds.join(','),
    ],
  });

  const appointmentsQuery = useQuery({
    enabled: Boolean(locationId && date),
    queryFn: () =>
      requireApiClient().request<AppointmentsResponse>(
        `/v1/appointments?date=${encodeURIComponent(date)}&locationId=${locationId}`,
      ),
    queryKey: ['appointments', date, locationId],
  });

  useQuery({
    enabled: Boolean(current),
    queryFn: async () => {
      const response =
        await requireApiClient().request<AppointmentEventsResponse>(
          `/v1/appointment-events?after=${latestEventId.current}`,
        );
      latestEventId.current = response.latestEventId;
      if (response.events.length > 0) {
        await queryClient.invalidateQueries({ queryKey: ['appointments'] });
        await queryClient.invalidateQueries({ queryKey: ['availability'] });
      }
      return response;
    },
    queryKey: ['appointment-events'],
    refetchInterval: 2_000,
  });

  const notifyError = (error: unknown) => {
    setSuccess(false);
    setMessage(errorMessage(error));
  };
  const notifySuccess = (text: string) => {
    setSuccess(true);
    setMessage(text);
  };
  const refreshAgenda = async () => {
    setSelectedSlotIds([]);
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    await queryClient.invalidateQueries({ queryKey: ['availability'] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const startsAt = selectedSlotIds[0];
      const professionalMembershipId = selectedProfessionalIds[0];
      if (
        !startsAt ||
        !locationId ||
        !professionalMembershipId ||
        selectedServiceIds.length === 0
      ) {
        throw new Error('Selecciona barbero, servicios y horario.');
      }
      return requireApiClient().request('/v1/appointments', {
        body: {
          clientEmail: clientEmail || undefined,
          clientName,
          clientPhone: clientPhone || undefined,
          locationId,
          notes: notes || undefined,
          professionalMembershipId,
          serviceIds: selectedServiceIds,
          startsAt,
        },
        method: 'POST',
      });
    },
    onError: notifyError,
    onSuccess: async () => {
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setNotes('');
      notifySuccess('Cita creada correctamente.');
      await refreshAgenda();
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      const startsAt = selectedSlotIds[0];
      if (!rescheduleTarget || !startsAt) {
        throw new Error('Selecciona una cita y el nuevo horario.');
      }
      return requireApiClient().request(
        `/v1/appointments/${rescheduleTarget.id}/reschedule`,
        { body: { startsAt }, method: 'PATCH' },
      );
    },
    onError: notifyError,
    onSuccess: async () => {
      setRescheduleTarget(null);
      notifySuccess('Cita reprogramada correctamente.');
      await refreshAgenda();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (appointmentId: string) =>
      requireApiClient().request(`/v1/appointments/${appointmentId}/cancel`, {
        body: { reason: cancelReason },
        method: 'POST',
      }),
    onError: notifyError,
    onSuccess: async () => {
      notifySuccess('Cita cancelada; el horario quedó disponible.');
      await refreshAgenda();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      appointmentId,
      status,
    }: {
      appointmentId: string;
      status: string;
    }) =>
      requireApiClient().request(`/v1/appointments/${appointmentId}/status`, {
        body: { status },
        method: 'PATCH',
      }),
    onError: notifyError,
    onSuccess: async () => {
      notifySuccess('Estado actualizado correctamente.');
      await refreshAgenda();
    },
  });

  const slotOptions =
    availabilityQuery.data?.slots.map((slot) => ({
      id: slot.startsAt,
      label: `${timeLabel(slot.startsAt)}–${timeLabel(slot.endsAt)}`,
    })) ?? [];

  return (
    <Screen
      description="Las novedades de otros dispositivos se sincronizan automáticamente."
      title="Agenda diaria"
    >
      {message ? (
        <InlineMessage message={message} tone={success ? 'success' : 'error'} />
      ) : null}
      {professionalOptions.length === 0 ? (
        <InlineMessage message="No hay barberos activos. En Equipo, servicios y horarios, el barbero invitado debe aceptar primero su token." />
      ) : null}
      <TextField
        autoCapitalize="none"
        label="Fecha (AAAA-MM-DD)"
        onChangeText={(value) => {
          setDate(value);
          setSelectedSlotIds([]);
        }}
        value={date}
      />

      <View style={styles.section}>
        <Text style={styles.heading}>Citas</Text>
        <TextField
          label="Motivo para cancelar"
          onChangeText={setCancelReason}
          value={cancelReason}
        />
        {appointmentsQuery.data?.appointments.length ? (
          appointmentsQuery.data.appointments.map((appointment) => (
            <View key={appointment.id} style={styles.appointment}>
              <Text style={styles.name}>{appointment.clientName}</Text>
              <Text style={styles.item}>
                {timeLabel(appointment.startsAt)} · {appointment.status}
              </Text>
              <Text style={styles.item}>
                {appointment.services
                  .map((service) => service.serviceName)
                  .join(', ')}
              </Text>
              {appointment.status !== 'cancelled' &&
              appointment.status !== 'completed' &&
              appointment.status !== 'no_show' ? (
                <>
                  <PrimaryButton
                    label="Reprogramar"
                    onPress={() => {
                      setRescheduleTarget(appointment);
                      setSelectedSlotIds([]);
                    }}
                    variant="secondary"
                  />
                  <PrimaryButton
                    label="Confirmar"
                    onPress={() =>
                      statusMutation.mutate({
                        appointmentId: appointment.id,
                        status: 'confirmed',
                      })
                    }
                    variant="secondary"
                  />
                  <PrimaryButton
                    label="Marcar atendida"
                    onPress={() =>
                      statusMutation.mutate({
                        appointmentId: appointment.id,
                        status: 'completed',
                      })
                    }
                    variant="secondary"
                  />
                  <PrimaryButton
                    label="Marcar no asistió"
                    onPress={() =>
                      statusMutation.mutate({
                        appointmentId: appointment.id,
                        status: 'no_show',
                      })
                    }
                    variant="secondary"
                  />
                  <PrimaryButton
                    label="Cancelar"
                    loading={
                      cancelMutation.isPending &&
                      cancelMutation.variables === appointment.id
                    }
                    onPress={() => cancelMutation.mutate(appointment.id)}
                    variant="secondary"
                  />
                </>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.item}>No hay citas para esta fecha.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>
          {rescheduleTarget
            ? `Reprogramar a ${rescheduleTarget.clientName}`
            : 'Nueva cita'}
        </Text>
        {!rescheduleTarget ? (
          <>
            <SelectionList
              label="Barbero"
              onChange={(ids) => {
                setSelectedProfessionalIds(ids);
                setSelectedSlotIds([]);
              }}
              options={professionalOptions}
              selectedIds={selectedProfessionalIds}
            />
            {selectedProfessionalId && serviceOptions.length === 0 ? (
              <InlineMessage message="Este barbero todavía no tiene servicios asignados en la sucursal." />
            ) : null}
            <SelectionList
              label="Servicios"
              multiple
              onChange={(ids) => {
                setSelectedServiceIds(ids);
                setSelectedSlotIds([]);
              }}
              options={serviceOptions}
              selectedIds={selectedServiceIds}
            />
          </>
        ) : (
          <PrimaryButton
            label="Salir de reprogramación"
            onPress={() => {
              setRescheduleTarget(null);
              setSelectedSlotIds([]);
            }}
            variant="secondary"
          />
        )}
        <SelectionList
          label="Horario disponible"
          onChange={setSelectedSlotIds}
          options={slotOptions}
          selectedIds={selectedSlotIds}
        />
        {rescheduleTarget ? (
          <PrimaryButton
            disabled={!selectedSlotIds[0]}
            label="Guardar nueva hora"
            loading={rescheduleMutation.isPending}
            onPress={() => rescheduleMutation.mutate()}
          />
        ) : (
          <>
            <TextField
              label="Nombre del cliente"
              onChangeText={setClientName}
              value={clientName}
            />
            <TextField
              keyboardType="phone-pad"
              label="Teléfono (opcional)"
              onChangeText={setClientPhone}
              value={clientPhone}
            />
            <TextField
              autoCapitalize="none"
              keyboardType="email-address"
              label="Correo (opcional)"
              onChangeText={setClientEmail}
              value={clientEmail}
            />
            <TextField
              label="Notas (opcional)"
              multiline
              onChangeText={setNotes}
              value={notes}
            />
            <PrimaryButton
              disabled={
                !clientName ||
                !selectedProfessionalIds[0] ||
                selectedServiceIds.length === 0 ||
                !selectedSlotIds[0]
              }
              label="Crear cita"
              loading={createMutation.isPending}
              onPress={() => createMutation.mutate()}
            />
          </>
        )}
      </View>

      {appointmentsQuery.isError || availabilityQuery.isError ? (
        <InlineMessage
          message={errorMessage(
            appointmentsQuery.error ?? availabilityQuery.error,
          )}
        />
      ) : null}
      <PrimaryButton
        label="Volver"
        onPress={() => router.back()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  appointment: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    marginBottom: 14,
    paddingBottom: 14,
  },
  heading: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 14,
  },
  item: { color: theme.colors.muted, fontSize: 14, marginBottom: 10 },
  name: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 20,
    padding: 18,
  },
});
