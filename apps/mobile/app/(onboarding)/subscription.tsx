import Ionicons from '@expo/vector-icons/Ionicons';
import type { SubscriptionResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineMessage } from '../../src/components/InlineMessage';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const STATUS_LABELS: Record<SubscriptionResponse['current']['status'], string> =
  {
    active: 'Activa',
    cancelled: 'Cancelada',
    past_due: 'Período de gracia',
    suspended: 'Solo lectura',
    trial: 'Prueba gratuita',
  };

export default function SubscriptionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const subscriptionQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<SubscriptionResponse>('/v1/subscription'),
    queryKey: ['subscription'],
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const subscription = subscriptionQuery.data;
  const currentPlan = subscription?.plans.find(
    ({ code }) => code === subscription.current.planCode,
  );
  const trialEnd = subscription?.current.trialEndsAt
    ? new Date(subscription.current.trialEndsAt).toLocaleDateString()
    : null;

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
          <Ionicons color="#101c2d" name="arrow-back" size={25} />
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
          <Text style={styles.priceLabel}>Precio por definir</Text>
          {trialEnd ? (
            <Text style={styles.periodCopy}>
              Prueba sin tarjeta hasta el {trialEnd}.
            </Text>
          ) : null}
          <View style={styles.usageRow}>
            <View style={styles.usageItem}>
              <Text style={styles.usageValue}>
                {subscription?.usage.locations ?? '—'} / 1
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

        <Text style={styles.sectionTitle}>Comparar planes</Text>
        {subscription?.plans.map((plan) => (
          <View key={plan.code} style={styles.planCard}>
            <View style={styles.planHeading}>
              <View style={styles.headerCopy}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>Precio por definir</Text>
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
                  color={plan.available ? '#287247' : '#667080'}
                  name="checkmark-circle-outline"
                  size={19}
                />
                <Text style={styles.featureLabel}>{feature}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.infoCard}>
          <Ionicons color="#101c2d" name="card-outline" size={23} />
          <View style={styles.headerCopy}>
            <Text style={styles.infoTitle}>
              Facturación todavía no habilitada
            </Text>
            <Text style={styles.infoCopy}>
              Esta etapa simula estados y límites. Nava no solicitará tarjeta ni
              usará el PayPhone de tu negocio para cobrar la suscripción.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    paddingBottom: 42,
    paddingHorizontal: 20,
    width: '100%',
  },
  currentCard: { backgroundColor: '#101c2d', borderRadius: 22, padding: 20 },
  currentHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  currentPlan: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  eyebrow: { color: '#aeb8c5', fontSize: 11, fontWeight: '900' },
  featureLabel: { color: '#303a48', flex: 1, fontSize: 14 },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
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
    backgroundColor: '#eef0f2',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  infoCopy: { color: '#667080', fontSize: 13, lineHeight: 19, marginTop: 4 },
  infoTitle: { color: '#101c2d', fontSize: 15, fontWeight: '800' },
  periodCopy: { color: '#d6dce3', fontSize: 13, marginTop: 8 },
  planCard: {
    borderColor: '#d9dde3',
    borderRadius: 20,
    borderWidth: 1,
    padding: 17,
  },
  planHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  planName: { color: '#101c2d', fontSize: 21, fontWeight: '900' },
  planPrice: { color: '#667080', fontSize: 13, marginTop: 3 },
  priceLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 16,
  },
  screen: { backgroundColor: '#ffffff', flex: 1 },
  sectionTitle: {
    color: '#101c2d',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  soonBadge: {
    backgroundColor: '#eceef1',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soonLabel: { color: '#667080', fontSize: 11, fontWeight: '800' },
  statusBadge: {
    backgroundColor: '#dff2e6',
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusLabel: { color: '#23663f', fontSize: 11, fontWeight: '900' },
  subtitle: { color: '#667080', fontSize: 13, marginTop: 2 },
  title: { color: '#101c2d', fontSize: 25, fontWeight: '900' },
  usageDivider: { backgroundColor: '#536070', height: 42, width: 1 },
  usageItem: { flex: 1 },
  usageLabel: { color: '#aeb8c5', fontSize: 11, marginTop: 3 },
  usageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 20,
  },
  usageValue: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
});
