import Ionicons from '@expo/vector-icons/Ionicons';
import type { TeamMember, TeamResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineMessage } from '../../src/components/InlineMessage';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

type EditableRole = 'barber' | 'manager' | 'receptionist';

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
  const organizationQuery = useCurrentOrganization();
  const teamQuery = useQuery({
    enabled: Boolean(session && organizationQuery.data),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: ['team'],
  });
  const mutation = useMutation({
    mutationFn: ({
      member,
      role,
    }: {
      member: TeamMember;
      role: EditableRole;
    }) =>
      requireApiClient().request(`/v1/team/members/${member.id}`, {
        body: {
          commissionPercentage:
            role === 'barber' ? (member.commissionPercentage ?? 0) : null,
          fullName: member.user.fullName,
          role,
        },
        method: 'PATCH',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team'] });
    },
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const canManage = organizationQuery.data?.membership.role === 'owner';
  const editableMembers = (teamQuery.data?.members ?? []).filter(
    (member) => member.role !== 'owner' && member.user.id !== user?.id,
  );

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
        {!canManage ? (
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
              const selected = member.role === profile.role;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: selected,
                    disabled: !canManage,
                  }}
                  disabled={!canManage || mutation.isPending}
                  key={profile.role}
                  onPress={() =>
                    mutation.mutate({ member, role: profile.role })
                  }
                  style={({ pressed }) => [
                    styles.profile,
                    selected ? styles.profileSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.profileHeading}>
                    <Text style={styles.profileLabel}>{profile.label}</Text>
                    <Ionicons
                      color={selected ? '#287247' : '#a1a8b2'}
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
    backgroundColor: '#e6e8eb',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLabel: { color: '#101c2d', fontSize: 18, fontWeight: '900' },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  capability: { color: '#667080', fontSize: 12, lineHeight: 18, marginTop: 2 },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    padding: 20,
    width: '100%',
  },
  empty: { color: '#667080', fontSize: 14, padding: 24, textAlign: 'center' },
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
    borderColor: '#d9dde3',
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  memberEmail: { color: '#667080', fontSize: 12, marginTop: 3 },
  memberHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  memberName: { color: '#101c2d', fontSize: 17, fontWeight: '900' },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: '#eef0f2',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    padding: 15,
  },
  noticeCopy: { color: '#4f5967', flex: 1, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  profile: {
    borderColor: '#d9dde3',
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
  },
  profileHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileLabel: { color: '#101c2d', fontSize: 14, fontWeight: '900' },
  profileSelected: { backgroundColor: '#f2f8f4', borderColor: '#69a77f' },
  screen: { backgroundColor: '#ffffff', flex: 1 },
  subtitle: { color: '#667080', fontSize: 13, marginTop: 2 },
  title: { color: '#101c2d', fontSize: 23, fontWeight: '900' },
});
