import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CashMovementRecord,
  CashRegisterDetailResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

function movementLabel(type: CashMovementRecord['type']) {
  if (type === 'sale') return 'Venta';
  if (type === 'deposit') return 'Depósito';
  if (type === 'other_income') return 'Otro ingreso';
  if (type === 'expense') return 'Gasto';
  if (type === 'withdrawal') return 'Retiro';
  if (type === 'professional_advance') return 'Anticipo a colaborador';
  if (type === 'professional_advance_reversal') return 'Reverso de anticipo';
  return 'Pago de liquidación';
}

function movementIsIncome(type: CashMovementRecord['type']) {
  return (
    type === 'sale' ||
    type === 'deposit' ||
    type === 'other_income' ||
    type === 'professional_advance_reversal'
  );
}

function attributionSummary(movement: CashMovementRecord) {
  const recordedBy =
    movement.attribution?.recordedBy?.name ?? movement.recordedByNameSnapshot;
  const labels = [
    movement.attribution?.professional?.name
      ? `Hecho por: ${movement.attribution.professional.name}`
      : movement.professionalNameSnapshot
        ? `Hecho por: ${movement.professionalNameSnapshot}`
        : null,
    movement.attribution?.seller?.name
      ? `Vendió: ${movement.attribution.seller.name}`
      : movement.sellerNameSnapshot
        ? `Vendió: ${movement.sellerNameSnapshot}`
        : null,
    recordedBy ? `Registró: ${recordedBy}` : null,
  ].filter((value): value is string => Boolean(value));
  return labels.join(' · ');
}

export default function CashRegisterDetailScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const router = useRouter();
  const { locationId, sessionId } = useLocalSearchParams<{
    locationId?: string;
    sessionId: string;
  }>();
  const [arePaymentMethodsVisible, setArePaymentMethodsVisible] =
    useState(false);
  const detailQuery = useQuery({
    enabled: Boolean(session && sessionId),
    queryFn: () =>
      requireApiClient().request<CashRegisterDetailResponse>(
        `/v1/cash-register/sessions/${sessionId}?locationId=${encodeURIComponent(locationId ?? tenant.scope.locationId)}`,
      ),
    queryKey: tenant.key('cash-register-detail', sessionId),
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  const cashSession = detailQuery.data?.session;
  const totals = detailQuery.data?.totals;
  const movements = detailQuery.data?.movements ?? [];
  const shownAmount =
    cashSession?.status === 'closed'
      ? (cashSession.closingAmountCents ?? totals?.expectedCash ?? 0)
      : (totals?.expectedCash ?? cashSession?.openingAmountCents ?? 0);
  const formatMoney = (amountCents: number) =>
    `$${(amountCents / 100).toFixed(2)}`;
  const openedAt = cashSession
    ? new Date(cashSession.openedAt).toLocaleString('es-EC', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/cash-register')
          }
          style={styles.back}
        >
          <Ionicons color="#111827" name="chevron-back" size={28} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Detalle de caja
        </Text>
        <View style={styles.back} />
      </View>
      {!cashSession || !totals ? (
        <View style={styles.centered}>
          <Text style={styles.loading}>
            {detailQuery.isLoading
              ? 'Cargando detalle…'
              : 'No encontramos esta caja.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.heroAmount}>{formatMoney(shownAmount)}</Text>
            <Text style={styles.heroLabel}>
              {cashSession.status === 'closed'
                ? 'Efectivo contado al cierre'
                : 'Total en caja'}
            </Text>
            <Text style={styles.heroCaption}>
              {cashSession.status === 'closed'
                ? `Efectivo esperado: ${formatMoney(totals.expectedCash)}`
                : 'La caja está abierta'}
            </Text>
          </View>

          <View style={styles.metaCard}>
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                {cashSession.responsibleName}
              </Text>
              <Text style={styles.metaLabel}>Responsable</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{openedAt}</Text>
              <Text style={styles.metaLabel}>Fecha de apertura</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Movimientos</Text>
            <Text style={styles.sectionCopy}>
              Resumen de ventas, ingresos, gastos y retiros de esta caja.
            </Text>
            <View style={styles.summaryMetrics}>
              <Metric
                amount={formatMoney(totals.sales)}
                color="#288B52"
                icon="trending-up-outline"
                label="Ventas"
              />
              <Metric
                amount={formatMoney(totals.expenses)}
                color="#B54747"
                icon="trending-down-outline"
                label="Gastos"
              />
            </View>
          </View>

          <View style={styles.detailsCard}>
            <View style={styles.detailsHeading}>
              <View>
                <Text style={styles.sectionTitle}>Base del día</Text>
                <Text style={styles.baseAmount}>
                  {formatMoney(cashSession.openingAmountCents)}
                </Text>
              </View>
              <View
                style={[
                  styles.status,
                  cashSession.status === 'closed' && styles.closedStatus,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    cashSession.status === 'closed' && styles.closedStatusText,
                  ]}
                >
                  {cashSession.status === 'closed' ? 'Cerrada' : 'Abierta'}
                </Text>
              </View>
            </View>
            <DetailRow
              label="Ventas registradas"
              value={formatMoney(totals.sales)}
            />
            <DetailRow
              label="Depósitos manuales"
              value={formatMoney(totals.deposits)}
            />
            <DetailRow
              label="Otros ingresos"
              value={formatMoney(totals.otherIncome)}
            />
            <DetailRow
              label="Gastos"
              negative
              value={formatMoney(totals.expenses)}
            />
            <DetailRow
              label="Dinero retirado"
              negative
              value={formatMoney(totals.withdrawals)}
            />
            <DetailRow
              label="Anticipos a colaboradores"
              negative
              value={formatMoney(totals.professionalAdvances)}
            />
            <DetailRow
              label="Pagos de liquidaciones"
              negative
              value={formatMoney(totals.commissionSettlements)}
            />
            <DetailRow
              label="Reversos de anticipos"
              value={formatMoney(totals.advanceReversals)}
            />
            <DetailRow
              label="Cobros con tarjeta"
              value={formatMoney(totals.card)}
            />
            <DetailRow
              label="Transferencias"
              value={formatMoney(totals.transfers)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setArePaymentMethodsVisible((visible) => !visible)}
              style={styles.paymentMethodsToggle}
            >
              <Text style={styles.paymentMethodsLabel}>
                Todos los métodos de pago
              </Text>
              <Ionicons
                color="#111827"
                name={arePaymentMethodsVisible ? 'chevron-up' : 'chevron-down'}
                size={23}
              />
            </Pressable>
            {arePaymentMethodsVisible ? (
              <View style={styles.paymentMethods}>
                <DetailRow
                  label="Efectivo cobrado"
                  value={formatMoney(totals.cashSales)}
                />
                <DetailRow label="Tarjeta" value={formatMoney(totals.card)} />
                <DetailRow
                  label="Transferencia"
                  value={formatMoney(totals.transfers)}
                />
                <DetailRow label="Otro" value={formatMoney(totals.other)} />
              </View>
            ) : null}
            <DetailRow
              label="Efectivo esperado"
              value={formatMoney(totals.expectedCash)}
            />
            {cashSession.status === 'closed' ? (
              <>
                <DetailRow
                  label="Efectivo contado"
                  value={formatMoney(cashSession.closingAmountCents ?? 0)}
                />
                <DetailRow
                  label="Diferencia"
                  negative={(cashSession.differenceCents ?? 0) < 0}
                  value={formatMoney(cashSession.differenceCents ?? 0)}
                />
                <DetailRow
                  label="Fecha de cierre"
                  value={
                    cashSession.closedAt
                      ? new Date(cashSession.closedAt).toLocaleString('es-EC', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : '—'
                  }
                />
                {cashSession.closingNote ? (
                  <View style={styles.closingNote}>
                    <Text style={styles.closingNoteLabel}>Nota del cierre</Text>
                    <Text style={styles.closingNoteText}>
                      {cashSession.closingNote}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
          <View style={styles.movementsCard}>
            <Text style={styles.sectionTitle}>Movimientos registrados</Text>
            {movements.length ? (
              movements.map((movement) => (
                <View key={movement.id} style={styles.movementRow}>
                  <View style={styles.movementCopy}>
                    <Text style={styles.movementTitle}>
                      {movement.description}
                    </Text>
                    <Text style={styles.movementMeta}>
                      {movementLabel(movement.type)}
                      {movement.productId
                        ? ` · Producto x${movement.productQuantity ?? 1}`
                        : ''}
                      {' · '}
                      {paymentLabel(movement.paymentMethod)}
                      {movement.appointmentId ? ' · Cita vinculada' : ''}
                      {movement.reversedAt ? ' · Revertida' : ''}
                    </Text>
                    {attributionSummary(movement) ? (
                      <Text style={styles.movementMeta}>
                        {attributionSummary(movement)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.movementValue}>
                    <Text
                      style={[
                        styles.movementAmount,
                        (!movementIsIncome(movement.type) ||
                          Boolean(movement.reversedAt)) &&
                          styles.negativeValue,
                      ]}
                    >
                      {movement.reversedAt
                        ? '↶ '
                        : movementIsIncome(movement.type)
                          ? '+'
                          : '-'}
                      {formatMoney(movement.amountCents)}
                    </Text>
                    <Text style={styles.movementMeta}>
                      {new Date(movement.createdAt).toLocaleTimeString(
                        'es-EC',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyMovements}>
                No se registraron movimientos en esta caja.
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function paymentLabel(method: 'card' | 'cash' | 'other' | 'transfer' | null) {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia';
  if (method === 'other') return 'Otro';
  return 'Sin método';
}

function Metric({
  amount,
  color,
  icon,
  label,
}: {
  readonly amount: string;
  readonly color: string;
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons color={color} name={icon} size={21} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricAmount, { color }]}>{amount}</Text>
    </View>
  );
}

function DetailRow({
  label,
  negative = false,
  value,
}: {
  readonly label: string;
  readonly negative?: boolean;
  readonly value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, negative && styles.negativeValue]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  baseAmount: {
    color: '#288B52',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 5,
  },
  closingNote: {
    backgroundColor: '#F5F7FA',
    borderRadius: 13,
    marginTop: 17,
    padding: 13,
  },
  closingNoteLabel: { color: '#56606C', fontSize: 13, fontWeight: '800' },
  closingNoteText: {
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 30,
  },
  closedStatus: { backgroundColor: '#F1F3F5' },
  closedStatusText: { color: '#667080' },
  content: { gap: 18, padding: 22, paddingBottom: 40 },
  detailLabel: { color: '#56606C', fontSize: 16 },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 17,
  },
  detailValue: { color: '#111827', fontSize: 16, fontWeight: '900' },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E8EB',
    borderRadius: 25,
    borderWidth: 1,
    padding: 20,
  },
  detailsHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 5,
  },
  emptyMovements: { color: '#727B86', fontSize: 14, marginTop: 13 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  hero: { alignItems: 'center', paddingBottom: 7, paddingTop: 12 },
  heroAmount: { color: '#288B52', fontSize: 42, fontWeight: '900' },
  heroCaption: { color: '#6A7380', fontSize: 13, marginTop: 6 },
  heroLabel: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 6,
  },
  loading: { color: '#69717C', fontSize: 15 },
  metaCard: {
    alignItems: 'stretch',
    backgroundColor: '#F5F7FA',
    borderRadius: 21,
    flexDirection: 'row',
    padding: 17,
  },
  metaDivider: { backgroundColor: '#DDE2E8', marginHorizontal: 12, width: 1 },
  metaItem: { flex: 1 },
  metaLabel: { color: '#727B86', fontSize: 12, marginTop: 5 },
  metaValue: { color: '#111827', fontSize: 14, fontWeight: '900' },
  metric: { flex: 1 },
  metricAmount: { fontSize: 19, fontWeight: '900', marginTop: 2 },
  metricIcon: {
    alignItems: 'center',
    borderRadius: 15,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  metricLabel: { color: '#667080', fontSize: 14, marginTop: 9 },
  movementAmount: { color: '#288B52', fontSize: 14, fontWeight: '900' },
  movementCopy: { flex: 1 },
  movementMeta: { color: '#727B86', fontSize: 12, marginTop: 4 },
  movementRow: {
    alignItems: 'center',
    borderBottomColor: '#E9EBEE',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 13,
  },
  movementTitle: { color: '#111827', fontSize: 14, fontWeight: '800' },
  movementValue: { alignItems: 'flex-end' },
  movementsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E8EB',
    borderRadius: 25,
    borderWidth: 1,
    padding: 20,
  },
  negativeValue: { color: '#B54747' },
  paymentMethods: {
    backgroundColor: '#F7F9FB',
    borderRadius: 15,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 1,
  },
  paymentMethodsLabel: { color: '#111827', fontSize: 16, fontWeight: '900' },
  paymentMethodsToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 21,
  },
  screen: { backgroundColor: '#FBFCFF', flex: 1 },
  sectionCopy: { color: '#727B86', fontSize: 14, lineHeight: 20, marginTop: 7 },
  sectionTitle: { color: '#111827', fontSize: 19, fontWeight: '900' },
  status: {
    backgroundColor: '#E6F6EC',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  statusText: { color: '#288B52', fontSize: 13, fontWeight: '900' },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E8EB',
    borderRadius: 25,
    borderWidth: 1,
    padding: 20,
  },
  summaryMetrics: { flexDirection: 'row', gap: 28, marginTop: 20 },
  title: { color: '#111827', fontSize: 25, fontWeight: '900' },
});
