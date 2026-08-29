import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentPaymentConfirmationRecord,
  AppointmentPaymentConfirmationsResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BottomNavigation,
  appTheme,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

const paymentMethods = [
  ['cash', 'Efectivo'],
  ['card', 'Tarjeta'],
  ['transfer', 'Transferencia'],
  ['other', 'Otro'],
] as const;

export default function PaymentConfirmationsScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] =
    useState<AppointmentPaymentConfirmationRecord | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof paymentMethods)[number][0]>('cash');
  const confirmationsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<AppointmentPaymentConfirmationsResponse>(
        '/v1/appointment-payment-confirmations',
      ),
    queryKey: tenant.key('appointment-payment-confirmations'),
  });
  const confirmPayment = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Selecciona un cobro pendiente.');
      return requireApiClient().request('/v1/cash-register/movements', {
        body: {
          amountCents: selected.totalCents,
          appointmentId: selected.appointmentId,
          description: `Cobro confirmado · ${selected.clientName}`,
          locationId: selected.locationId,
          paymentMethod,
          type: 'sale',
        },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos confirmar el cobro',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('appointment-payment-confirmations'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('agenda-appointments'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('cash-register-summary'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('financial-records'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('commission-overview'),
        }),
      ]);
      Alert.alert(
        'Cobro confirmado',
        'La cita quedó pagada y el ingreso fue registrado en Caja.',
      );
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  const confirmations = confirmationsQuery.data?.confirmations ?? [];
  const formatMoney = (amountCents: number) =>
    `$${(amountCents / 100).toFixed(2)}`;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Volver" onPress={() => router.back()}>
          <Ionicons
            color={appTheme.colors.text}
            name="chevron-back"
            size={28}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Cobros por confirmar
          </Text>
          <Text style={styles.subtitle}>
            Solo al confirmar se registra el ingreso en Caja.
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {confirmationsQuery.isLoading ? (
          <Text style={styles.empty}>Cargando cobros pendientes…</Text>
        ) : null}
        {confirmationsQuery.isError ? (
          <Text style={styles.empty}>
            No pudimos cargar los cobros pendientes.
          </Text>
        ) : null}
        {!confirmationsQuery.isLoading &&
        !confirmationsQuery.isError &&
        !confirmations.length ? (
          <Text style={styles.empty}>
            No tienes cobros pendientes de confirmar.
          </Text>
        ) : null}
        {confirmations.map((confirmation) => {
          const isSelected =
            selected?.appointmentId === confirmation.appointmentId;
          return (
            <Pressable
              key={confirmation.appointmentId}
              onPress={() => setSelected(confirmation)}
              style={[styles.card, isSelected && styles.selectedCard]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.client}>{confirmation.clientName}</Text>
                  <Text style={styles.meta}>
                    Hecho por: {confirmation.professionalName}
                  </Text>
                  <Text style={styles.meta}>
                    {confirmation.services
                      .map((service) => service.name)
                      .join(', ')}
                  </Text>
                  {confirmation.requestedByName ? (
                    <Text style={styles.meta}>
                      Completó: {confirmation.requestedByName}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.amount}>
                  {formatMoney(confirmation.totalCents)}
                </Text>
              </View>
              <Text style={styles.time}>
                Completada{' '}
                {new Date(confirmation.requestedAt).toLocaleString('es-EC', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Text>
            </Pressable>
          );
        })}
        {selected ? (
          <View style={styles.confirmationCard}>
            <Text style={styles.confirmationTitle}>Confirmar cobro</Text>
            <Text style={styles.confirmationCopy}>
              {selected.clientName} · {formatMoney(selected.totalCents)}
            </Text>
            <View style={styles.methods}>
              {paymentMethods.map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setPaymentMethod(value)}
                  style={[
                    styles.method,
                    paymentMethod === value && styles.methodActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.methodText,
                      paymentMethod === value && styles.methodTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              disabled={confirmPayment.isPending}
              onPress={() =>
                Alert.alert(
                  'Confirmar cobro',
                  `Se registrará ${formatMoney(selected.totalCents)} en Caja.`,
                  [
                    { style: 'cancel', text: 'Cancelar' },
                    {
                      onPress: () => confirmPayment.mutate(),
                      text: 'Confirmar',
                    },
                  ],
                )
              }
              style={[
                styles.confirmButton,
                confirmPayment.isPending && styles.disabled,
              ]}
            >
              <Text style={styles.confirmText}>
                {confirmPayment.isPending
                  ? 'Confirmando…'
                  : 'Confirmar y registrar en Caja'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <BottomNavigation active="cash" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  amount: { color: '#288B52', fontSize: 16, fontWeight: '800' },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: appTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
  },
  cardCopy: { flex: 1, paddingRight: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  client: { color: appTheme.colors.text, fontSize: 16, fontWeight: '800' },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#1C1C1C',
    borderRadius: 14,
    padding: 14,
  },
  confirmationCard: {
    backgroundColor: '#FFF9EA',
    borderColor: '#E1B85B',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginTop: 6,
    padding: 16,
  },
  confirmationCopy: { color: appTheme.colors.textMuted, fontSize: 14 },
  confirmationTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  confirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  content: { gap: 10, padding: 20, paddingBottom: 125 },
  disabled: { opacity: 0.55 },
  empty: {
    color: appTheme.colors.textMuted,
    paddingTop: 40,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: 7,
  },
  headerCopy: { flex: 1 },
  meta: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 4 },
  method: {
    borderColor: appTheme.colors.border,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  methodActive: {
    backgroundColor: '#F7E8B8',
    borderColor: appTheme.colors.accentDark,
  },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  methodTextActive: { color: '#805E21' },
  placeholder: { width: 28 },
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
  selectedCard: { borderColor: appTheme.colors.accentDark, borderWidth: 2 },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 2 },
  time: { color: appTheme.colors.textMuted, fontSize: 11, marginTop: 9 },
  title: { color: appTheme.colors.text, fontSize: 19, fontWeight: '800' },
});
