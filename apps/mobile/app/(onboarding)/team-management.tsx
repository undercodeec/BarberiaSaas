import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  OnboardingAccountDetailsResponse,
  TeamMember,
  TeamResponse,
} from '@barber-saas/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const COLORS = {
  border: '#d9dde3',
  muted: '#667080',
  screen: '#ffffff',
  surface: '#f4f4f3',
  text: '#101c2d',
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
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const organizationQuery = useCurrentOrganization();
  const current = organizationQuery.data;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitationRole>('barber');
  const [commissionPercentage, setCommissionPercentage] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });
  const teamQuery = useQuery({
    enabled: Boolean(session && current),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: ['team'],
  });
  if (!session) return <Redirect href="/(auth)/login" />;
  if (accountQuery.data?.accountType === 'professional') {
    return <Redirect href="/business-settings" />;
  }

  const canManageTeam =
    current?.membership.role === 'owner' ||
    current?.membership.role === 'manager';
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
      await queryClient.invalidateQueries({ queryKey: ['team'] });
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
      await queryClient.invalidateQueries({ queryKey: ['team'] });
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
      await queryClient.invalidateQueries({ queryKey: ['team'] });
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
          <Ionicons color={COLORS.text} name="arrow-back" size={25} />
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
            Envía una invitación con el rol y la comisión inicial. Para los
            profesionales, la comisión se activa solo cuando aceptan la
            invitación.
          </Text>
          {canManageTeam ? (
            <Pressable
              accessibilityLabel="Añadir colaborador"
              accessibilityRole="button"
              onPress={openInvite}
              style={styles.addButton}
            >
              <Ionicons color="#ffffff" name="person-add-outline" size={21} />
              <Text style={styles.addButtonLabel}>Enviar invitación</Text>
            </Pressable>
          ) : (
            <Text style={styles.permissionHint}>
              Solo propietarios y administradores pueden enviar invitaciones.
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
              member.role !== 'owner' &&
              member.user.id !== user?.id;
            return (
              <Pressable
                key={member.id}
                accessibilityLabel={
                  editable
                    ? `Editar ${member.user.fullName}`
                    : member.user.fullName
                }
                accessibilityRole={editable ? 'button' : undefined}
                disabled={!editable}
                onPress={() => openMember(member)}
                style={styles.memberCard}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarLabel}>
                    {member.user.fullName.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{member.user.fullName}</Text>
                  <Text style={styles.memberMeta}>
                    {ROLE_LABELS[member.role] ?? member.role} · Activo
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
            );
          })}
        </View>

        {(teamQuery.data?.pendingInvitations.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invitaciones pendientes</Text>
            {teamQuery.data?.pendingInvitations.map((invitation) => (
              <View key={invitation.id} style={styles.invitationRow}>
                <Ionicons color="#a67714" name="mail-outline" size={21} />
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{invitation.email}</Text>
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
        onRequestClose={closeInvite}
        transparent
        visible={inviteOpen}
      >
        <View style={styles.modalLayer}>
          <Pressable
            accessibilityLabel="Cerrar invitación"
            accessibilityRole="button"
            onPress={closeInvite}
            style={styles.modalBackdrop}
          />
          <View style={styles.inviteSheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.headerCopy}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  {editingMember ? 'Editar colaborador' : 'Invitar colaborador'}
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
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e5e7ea',
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLabel: { color: COLORS.text, fontSize: 19, fontWeight: '900' },
  backButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
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
    backgroundColor: COLORS.text,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  addButtonLabel: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#eef0f2',
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
  deleteButtonLabel: { color: '#bd2d2d', fontSize: 14, fontWeight: '900' },
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
    backgroundColor: '#fff0ee',
    borderRadius: 12,
    color: '#a72d27',
    fontSize: 13,
    marginBottom: 14,
    padding: 12,
  },
  inviteSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
  },
  input: {
    backgroundColor: '#f7f8fa',
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
    backgroundColor: '#ffffff',
    borderColor: COLORS.border,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    minHeight: 72,
    padding: 12,
  },
  memberCopy: { flex: 1 },
  memberMeta: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
  memberCommission: {
    color: '#2f8b57',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  memberName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 28, 45, 0.5)',
  },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
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
  roleOptionLabelSelected: { color: '#ffffff' },
  roleOptionSelected: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.text,
  },
  roleOptions: { flexDirection: 'row', gap: 7, marginBottom: 16 },
  screen: { backgroundColor: COLORS.screen, flex: 1 },
  section: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 21,
    borderWidth: 1,
    padding: 17,
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
  sendButton: {
    alignItems: 'center',
    backgroundColor: COLORS.text,
    borderRadius: 15,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 54,
  },
  sendButtonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
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
    backgroundColor: COLORS.text,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 92,
    padding: 16,
  },
  summaryDivider: { backgroundColor: '#536070', height: 48, width: 1 },
  summaryLabel: { color: '#cbd1d9', fontSize: 12, marginTop: 3 },
  summaryValue: { color: '#ffffff', fontSize: 25, fontWeight: '900' },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
});
