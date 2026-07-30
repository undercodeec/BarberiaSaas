import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  OnboardingAccountDetailsResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

export default function TeamManagementScreen() {
  const router = useRouter();
  const { session, user } = useAuth();
  const organizationQuery = useCurrentOrganization();
  const current = organizationQuery.data;

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
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Próximamente</Text>
            </View>
          </View>
          <Text style={styles.sectionDescription}>
            La invitación y activación de nuevos colaboradores se rediseñará
            completamente. El envío queda deshabilitado hasta publicar el nuevo
            flujo.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipo actual</Text>
          {teamQuery.isLoading ? (
            <Text style={styles.empty}>Cargando colaboradores…</Text>
          ) : null}
          {teamQuery.data?.members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarLabel}>
                  {member.user.fullName.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberCopy}>
                <Text style={styles.memberName}>{member.user.fullName}</Text>
                <Text style={styles.memberMeta}>
                  {ROLE_LABELS[member.role] ?? member.role} ·{' '}
                  {member.status === 'active' ? 'Activo' : 'Invitado'}
                </Text>
              </View>
              <Ionicons
                color={member.status === 'active' ? '#2f8b57' : '#a67714'}
                name={
                  member.status === 'active'
                    ? 'checkmark-circle'
                    : 'time-outline'
                }
                size={22}
              />
            </View>
          ))}
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
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
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
  comingSoonBadge: {
    backgroundColor: '#e8efff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  comingSoonText: {
    color: '#2e67e0',
    fontSize: 11,
    fontWeight: '900',
  },
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
  memberName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
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
  subtitle: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
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
