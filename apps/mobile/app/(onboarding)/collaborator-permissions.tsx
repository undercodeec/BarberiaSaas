import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  SubscriptionResponse,
  TeamMember,
  TeamLocationsResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineMessage } from '../../src/components/InlineMessage';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { accountQueryKey, tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

type EditableRole = 'barber' | 'manager' | 'receptionist';

interface RoleDraft {
  readonly commissionPercentage: string;
  readonly locationIds: readonly string[];
  readonly member: TeamMember;
  readonly role: EditableRole;
}

const PROFILES: ReadonlyArray<{
  capabilities: readonly string[];
  label: string;
  role: EditableRole;
}> = [
  {
    capabilities: [
      'Administra información del negocio',
      'Crea y edita servicios y horarios',
      'Gestiona agenda y citas',
      'Consulta equipo y reportes operativos',
    ],
    label: 'Administrador',
    role: 'manager',
  },
  {
    capabilities: [
      'Consulta servicios, horarios y equipo',
      'Crea y administra citas',
      'No cambia configuración del negocio',
    ],
    label: 'Recepción',
    role: 'receptionist',
  },
  {
    capabilities: [
      'Consulta su agenda y servicios',
      'Gestiona sus citas operativas',
      'Consulta únicamente sus comisiones',
    ],
    label: 'Profesional',
    role: 'barber',
  },
];

export default function CollaboratorPermissionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const tenant = useTenantScope();
  const organizationQuery = useCurrentOrganization();
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const isOwner = organizationQuery.data?.membership.role === 'owner';
  const subscriptionQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<SubscriptionResponse>('/v1/subscription'),
    queryKey: accountQueryKey(user?.id, 'subscription'),
  });
  const teamQuery = useQuery({
    enabled: Boolean(session && organizationQuery.data),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: tenant.key('team'),
  });
  const teamEnabled =
    teamQuery.data?.teamEnabled ??
    subscriptionQuery.data?.current.featureFlags.team ??
    false;
  const teamLocationsQuery = useQuery({
    enabled: Boolean(
      session &&
      isOwner &&
      teamEnabled &&
      draft &&
      (draft.role === 'barber' || draft.role === 'receptionist'),
    ),
    queryFn: () =>
      requireApiClient().request<TeamLocationsResponse>('/v1/team/locations'),
    queryKey: tenant.key('team-locations'),
  });
  const mutation = useMutation({
    mutationFn: ({
      commissionPercentage,
      fullName,
      locationIds,
      memberId,
      role,
    }: {
      commissionPercentage: number | null;
      fullName: string;
      locationIds?: readonly string[];
      memberId: string;
      role: EditableRole;
    }) =>
      requireApiClient().request(`/v1/team/members/${memberId}`, {
        body: {
          commissionPercentage,
          ...(locationIds ? { locationIds } : {}),
          fullName,
          role,
        },
        method: 'PATCH',
      }),
    onSuccess: async () => {
      setDraft(null);
      setDraftError(null);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('team'),
      });
    },
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const canManage = isOwner && teamEnabled;
  const editableMembers = (teamQuery.data?.members ?? []).filter(
    (member) => member.role !== 'owner' && member.user.id !== user?.id,
  );
  const selectRole = (member: TeamMember, role: EditableRole) => {
    if (member.role === role) {
      setDraft(null);
      setDraftError(null);
      return;
    }
    setDraftError(null);
    setDraft({
      commissionPercentage:
        role === 'barber' ? String(member.commissionPercentage ?? 0) : '',
      locationIds: member.locations.map(({ id }) => id),
      member,
      role,
    });
  };
  const saveDraft = () => {
    if (!draft) return;
    const requiresLocations =
      draft.role === 'barber' || draft.role === 'receptionist';
    if (requiresLocations && draft.locationIds.length === 0) {
      setDraftError('Selecciona al menos una sucursal para este perfil.');
      return;
    }
    const commissionPercentage = Number(draft.commissionPercentage);
    if (
      draft.role === 'barber' &&
      (!Number.isInteger(commissionPercentage) ||
        commissionPercentage < 0 ||
        commissionPercentage > 100)
    ) {
      setDraftError('Indica una comisión entera entre 0% y 100%.');
      return;
    }
    setDraftError(null);
    mutation.mutate({
      commissionPercentage:
        draft.role === 'barber' ? commissionPercentage : null,
      ...(requiresLocations ? { locationIds: draft.locationIds } : {}),
      fullName: draft.member.user.fullName,
      memberId: draft.member.id,
      role: draft.role,
    });
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
              : router.replace('/advanced-settings')
          }
          style={styles.backButton}
        >
          <Ionicons color="#101c2d" name="arrow-back" size={25} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Permisos a colaboradores
          </Text>
          <Text style={styles.subtitle}>
            Perfiles de acceso seguros por rol
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Ionicons color="#101c2d" name="shield-checkmark-outline" size={24} />
          <Text style={styles.noticeCopy}>
            En esta versión los permisos se asignan mediante perfiles de acceso.
            Así la API y la interfaz aplican siempre la misma regla de
            seguridad.
          </Text>
        </View>
        {!teamEnabled ? (
          <InlineMessage message="Los permisos para colaboradores requieren Nava Local. Actualiza tu plan para administrarlos." />
        ) : null}
        {!canManage && teamEnabled ? (
          <InlineMessage message="Solo el propietario puede cambiar perfiles de acceso." />
        ) : null}
        {mutation.error ? (
          <InlineMessage
            message={
              mutation.error instanceof Error
                ? mutation.error.message
                : 'No fue posible actualizar el perfil.'
            }
          />
        ) : null}
        {draftError ? <InlineMessage message={draftError} /> : null}
        {editableMembers.map((member) => (
          <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberHeading}>
              <View style={styles.avatar}>
                <Text style={styles.avatarLabel}>
                  {member.user.fullName.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.memberName}>{member.user.fullName}</Text>
                <Text style={styles.memberEmail}>{member.user.email}</Text>
              </View>
            </View>
            {PROFILES.map((profile) => {
              const isEditing = draft?.member.id === member.id;
              const selected = isEditing
                ? draft.role === profile.role
                : member.role === profile.role;
              return (
                <Pressable
                  accessibilityLabel={profile.label}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: selected,
                    disabled: !canManage || !teamEnabled,
                  }}
                  disabled={!canManage || mutation.isPending}
                  key={profile.role}
                  onPress={() => selectRole(member, profile.role)}
                  style={({ pressed }) => [
                    styles.profile,
                    selected ? styles.profileSelected : null,
                    !teamEnabled ? styles.profilePlanLocked : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.profileHeading}>
                    <Text style={styles.profileLabel}>{profile.label}</Text>
                    <Ionicons
                      color={selected ? '#287247' : appTheme.colors.textMuted}
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                    />
                  </View>
                  {profile.capabilities.map((capability) => (
                    <Text key={capability} style={styles.capability}>
                      · {capability}
                    </Text>
                  ))}
                </Pressable>
              );
            })}
            {draft?.member.id === member.id ? (
              <View style={styles.draftFields}>
                {draft.role === 'barber' || draft.role === 'receptionist' ? (
                  <>
                    <Text style={styles.draftLabel}>Sucursales asignadas</Text>
                    <Text style={styles.draftHint}>
                      {draft.role === 'barber'
                        ? 'El profesional atenderá y aparecerá para reservas en estas sucursales.'
                        : 'Recepción podrá gestionar clientes y citas solo en estas sucursales.'}
                    </Text>
                    {teamLocationsQuery.isLoading ? (
                      <Text style={styles.draftHint}>Cargando sucursales…</Text>
                    ) : null}
                    {teamLocationsQuery.isError ? (
                      <Text style={styles.draftHint}>
                        No pudimos cargar las sucursales. Inténtalo nuevamente.
                      </Text>
                    ) : null}
                    {teamLocationsQuery.data?.locations.map((location) => {
                      const selected = draft.locationIds.includes(location.id);
                      return (
                        <Pressable
                          key={location.id}
                          accessibilityLabel={`Asignar ${location.name}`}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    locationIds: selected
                                      ? current.locationIds.filter(
                                          (id) => id !== location.id,
                                        )
                                      : [...current.locationIds, location.id],
                                  }
                                : current,
                            )
                          }
                          style={styles.locationOption}
                        >
                          <Ionicons
                            color={
                              selected
                                ? appTheme.colors.accentDark
                                : appTheme.colors.textMuted
                            }
                            name={selected ? 'checkbox' : 'square-outline'}
                            size={20}
                          />
                          <Text style={styles.locationOptionLabel}>
                            {location.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}
                {draft.role === 'barber' ? (
                  <>
                    <Text style={styles.draftLabel}>
                      Comisión por servicios (%)
                    </Text>
                    <TextInput
                      keyboardType="number-pad"
                      maxLength={3}
                      onChangeText={(commissionPercentage) =>
                        setDraft((current) =>
                          current
                            ? { ...current, commissionPercentage }
                            : current,
                        )
                      }
                      placeholder="Ej. 40"
                      placeholderTextColor="#8b94a1"
                      style={styles.commissionInput}
                      value={draft.commissionPercentage}
                    />
                  </>
                ) : null}
                <View style={styles.draftActions}>
                  <Pressable
                    accessibilityLabel="Cancelar cambio de perfil"
                    accessibilityRole="button"
                    disabled={mutation.isPending}
                    onPress={() => {
                      setDraft(null);
                      setDraftError(null);
                    }}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonLabel}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Guardar perfil"
                    accessibilityRole="button"
                    disabled={mutation.isPending}
                    onPress={saveDraft}
                    style={styles.saveButton}
                  >
                    <Text style={styles.saveButtonLabel}>
                      {mutation.isPending ? 'Guardando…' : 'Guardar perfil'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ))}
        {!teamQuery.isLoading && editableMembers.length === 0 ? (
          <Text style={styles.empty}>
            No hay colaboradores activos para configurar.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.border,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLabel: { color: appTheme.colors.text, fontSize: 18, fontWeight: '900' },
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButtonLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  capability: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    padding: 20,
    width: '100%',
  },
  commissionInput: {
    borderColor: appTheme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 14,
    padding: 12,
  },
  draftActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  draftFields: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    gap: 10,
    marginTop: 4,
    padding: 12,
  },
  draftHint: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  draftLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  empty: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    padding: 24,
    textAlign: 'center',
  },
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
  memberCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    borderWidth: 0,
    gap: 10,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  memberEmail: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 3 },
  memberHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  memberName: { color: appTheme.colors.text, fontSize: 17, fontWeight: '900' },
  locationOption: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 5,
  },
  locationOptionLabel: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    padding: 15,
  },
  noticeCopy: {
    color: appTheme.colors.textMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  pressed: { opacity: 0.72 },
  profile: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 0,
    padding: 13,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  profileHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileLabel: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  profileSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentWash,
  },
  profilePlanLocked: { opacity: 0.46 },
  screen: appStyles.screen,
  saveButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  saveButtonLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '900',
  },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 2 },
  title: { color: appTheme.colors.text, fontSize: 23, fontWeight: '900' },
});
