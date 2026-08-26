import Ionicons from '@expo/vector-icons/Ionicons';
import type { SubscriptionResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineMessage } from '../../src/components/InlineMessage';
import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { accountQueryKey, accountQueryPrefix } from '../../src/lib/query-keys';
import { effectiveLocationLimit } from '../../src/lib/subscription-entitlements';
import { useAuth } from '../../src/providers/AuthProvider';

const STATUS_LABELS: Record<SubscriptionResponse['current']['status'], string> =
  {
    active: 'Activa',
    cancelled: 'Cancelada',
    free: 'Plan gratuito',
    past_due: 'Período de gracia',
    suspended: 'Solo lectura',
    trial: 'Prueba gratuita',
  };
const FREE_BOOKING_LIMIT = 25;

function formatPrice(cents: number | null, currencyCode: string) {
  if (cents === null) return 'Consultar';
  if (cents === 0) return 'Gratis';
  return `${new Intl.NumberFormat('es-EC', {
    currency: currencyCode,
    style: 'currency',
  }).format(cents / 100)} / mes`;
}

function displayedBookingLimit(subscription: SubscriptionResponse | undefined) {
  if (!subscription || subscription.current.planCode !== 'free') {
    return subscription?.usage.bookingLimit ?? null;
  }
  return (
    FREE_BOOKING_LIMIT +
    (subscription.usage.graceUsed ? subscription.usage.graceBookings : 0)
  );
}

function bookingUsageNotice(subscription: SubscriptionResponse | undefined) {
  if (!subscription || subscription.current.planCode !== 'free') return null;
  const usage = subscription.usage;
  const effectiveLimit = displayedBookingLimit(subscription);
  if (effectiveLimit === null) return null;
  const baseLimit =
    effectiveLimit - (usage.graceUsed ? usage.graceBookings : 0);
  const used = usage.rolling30DayBookings;

  if (usage.graceAvailable && used >= baseLimit)
    return {
      copy: `Llegaste a ${baseLimit} reservas. Puedes activar una unica cortesia de ${usage.graceBookings} reservas o pasar a un plan sin limite.`,
      title: 'Limite mensual alcanzado',
    };
  if (used >= effectiveLimit)
    return {
      copy: 'Las nuevas reservas estan pausadas. Tus datos y reservas anteriores siguen disponibles.',
      title: 'Reservas temporalmente pausadas',
    };
  if (usage.graceUsed && used >= baseLimit)
    return {
      copy: `Te quedan ${effectiveLimit - used} reservas de cortesia en esta ventana de 30 dias.`,
      title: 'Cortesia activa',
    };
  if (used >= 21)
    return {
      copy: `Te quedan ${baseLimit - used} reservas antes de alcanzar el limite de Nava Free.`,
      title: 'Estas cerca del limite',
    };
  if (used >= 20)
    return {
      copy: `Ya utilizaste ${used} de ${baseLimit} reservas en los ultimos 30 dias.`,
      title: '75% del limite utilizado',
    };
  if (used >= 20)
    return {
      copy: `Ya gestionaste ${used} reservas con Nava en los ultimos 30 dias.`,
      title: 'Tu negocio esta creciendo',
    };
  return null;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const subscriptionQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<SubscriptionResponse>('/v1/subscription'),
    queryKey: accountQueryKey(user?.id, 'subscription'),
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const simulateSubscription = useMutation({
    mutationFn: (status: 'active' | 'suspended') =>
      requireApiClient().request('/v1/subscription/simulate', {
        body: { status },
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountQueryPrefix('subscription'),
      });
    },
  });
  const activateGrace = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/subscription/booking-grace', {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountQueryPrefix('subscription'),
      });
    },
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const subscription = subscriptionQuery.data;
  const subscriptionPlan = subscription?.plans.find(
    ({ code }) => code === subscription.current.planCode,
  );
  const isDemoAccount = subscription?.current.status === 'trial';
  const currentPlan =
    isDemoAccount && subscriptionPlan
      ? { ...subscriptionPlan, monthlyPriceCents: 0, name: 'Cuenta demo' }
      : subscriptionPlan;
  const trialEnd = subscription?.current.trialEndsAt
    ? new Date(subscription.current.trialEndsAt).toLocaleDateString()
    : null;
  const usageNotice = bookingUsageNotice(subscription);
  const bookingLimit = displayedBookingLimit(subscription);
  const historicalTeamMembers =
    subscription !== undefined &&
    subscription.current.planCode === 'free' &&
    subscription.usage.teamMemberLimit !== null &&
    subscription.usage.teamMembers > subscription.usage.teamMemberLimit;
  const teamUsageValue = subscription
    ? historicalTeamMembers
      ? `${subscription.usage.teamMembers} guardados · ${subscription.usage.teamMemberLimit} operativo`
      : `${subscription.usage.teamMembers} / ${subscription.usage.teamMemberLimit ?? 'Ilimitados'}`
    : '-';
  const locationLimit = subscription
    ? effectiveLocationLimit(subscription)
    : null;
  const advancedModulesCopy =
    subscription?.current.planCode === 'essential'
      ? 'Nava Esencial está pensado para operación individual. Los módulos de equipo y operación ampliada requieren Nava Local, salvo una habilitación especial activa.'
      : subscription?.current.planCode === 'free'
        ? 'Estos módulos no forman parte de Nava Free. Tus datos históricos se conservan y puedes activarlos con Nava Local.'
        : 'Estos módulos forman parte de la operación ampliada de tu plan y reflejan cualquier habilitación especial vigente.';

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
            Suscripción
          </Text>
          <Text style={styles.subtitle}>Tu plan y capacidades de Nava</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {subscriptionQuery.error ? (
          <InlineMessage
            message={
              subscriptionQuery.error instanceof Error
                ? subscriptionQuery.error.message
                : 'No pudimos consultar tu suscripción.'
            }
          />
        ) : null}
        <View style={styles.currentCard}>
          <View style={styles.currentHeading}>
            <View>
              <Text style={styles.eyebrow}>PLAN ACTUAL</Text>
              <Text style={styles.currentPlan}>
                {currentPlan?.name ?? 'Cargando…'}
              </Text>
            </View>
            {subscription ? (
              <View style={styles.statusBadge}>
                <Text style={styles.statusLabel}>
                  {STATUS_LABELS[subscription.current.status]}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.priceLabel}>
            {isDemoAccount
              ? 'Gratis durante la prueba'
              : currentPlan
                ? formatPrice(
                    currentPlan.monthlyPriceCents,
                    currentPlan.currencyCode,
                  )
                : 'Consultando precio'}
          </Text>
          {trialEnd ? (
            <Text style={styles.periodCopy}>
              Prueba sin tarjeta hasta el {trialEnd}.
            </Text>
          ) : null}
          <View style={styles.usageGrid}>
            <UsageItem
              label="Reservas (ultimos 30 dias)"
              value={
                subscription
                  ? `${subscription.usage.rolling30DayBookings} / ${bookingLimit ?? 'Ilimitadas'}`
                  : '-'
              }
            />
            <UsageItem
              label="Clientes activos"
              value={
                subscription
                  ? `${subscription.usage.clients} / ${subscription.usage.clientLimit ?? 'Ilimitados'}`
                  : '-'
              }
            />
            <UsageItem label="Profesionales" value={teamUsageValue} />
            <UsageItem
              label="Sucursales"
              value={
                subscription
                  ? `${subscription.usage.locations} / ${locationLimit ?? '-'}`
                  : '-'
              }
            />
          </View>
          <View style={styles.hiddenUsage}>
            <View style={styles.usageItem}>
              <Text style={styles.usageValue}>
                {subscription?.usage.locations ?? '—'} /{' '}
                {currentPlan?.limits.locations ?? '—'}
              </Text>
              <Text style={styles.usageLabel}>Sucursales</Text>
            </View>
            <View style={styles.usageDivider} />
            <View style={styles.usageItem}>
              <Text style={styles.usageValue}>
                {subscription?.usage.teamMembers ?? '—'}
              </Text>
              <Text style={styles.usageLabel}>Integrantes · sin límite</Text>
            </View>
          </View>
        </View>

        {usageNotice ? (
          <View style={styles.limitCard}>
            <Ionicons color="#A15C00" name="speedometer-outline" size={23} />
            <View style={styles.headerCopy}>
              <Text style={styles.warningTitle}>{usageNotice.title}</Text>
              <Text style={styles.infoCopy}>{usageNotice.copy}</Text>
              {subscription?.usage.graceAvailable &&
              subscription.current.canManage ? (
                <Pressable
                  disabled={activateGrace.isPending}
                  onPress={() => activateGrace.mutate()}
                  style={styles.graceButton}
                >
                  <Text style={styles.graceButtonLabel}>
                    {activateGrace.isPending
                      ? 'Activando...'
                      : `Activar +${subscription.usage.graceBookings} reservas`}
                  </Text>
                </Pressable>
              ) : null}
              {activateGrace.error ? (
                <InlineMessage
                  message={
                    activateGrace.error instanceof Error
                      ? activateGrace.error.message
                      : 'No pudimos activar la cortesia.'
                  }
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {subscription?.current.planCode === 'free' ? (
          <View style={styles.freePlanCard}>
            <Ionicons
              color={appTheme.colors.accentDark}
              name="shield-outline"
              size={23}
            />
            <View style={styles.headerCopy}>
              <Text style={styles.infoTitle}>Cómo funciona Nava Free</Text>
              <Text style={styles.infoCopy}>
                Incluye 25 reservas por cada 30 días, una sucursal y un
                profesional operativo.
              </Text>
              <Text style={styles.infoCopy}>
                {historicalTeamMembers
                  ? 'Tus profesionales adicionales siguen guardados en modo histórico. No pueden recibir nuevas citas, reservas online ni cambios operativos hasta actualizar a Nava Local.'
                  : 'Si vuelves desde Demo o un plan pagado, Nava conserva tus datos. Los recursos que excedan tu plan quedarán visibles como históricos y sin funciones operativas.'}
              </Text>
            </View>
          </View>
        ) : null}

        {subscription?.current.readOnly ? (
          <View style={styles.warningCard}>
            <Ionicons color="#A15C00" name="lock-closed-outline" size={23} />
            <View style={styles.headerCopy}>
              <Text style={styles.warningTitle}>Modo de solo lectura</Text>
              <Text style={styles.infoCopy}>
                Tus datos siguen disponibles para consulta y exportación. Las
                operaciones que cambian información están bloqueadas hasta
                reactivar la suscripción.
              </Text>
            </View>
          </View>
        ) : null}

        {currentPlan ? (
          <View style={styles.capabilityCard}>
            <Text style={styles.infoTitle}>Incluido en {currentPlan.name}</Text>
            <Text style={styles.infoCopy}>
              Estas son las capacidades reales del plan que tienes activo.
            </Text>
            {currentPlan.features.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Ionicons
                  color="#287247"
                  name="checkmark-circle-outline"
                  size={19}
                />
                <Text style={styles.featureLabel}>{feature}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {subscription ? (
          <View style={styles.capabilityCard}>
            <Text style={styles.infoTitle}>Módulos avanzados</Text>
            <Text style={styles.infoCopy}>{advancedModulesCopy}</Text>
            <Capability
              label="Equipo y colaboradores"
              value={subscription.current.featureFlags.team}
            />
            <Capability
              label="Comisiones"
              value={subscription.current.featureFlags.commissions}
            />
            <Capability
              label="Inventario"
              value={subscription.current.featureFlags.inventory}
            />
            <Capability
              label="Múltiples sucursales"
              value={subscription.current.featureFlags.multiLocation}
            />
          </View>
        ) : null}

        {subscription?.current.simulationAvailable &&
        subscription.current.canManage ? (
          <View style={styles.simulationCard}>
            <Text style={styles.infoTitle}>Simulación para el MVP</Text>
            <Text style={styles.infoCopy}>
              Comprueba el modo lectura sin cobrar dinero ni eliminar datos.
            </Text>
            <View style={styles.simulationActions}>
              <Pressable
                disabled={
                  simulateSubscription.isPending ||
                  subscription.current.readOnly
                }
                onPress={() => simulateSubscription.mutate('suspended')}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryLabel}>Simular suspensión</Text>
              </Pressable>
              <Pressable
                disabled={
                  simulateSubscription.isPending ||
                  !subscription.current.readOnly
                }
                onPress={() => simulateSubscription.mutate('active')}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryLabel}>Reactivar</Text>
              </Pressable>
            </View>
            {simulateSubscription.error ? (
              <InlineMessage
                message={
                  simulateSubscription.error instanceof Error
                    ? simulateSubscription.error.message
                    : 'No pudimos cambiar la simulación.'
                }
              />
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Comparar planes</Text>
        {subscription?.plans.map((plan) => (
          <View key={plan.code} style={styles.planCard}>
            <View style={styles.planHeading}>
              <View style={styles.headerCopy}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>
                  {formatPrice(plan.monthlyPriceCents, plan.currencyCode)}
                </Text>
              </View>
              <View
                style={
                  plan.available ? styles.availableBadge : styles.soonBadge
                }
              >
                <Text
                  style={
                    plan.available ? styles.availableLabel : styles.soonLabel
                  }
                >
                  {plan.available ? 'Disponible' : 'Próximamente'}
                </Text>
              </View>
            </View>
            {plan.features.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Ionicons
                  color={plan.available ? '#287247' : appTheme.colors.textMuted}
                  name="checkmark-circle-outline"
                  size={19}
                />
                <Text style={styles.featureLabel}>{feature}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.infoCard}>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="globe-outline"
            size={23}
          />
          <View style={styles.headerCopy}>
            <Text style={styles.infoTitle}>
              Suscripción administrada fuera de la app
            </Text>
            <Text style={styles.infoCopy}>
              Esta aplicación muestra el estado y las capacidades de tu plan.
              Cuando una suscripción se active fuera de la aplicación, sus
              funciones se habilitarán automáticamente al actualizar tu sesión.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function UsageItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.usageTile}>
      <Text style={styles.usageValue}>{value}</Text>
      <Text style={styles.usageLabel}>{label}</Text>
    </View>
  );
}

function Capability({
  label,
  value,
}: {
  readonly label: string;
  readonly value: boolean;
}) {
  return (
    <View style={styles.capabilityRow}>
      <Ionicons
        color={value ? '#287247' : appTheme.colors.textMuted}
        name={value ? 'checkmark-circle' : 'remove-circle-outline'}
        size={19}
      />
      <Text style={styles.featureLabel}>{label}</Text>
      <Text style={value ? styles.enabledLabel : styles.soonLabel}>
        {value ? 'Activo' : 'Requiere Nava Local'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  availableBadge: {
    backgroundColor: '#e8f3ec',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  availableLabel: { color: '#287247', fontSize: 11, fontWeight: '800' },
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
    gap: 14,
    maxWidth: 720,
    paddingBottom: 42,
    paddingHorizontal: 20,
    width: '100%',
  },
  currentCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    padding: 20,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  currentHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  currentPlan: { color: appTheme.colors.text, fontSize: 28, fontWeight: '900' },
  capabilityCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    padding: 17,
    ...goldButtonShadow,
  },
  capabilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingTop: 12,
  },
  enabledLabel: { color: '#287247', fontSize: 11, fontWeight: '900' },
  eyebrow: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  featureLabel: { color: appTheme.colors.text, flex: 1, fontSize: 14 },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
  },
  freePlanCard: {
    alignItems: 'flex-start',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
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
  infoCard: {
    alignItems: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  infoCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  infoTitle: { color: appTheme.colors.text, fontSize: 15, fontWeight: '800' },
  periodCopy: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 8 },
  planCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    borderWidth: 0,
    padding: 17,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  planHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  planName: { color: appTheme.colors.text, fontSize: 21, fontWeight: '900' },
  planPrice: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 3 },
  priceLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 16,
  },
  screen: appStyles.screen,
  primaryButton: {
    backgroundColor: appTheme.colors.accentDark,
    borderRadius: 14,
    flex: 1,
    padding: 12,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    flex: 1,
    padding: 12,
  },
  secondaryLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  simulationActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  simulationCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    padding: 17,
    ...goldButtonShadow,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  soonBadge: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soonLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadge: {
    backgroundColor: '#dff2e6',
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusLabel: { color: '#23663f', fontSize: 11, fontWeight: '900' },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 2 },
  title: { color: appTheme.colors.text, fontSize: 25, fontWeight: '900' },
  usageDivider: {
    backgroundColor: appTheme.colors.border,
    height: 42,
    width: 1,
  },
  usageItem: { flex: 1 },
  usageLabel: { color: appTheme.colors.textMuted, fontSize: 11, marginTop: 3 },
  usageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 20,
  },
  usageValue: { color: appTheme.colors.text, fontSize: 18, fontWeight: '900' },
  graceButton: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.accentDark,
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  graceButtonLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  hiddenUsage: { display: 'none' },
  limitCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF4DE',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  usageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  usageTile: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    minWidth: '47%',
    padding: 12,
  },
  warningCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF4DE',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  warningTitle: { color: '#7A4300', fontSize: 15, fontWeight: '900' },
});
