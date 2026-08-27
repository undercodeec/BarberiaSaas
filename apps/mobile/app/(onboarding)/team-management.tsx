import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  OnboardingAccountDetailsResponse,
  ServicesResponse,
  TeamMember,
  TeamLocationsResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import {
  appStyles,
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { accountQueryKey, tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

const COLORS = {
  border: appTheme.colors.border,
  muted: appTheme.colors.textMuted,
  screen: appTheme.colors.background,
  surface: appTheme.colors.surface,
  text: appTheme.colors.text,
} as const;
const ROLE_LABELS: Record<string, string> = {
  barber: 'Profesional',
  manager: 'Administrador',
  owner: 'Propietario',
  receptionist: 'Recepción',
};

type InvitationRole = 'barber' | 'manager' | 'receptionist';

const INVITATION_ROLES: ReadonlyArray<{
  readonly label: string;
  readonly value: InvitationRole;
}> = [
  { label: 'Profesional', value: 'barber' },
  { label: 'Administrador', value: 'manager' },
  { label: 'Recepción', value: 'receptionist' },
];

export default function TeamManagementScreen() {
  const router = useRouter();
  const layout = useNativeLayoutMetrics();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const tenant = useTenantScope();
  const organizationQuery = useCurrentOrganization();
  const current = organizationQuery.data;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitationRole>('barber');
  const [commissionPercentage, setCommissionPercentage] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<
    readonly string[]
  >([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const canManageTeam =
    current?.membership.role === 'owner' ||
    current?.membership.role === 'manager';

  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
  });
  const teamQuery = useQuery({
    enabled: Boolean(session && current),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: tenant.key('team'),
  });
  const teamLocationsQuery = useQuery({
    enabled: Boolean(
      session &&
      current &&
      canManageTeam &&
      teamQuery.data?.assignmentCapabilities.canEditAssignments,
    ),
    queryFn: () =>
      requireApiClient().request<TeamLocationsResponse>('/v1/team/locations'),
    queryKey: tenant.key('team-locations'),
  });
  const servicesQuery = useQuery({
    enabled: Boolean(
      session &&
      current &&
      canManageTeam &&
      editingMember?.id &&
      role === 'barber' &&
      teamQuery.data?.assignmentCapabilities.canEditAssignments,
    ),
    queryFn: () => requireApiClient().request<ServicesResponse>('/v1/services'),
    queryKey: tenant.key('services'),
  });
  const updateOnlineBooking = useMutation({
    mutationFn: (input: {
      readonly membershipId: string;
      readonly locationId: string;
      readonly onlineBookingEnabled: boolean;
    }) =>
      requireApiClient().request(
        `/v1/team/members/${input.membershipId}/online-booking`,
        {
          body: {
            locationId: input.locationId,
            onlineBookingEnabled: input.onlineBookingEnabled,
          },
          method: 'PATCH',
        },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos actualizar las reservas',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('team'),
      });
    },
  });
  const updateProfessionalService = useMutation({
    mutationFn: ({
      assigned,
      locationId,
      membershipId,
      serviceId,
    }: {
      readonly assigned: boolean;
      readonly locationId: string;
      readonly membershipId: string;
      readonly serviceId: string;
    }) =>
      requireApiClient().request('/v1/services/assignments', {
        body: { locationId, membershipId, serviceId },
        method: assigned ? 'DELETE' : 'POST',
      }),
    onError: (error) =>
      Alert.alert(
        'No pudimos actualizar el servicio',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('services'),
      });
    },
  });
  if (!session) return <Redirect href="/(auth)/login" />;
  if (accountQuery.data?.accountType === 'professional') {
    return <Redirect href="/business-settings" />;
  }

  const teamEnabled = teamQuery.data?.teamEnabled ?? true;
  const assignmentCapabilities = teamQuery.data?.assignmentCapabilities;
  const canEditAssignments = Boolean(
    editingMember && assignmentCapabilities?.canEditAssignments,
  );
  const canToggleOnlineBooking = (member: TeamMember) =>
    (member.role === 'barber' || member.role === 'owner') &&
    (canManageTeam || member.user.id === user?.id);
  const confirmOnlineBookingChange = (
    member: TeamMember,
    locationId: string,
    onlineBookingEnabled: boolean,
  ) => {
    const nextState = !onlineBookingEnabled;
    Alert.alert(
      nextState ? 'Mostrar para reservas' : 'Pausar reservas online',
      nextState
        ? `${member.user.fullName} volverá a aparecer para nuevas reservas en esta sucursal.`
        : `${member.user.fullName} dejará de aparecer para nuevas reservas. Sus citas ya agendadas no se modificarán.`,
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          onPress: () =>
            updateOnlineBooking.mutate({
              locationId,
              membershipId: member.id,
              onlineBookingEnabled: nextState,
            }),
          text: nextState ? 'Activar' : 'Pausar',
        },
      ],
    );
  };
  const closeInvite = () => {
    if (isInviting) return;
    setInviteOpen(false);
    setEditingMember(null);
    setInviteError(null);
  };
  const openInvite = () => {
    setEditingMember(null);
    setFullName('');
    setEmail('');
    setRole('barber');
    setCommissionPercentage('');
    setSelectedLocationIds([]);
    setInviteError(null);
    setInviteOpen(true);
  };
  const openMember = (member: TeamMember) => {
    setEditingMember(member);
    setFullName(member.user.fullName);
    setEmail(member.user.email);
    setRole(member.role === 'owner' ? 'manager' : member.role);
    setCommissionPercentage(
      member.commissionPercentage === null
        ? ''
        : String(member.commissionPercentage),
    );
    setSelectedLocationIds(member.locations.map(({ id }) => id));
    setInviteError(null);
    setInviteOpen(true);
  };
  const saveCollaborator = async () => {
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim();
    const parsedCommission = Number(commissionPercentage);
    if (!normalizedName || (!editingMember && !normalizedEmail)) {
      setInviteError('Ingresa el nombre y el correo del colaborador.');
      return;
    }
    if (!editingMember && !current?.location) {
      setInviteError('No se encontró una sucursal activa para la invitación.');
      return;
    }
    if (
      role === 'barber' &&
      (!Number.isInteger(parsedCommission) ||
        parsedCommission < 0 ||
        parsedCommission > 100)
    ) {
      setInviteError('Indica una comisión entera entre 0% y 100%.');
      return;
    }
    if (
      editingMember &&
      canEditAssignments &&
      (role === 'barber' || role === 'receptionist') &&
      selectedLocationIds.length === 0
    ) {
      setInviteError('Selecciona al menos una sucursal para este colaborador.');
      return;
    }
    setInviteError(null);
    setIsInviting(true);
    try {
      const commission = role === 'barber' ? parsedCommission : null;
      if (editingMember) {
        await requireApiClient().request(
          `/v1/team/members/${editingMember.id}`,
          {
            body: {
              commissionPercentage: commission,
              fullName: normalizedName,
              ...(canEditAssignments
                ? { locationIds: selectedLocationIds }
                : {}),
              role,
            },
            method: 'PATCH',
          },
        );
      } else {
        await requireApiClient().request('/v1/team/invitations', {
          body: {
            commissionPercentage: commission,
            email: normalizedEmail,
            fullName: normalizedName,
            locationId: current!.location!.id,
            role,
          },
          method: 'POST',
        });
      }
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('team'),
      });
      setInviteOpen(false);
      setEditingMember(null);
    } catch (error) {
      setInviteError(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el colaborador.',
      );
    } finally {
      setIsInviting(false);
    }
  };
  const deleteMember = async (member: TeamMember) => {
    setInviteError(null);
    setIsInviting(true);
    try {
      await requireApiClient().request(`/v1/team/members/${member.id}`, {
        method: 'DELETE',
      });
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('team'),
      });
      setInviteOpen(false);
      setEditingMember(null);
    } catch (error) {
      setInviteError(
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar el colaborador.',
      );
    } finally {
      setIsInviting(false);
    }
  };
  const revokeInvitation = async (id: string) => {
    try {
      await requireApiClient().request(`/v1/team/invitations/${id}`, {
        method: 'DELETE',
      });
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('team'),
      });
    } catch (error) {
      Alert.alert(
        'No fue posible cancelar',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/business-settings')
          }
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={25}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Gestión de colaboradores
          </Text>
          <Text style={styles.subtitle}>Personas y accesos de tu negocio</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryValue}>
              {teamQuery.data?.members.length ?? 0}
            </Text>
            <Text style={styles.summaryLabel}>Integrantes</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View>
            <Text style={styles.summaryValue}>
              {teamQuery.data?.pendingInvitations.length ?? 0}
            </Text>
            <Text style={styles.summaryLabel}>Invitaciones pendientes</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Añadir colaborador</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Envía una invitación con el rol y la comisión inicial. La persona no
            aparecerá en el equipo ni tendrá acceso hasta verificar su correo y
            aceptar el enlace.
          </Text>
          {canManageTeam && teamEnabled ? (
            <Pressable
              accessibilityLabel="Añadir colaborador"
              accessibilityRole="button"
              onPress={openInvite}
              style={styles.addButton}
            >
              <Ionicons
                color={appTheme.colors.accentDark}
                name="person-add-outline"
                size={21}
              />
              <Text style={styles.addButtonLabel}>Enviar invitación</Text>
            </Pressable>
          ) : (
            <Text style={styles.permissionHint}>
              {canManageTeam
                ? 'Tu plan actual conserva el equipo, pero permite un solo profesional activo. Actualiza a Nava Local para invitar o reactivar colaboradores.'
                : 'Solo propietarios y administradores pueden enviar invitaciones.'}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipo actual</Text>
          {teamQuery.isLoading ? (
            <Text style={styles.empty}>Cargando colaboradores…</Text>
          ) : null}
          {teamQuery.data?.members.map((member) => {
            const editable =
              canManageTeam &&
              member.planAvailable &&
              member.role !== 'owner' &&
              member.user.id !== user?.id;
            const currentLocation = current?.location
              ? member.locations.find(
                  (location) => location.id === current.location?.id,
                )
              : null;
            const canToggle =
              member.planAvailable &&
              canToggleOnlineBooking(member) &&
              currentLocation;
            return (
              <View key={member.id}>
                <Pressable
                  accessibilityLabel={
                    editable
                      ? `Editar ${member.user.fullName}`
                      : member.user.fullName
                  }
                  accessibilityRole={editable ? 'button' : undefined}
                  disabled={!editable}
                  onPress={() => openMember(member)}
                  style={[
                    styles.memberCard,
                    !member.planAvailable && styles.memberCardPlanLocked,
                  ]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLabel}>
                      {member.user.fullName.trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName}>
                      {member.user.fullName}
                    </Text>
                    <Text style={styles.memberMeta}>
                      {ROLE_LABELS[member.role] ?? member.role} ·{' '}
                      {member.planAvailable
                        ? 'Activo'
                        : 'Guardado: requiere Nava Local'}
                    </Text>
                    {member.commissionPercentage !== null ? (
                      <Text style={styles.memberCommission}>
                        Comisión: {member.commissionPercentage}%
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    color={editable ? COLORS.text : '#2f8b57'}
                    name={editable ? 'create-outline' : 'checkmark-circle'}
                    size={22}
                  />
                </Pressable>
                {currentLocation &&
                (member.role === 'barber' || member.role === 'owner') ? (
                  <View style={styles.onlineBookingRow}>
                    <View style={styles.memberCopy}>
                      <Text style={styles.onlineBookingLabel}>
                        Reservas online
                      </Text>
                      <Text style={styles.memberMeta}>
                        {!member.planAvailable
                          ? 'Conservado sin disponibilidad en tu plan actual'
                          : currentLocation.onlineBookingEnabled
                            ? 'Visible para nuevas citas'
                            : 'No disponible para nuevas citas'}
                      </Text>
                    </View>
                    {canToggle ? (
                      <Pressable
                        accessibilityLabel={`Cambiar disponibilidad online de ${member.user.fullName}`}
                        accessibilityRole="switch"
                        accessibilityState={{
                          checked: currentLocation.onlineBookingEnabled,
                          disabled: updateOnlineBooking.isPending,
                        }}
                        disabled={updateOnlineBooking.isPending}
                        onPress={() =>
                          confirmOnlineBookingChange(
                            member,
                            currentLocation.id,
                            currentLocation.onlineBookingEnabled,
                          )
                        }
                        style={[
                          styles.onlineBookingSwitch,
                          currentLocation.onlineBookingEnabled &&
                            styles.onlineBookingSwitchEnabled,
                        ]}
                      >
                        <View
                          style={[
                            styles.onlineBookingKnob,
                            currentLocation.onlineBookingEnabled &&
                              styles.onlineBookingKnobEnabled,
                          ]}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {member.user.id === user?.id &&
                (member.role === 'barber' || member.role === 'owner') ? (
                  <View style={styles.ownScheduleSection}>
                    <Text style={styles.onlineBookingLabel}>Mi horario</Text>
                    {member.locations.map((location) => (
                      <Pressable
                        accessibilityLabel={`Configurar mi horario en ${location.name}`}
                        accessibilityRole="button"
                        key={location.id}
                        onPress={() =>
                          router.push({
                            params: {
                              locationId: location.id,
                              locationName: location.name,
                              membershipId: member.id,
                              professionalName: member.user.fullName,
                            },
                            pathname: '/professional-schedule',
                          })
                        }
                        style={styles.ownScheduleButton}
                      >
                        <Ionicons
                          color={appTheme.colors.accentDark}
                          name="time-outline"
                          size={18}
                        />
                        <Text style={styles.ownScheduleButtonLabel}>
                          {location.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {(teamQuery.data?.pendingInvitations.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invitaciones pendientes</Text>
            <Text style={styles.sectionDescription}>
              Estas personas todavía no son colaboradores activos. Solo se
              muestran aquí para seguimiento o cancelación de la invitación.
            </Text>
            {teamQuery.data?.pendingInvitations.map((invitation) => (
              <View key={invitation.id} style={styles.invitationRow}>
                <Ionicons color="#a67714" name="mail-outline" size={21} />
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{invitation.email}</Text>
                  <Text style={styles.memberMeta}>
                    Pendiente de verificación y aceptación
                  </Text>
                  <Text style={styles.memberMeta}>
                    {ROLE_LABELS[invitation.role] ?? invitation.role} · vence{' '}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </Text>
                  {invitation.commissionPercentage !== null ? (
                    <Text style={styles.invitationCommission}>
                      Comisión acordada: {invitation.commissionPercentage}%
                    </Text>
                  ) : null}
                </View>
                {canManageTeam ? (
                  <Pressable
                    accessibilityLabel={`Cancelar invitación de ${invitation.email}`}
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        'Cancelar invitación',
                        `¿Quieres cancelar la invitación enviada a ${invitation.email}?`,
                        [
                          { style: 'cancel', text: 'Volver' },
                          {
                            onPress: () => void revokeInvitation(invitation.id),
                            style: 'destructive',
                            text: 'Cancelar invitación',
                          },
                        ],
                      )
                    }
                    style={styles.invitationDeleteButton}
                  >
                    <Ionicons color="#bd2d2d" name="trash-outline" size={20} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={closeInvite}
        statusBarTranslucent
        transparent
        visible={inviteOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
          <View style={styles.modalLayer}>
            <Pressable
              accessibilityLabel="Cerrar invitación"
              accessibilityRole="button"
              onPress={closeInvite}
              style={styles.modalBackdrop}
            />
            <ScrollView
              contentContainerStyle={[
                styles.inviteSheetContent,
                { paddingBottom: layout.bottomInset + 16 },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={[styles.inviteSheet, { maxHeight: layout.sheetMaxHeight }]}
            >
              <View style={styles.sheetHeader}>
                <View style={styles.headerCopy}>
                  <Text accessibilityRole="header" style={styles.sheetTitle}>
                    {editingMember
                      ? 'Editar colaborador'
                      : 'Invitar colaborador'}
                  </Text>
                  <Text style={styles.sheetDescription}>
                    {editingMember
                      ? 'Actualiza sus datos, rol y comisión vigente.'
                      : 'El correo es obligatorio para que acepte y active su acceso.'}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Cerrar"
                  accessibilityRole="button"
                  disabled={isInviting}
                  onPress={closeInvite}
                  style={styles.closeButton}
                >
                  <Ionicons color={COLORS.muted} name="close" size={23} />
                </Pressable>
              </View>

              {inviteError ? (
                <Text accessibilityRole="alert" style={styles.inviteError}>
                  {inviteError}
                </Text>
              ) : null}

              <Text style={styles.inputLabel}>Nombre completo</Text>
              <TextInput
                autoComplete="name"
                onChangeText={setFullName}
                placeholder="Nombre del colaborador"
                placeholderTextColor="#8b94a1"
                style={styles.input}
                value={fullName}
              />
              <Text style={styles.inputLabel}>Correo electrónico</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                editable={!editingMember}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor="#8b94a1"
                style={[
                  styles.input,
                  editingMember ? styles.inputDisabled : null,
                ]}
                value={email}
              />
              <Text style={styles.inputLabel}>Rol</Text>
              <View style={styles.roleOptions}>
                {INVITATION_ROLES.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityLabel={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: role === option.value }}
                    onPress={() => setRole(option.value)}
                    style={[
                      styles.roleOption,
                      role === option.value ? styles.roleOptionSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleOptionLabel,
                        role === option.value
                          ? styles.roleOptionLabelSelected
                          : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {canEditAssignments ? (
                <>
                  <Text style={styles.inputLabel}>Sucursales asignadas</Text>
                  <Text style={styles.commissionHint}>
                    {role === 'barber'
                      ? 'Los servicios activos se asignarán automáticamente en las sucursales nuevas. Configura sus horarios antes de publicar disponibilidad.'
                      : role === 'manager'
                        ? 'Esta asignación es informativa; el administrador conserva su acceso actual a toda la organización.'
                        : 'Recepción solo podrá consultar y gestionar clientes y citas de estas sucursales.'}
                  </Text>
                  <View style={styles.locationOptions}>
                    {teamLocationsQuery.isLoading ? (
                      <Text style={styles.locationHint}>
                        Cargando sucursales…
                      </Text>
                    ) : null}
                    {teamLocationsQuery.isError ? (
                      <Text style={styles.locationHint}>
                        No pudimos cargar las sucursales.
                      </Text>
                    ) : null}
                    {teamLocationsQuery.data?.locations.map((location) => {
                      const selected = selectedLocationIds.includes(
                        location.id,
                      );
                      return (
                        <Pressable
                          key={location.id}
                          accessibilityLabel={`Asignar ${location.name}`}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() =>
                            setSelectedLocationIds((currentIds) =>
                              selected
                                ? currentIds.filter((id) => id !== location.id)
                                : [...currentIds, location.id],
                            )
                          }
                          style={[
                            styles.locationOption,
                            selected ? styles.locationOptionSelected : null,
                          ]}
                        >
                          <Ionicons
                            color={
                              selected
                                ? appTheme.colors.accentDark
                                : COLORS.muted
                            }
                            name={selected ? 'checkbox' : 'square-outline'}
                            size={20}
                          />
                          <Text
                            style={[
                              styles.locationOptionLabel,
                              selected
                                ? styles.locationOptionLabelSelected
                                : null,
                            ]}
                          >
                            {location.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
              {editingMember && !canEditAssignments ? (
                <Text style={styles.commissionHint}>
                  {assignmentCapabilities?.reason === 'plan_team_not_available'
                    ? 'Tu plan actual no incluye equipo. Las asignaciones existentes se conservan, pero no se pueden modificar.'
                    : 'Las asignaciones por sucursal no están disponibles en tu plan actual.'}
                </Text>
              ) : null}
              {editingMember && role === 'barber' && canEditAssignments ? (
                <View style={styles.serviceAssignmentSection}>
                  <Text style={styles.inputLabel}>Servicios por sucursal</Text>
                  <Text style={styles.commissionHint}>
                    Ajusta los servicios después de guardar una sucursal nueva.
                    Quitar un servicio no modifica las citas ya agendadas.
                  </Text>
                  {selectedLocationIds
                    .filter((locationId) =>
                      editingMember.locations.some(
                        (location) => location.id === locationId,
                      ),
                    )
                    .map((locationId) => {
                      const location = teamLocationsQuery.data?.locations.find(
                        (item) => item.id === locationId,
                      );
                      if (!location) return null;
                      return (
                        <View key={locationId} style={styles.serviceLocation}>
                          <Text style={styles.serviceLocationTitle}>
                            {location.name}
                          </Text>
                          {servicesQuery.data?.services.map((service) => {
                            const assigned = service.assignments.some(
                              (assignment) =>
                                assignment.locationId === locationId &&
                                assignment.membershipId === editingMember.id,
                            );
                            return (
                              <Pressable
                                key={service.id}
                                accessibilityLabel={`${assigned ? 'Quitar' : 'Asignar'} ${service.name} en ${location.name}`}
                                accessibilityRole="checkbox"
                                accessibilityState={{
                                  checked: assigned,
                                  disabled: updateProfessionalService.isPending,
                                }}
                                disabled={updateProfessionalService.isPending}
                                onPress={() =>
                                  updateProfessionalService.mutate({
                                    assigned,
                                    locationId,
                                    membershipId: editingMember.id,
                                    serviceId: service.id,
                                  })
                                }
                                style={styles.serviceAssignmentOption}
                              >
                                <Ionicons
                                  color={
                                    assigned
                                      ? appTheme.colors.accentDark
                                      : COLORS.muted
                                  }
                                  name={
                                    assigned ? 'checkbox' : 'square-outline'
                                  }
                                  size={20}
                                />
                                <Text style={styles.locationOptionLabel}>
                                  {service.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                          {servicesQuery.isLoading ? (
                            <Text style={styles.locationHint}>
                              Cargando servicios…
                            </Text>
                          ) : null}
                          <Pressable
                            accessibilityLabel={`Configurar horario de ${editingMember.user.fullName} en ${location.name}`}
                            accessibilityRole="button"
                            onPress={() =>
                              router.push({
                                params: {
                                  locationId,
                                  locationName: location.name,
                                  membershipId: editingMember.id,
                                  professionalName: editingMember.user.fullName,
                                },
                                pathname: '/professional-schedule',
                              })
                            }
                            style={styles.scheduleButton}
                          >
                            <Ionicons
                              color={appTheme.colors.accentDark}
                              name="time-outline"
                              size={18}
                            />
                            <Text style={styles.scheduleButtonLabel}>
                              Configurar horario en esta sucursal
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                </View>
              ) : null}
              {role === 'barber' ? (
                <>
                  <Text style={styles.inputLabel}>
                    Comisión por servicios (%)
                  </Text>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={3}
                    onChangeText={setCommissionPercentage}
                    placeholder="Ej. 40"
                    placeholderTextColor="#8b94a1"
                    style={styles.input}
                    value={commissionPercentage}
                  />
                  <Text style={styles.commissionHint}>
                    {editingMember
                      ? 'El nuevo porcentaje se aplicará a las comisiones futuras.'
                      : 'Se guardará al aceptar la invitación; antes no genera pagos.'}
                  </Text>
                </>
              ) : null}
              <Pressable
                accessibilityLabel={
                  editingMember ? 'Guardar colaborador' : 'Enviar invitación'
                }
                accessibilityRole="button"
                disabled={isInviting}
                onPress={() => void saveCollaborator()}
                style={[styles.sendButton, isInviting ? styles.disabled : null]}
              >
                <Text style={styles.sendButtonLabel}>
                  {isInviting
                    ? 'Guardando…'
                    : editingMember
                      ? 'Guardar cambios'
                      : 'Enviar invitación'}
                </Text>
              </Pressable>
              {editingMember ? (
                <Pressable
                  accessibilityLabel="Eliminar colaborador"
                  accessibilityRole="button"
                  disabled={isInviting}
                  onPress={() =>
                    Alert.alert(
                      'Eliminar colaborador',
                      `¿Quieres retirar a ${editingMember.user.fullName} del equipo? Su historial se conservará.`,
                      [
                        { style: 'cancel', text: 'Cancelar' },
                        {
                          onPress: () => void deleteMember(editingMember),
                          style: 'destructive',
                          text: 'Eliminar',
                        },
                      ],
                    )
                  }
                  style={styles.deleteButton}
                >
                  <Ionicons color="#bd2d2d" name="trash-outline" size={20} />
                  <Text style={styles.deleteButtonLabel}>
                    Eliminar colaborador
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.border,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLabel: { color: COLORS.text, fontSize: 19, fontWeight: '900' },
  backButton: {
    backgroundColor: appTheme.colors.surface,
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    paddingBottom: 38,
    paddingHorizontal: 20,
    paddingTop: 12,
    width: '100%',
  },
  addButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  addButtonLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  commissionHint: { color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  deleteButton: {
    alignItems: 'center',
    borderColor: '#efb6b3',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 50,
  },
  deleteButtonLabel: {
    color: appTheme.colors.dangerBorder,
    fontSize: 14,
    fontWeight: '900',
  },
  disabled: { opacity: 0.6 },
  empty: { color: COLORS.muted, fontSize: 14, paddingVertical: 18 },
  header: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
    maxWidth: 720,
    minHeight: 72,
    paddingHorizontal: 18,
    width: '100%',
  },
  headerCopy: { flex: 1 },
  invitationRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
  },
  invitationCommission: {
    color: '#2f8b57',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  invitationDeleteButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  inviteError: {
    backgroundColor: appTheme.colors.dangerSurface,
    borderRadius: 12,
    color: appTheme.colors.danger,
    fontSize: 13,
    marginBottom: 14,
    padding: 12,
  },
  inviteSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    ...goldButtonShadow,
  },
  inviteSheetContent: { padding: 22 },
  input: {
    backgroundColor: appTheme.colors.background,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 15,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  inputLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 7,
  },
  inputDisabled: { color: COLORS.muted, opacity: 0.72 },
  memberCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 17,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    minHeight: 72,
    padding: 12,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  memberCardPlanLocked: { opacity: 0.46 },
  memberCopy: { flex: 1 },
  memberMeta: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
  memberCommission: {
    color: '#2f8b57',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  memberName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  onlineBookingKnob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  onlineBookingKnobEnabled: { alignSelf: 'flex-end' },
  onlineBookingLabel: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  onlineBookingRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 12,
    paddingBottom: 12,
  },
  onlineBookingSwitch: {
    backgroundColor: '#98A1AD',
    borderRadius: 14,
    justifyContent: 'center',
    padding: 4,
    width: 48,
  },
  onlineBookingSwitchEnabled: { backgroundColor: appTheme.colors.accent },
  ownScheduleButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
  },
  ownScheduleButtonLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '800',
  },
  ownScheduleSection: {
    backgroundColor: '#FFFDF8',
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
    marginTop: 8,
    padding: 12,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 28, 45, 0.5)',
  },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
  modalKeyboard: { flex: 1 },
  permissionHint: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 13,
  },
  roleOption: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 6,
  },
  roleOptionLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  roleOptionLabelSelected: { color: appTheme.colors.text, fontWeight: '900' },
  roleOptionSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentWash,
  },
  roleOptions: { flexDirection: 'row', gap: 7, marginBottom: 16 },
  locationHint: { color: COLORS.muted, fontSize: 13, marginTop: 8 },
  locationOption: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  locationOptionLabel: {
    color: COLORS.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  locationOptionLabelSelected: { fontWeight: '900' },
  locationOptionSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentWash,
  },
  locationOptions: { gap: 8, marginBottom: 16, marginTop: 10 },
  screen: appStyles.screen,
  section: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 21,
    borderWidth: 0,
    padding: 17,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  sectionDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  serviceAssignmentOption: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 32,
  },
  serviceAssignmentSection: { gap: 10, marginTop: 6 },
  serviceLocation: {
    backgroundColor: '#FFFDF8',
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    padding: 12,
  },
  serviceLocationTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  scheduleButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    paddingVertical: 8,
  },
  scheduleButtonLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '700',
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 15,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 54,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  sendButtonLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  subtitle: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  sheetDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sheetTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  summary: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 92,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  summaryDivider: {
    backgroundColor: appTheme.colors.border,
    height: 48,
    width: 1,
  },
  summaryLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  summaryValue: {
    color: appTheme.colors.text,
    fontSize: 25,
    fontWeight: '900',
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
});
