import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CashRegisterHistoryResponse,
  CashRegisterSummaryResponse,
  CommissionOverviewResponse,
  CurrentOrganizationResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function WalletScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ tab?: string | string[] }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<
    'commissions' | 'history' | 'settings' | 'summary'
  >(() => {
    const requestedTab = Array.isArray(searchParams.tab)
      ? searchParams.tab[0]
      : searchParams.tab;
    return requestedTab === 'commissions' ||
      requestedTab === 'history' ||
      requestedTab === 'settings'
      ? requestedTab
      : 'summary';
  });
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<
    string | null
  >(null);
  const [sheetMode, setSheetMode] = useState<'advance' | 'settlement' | null>(
    null,
  );
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'other' | 'transfer'
  >('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 8)}01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const summaryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CashRegisterSummaryResponse>(
        '/v1/cash-register/summary',
      ),
    queryKey: ['cash-register-summary'],
  });
  const historyQuery = useQuery({
    enabled: Boolean(session) && tab === 'history',
    queryFn: () =>
      requireApiClient().request<CashRegisterHistoryResponse>(
        '/v1/cash-register/history',
      ),
    queryKey: ['cash-register-history'],
  });
  const organizationQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentOrganizationResponse>(
        '/v1/organizations/current',
      ),
    queryKey: ['current-organization'],
  });
  const commissionsQuery = useQuery({
    enabled: Boolean(session) && tab === 'commissions',
    queryFn: () =>
      requireApiClient().request<CommissionOverviewResponse>(
        '/v1/commissions/overview',
      ),
    queryKey: ['commission-overview'],
  });
  const role = organizationQuery.data?.membership?.role;
  const canManageCommissions = role === 'owner' || role === 'manager';
  const canApproveCommissions = role === 'owner';
  const selectedProfessional = commissionsQuery.data?.professionals.find(
    (professional) => professional.id === selectedProfessionalId,
  );
  const effectiveProfessional =
    selectedProfessional ?? commissionsQuery.data?.professionals[0];
  const selectedAdvances = (commissionsQuery.data?.advances ?? []).filter(
    (advance) => advance.professionalMembershipId === effectiveProfessional?.id,
  );
  const selectedSettlements = (commissionsQuery.data?.settlements ?? []).filter(
    (settlement) =>
      settlement.professionalMembershipId === effectiveProfessional?.id,
  );
  const refreshCommissions = () =>
    queryClient.invalidateQueries({ queryKey: ['commission-overview'] });
  const createAdvance = useMutation({
    mutationFn: async () => {
      if (!effectiveProfessional) throw new Error('Selecciona un profesional.');
      const parsedAmount = Math.round(Number(amount.replace(',', '.')) * 100);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
        throw new Error('Ingresa un monto válido.');
      return requireApiClient().request('/v1/commissions/advances', {
        body: {
          amountCents: parsedAmount,
          notes: notes.trim() || undefined,
          paymentMethod,
          professionalMembershipId: effectiveProfessional.id,
          reference: reference.trim() || undefined,
        },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos registrar el anticipo',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await Promise.all([
        refreshCommissions(),
        queryClient.invalidateQueries({ queryKey: ['cash-register-summary'] }),
      ]);
      setSheetMode(null);
      setAmount('');
      setReference('');
      setNotes('');
    },
  });
  const createSettlement = useMutation({
    mutationFn: async () => {
      if (!effectiveProfessional) throw new Error('Selecciona un profesional.');
      return requireApiClient().request('/v1/commissions/settlements', {
        body: {
          notes: notes.trim() || undefined,
          periodEnd,
          periodStart,
          professionalMembershipId: effectiveProfessional.id,
        },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos crear la liquidación',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await refreshCommissions();
      setSheetMode(null);
      setNotes('');
    },
  });
  const settlementAction = useMutation({
    mutationFn: (input: { action: 'approve' | 'cancel' | 'pay'; id: string }) =>
      requireApiClient().request(
        `/v1/commissions/settlements/${input.id}/${input.action}`,
        {
          body:
            input.action === 'cancel'
              ? { reason: 'Cancelada desde Nava Wallet' }
              : input.action === 'pay'
                ? { paymentMethod: 'cash' }
                : {},
          method: 'POST',
        },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos completar la acción',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await Promise.all([
        refreshCommissions(),
        queryClient.invalidateQueries({ queryKey: ['cash-register-summary'] }),
      ]);
    },
  });
  const totals = summaryQuery.data?.totals;
  const formatMoney = (amountCents: number) =>
    `$${(amountCents / 100).toFixed(2)}`;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons color={appTheme.colors.accentDark} name="chevron-back" size={24} />
        </Pressable>
        <View>
          <Text accessibilityRole="header" style={styles.title}>
            Nava Wallet
          </Text>
          <Text style={styles.subtitle}>Pagos y caja de tu actividad</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>Resumen de hoy</Text>
          <Text style={styles.balanceValue}>
            {formatMoney(totals?.sales ?? 0)}
          </Text>
          <Text style={styles.balanceCopy}>
            {totals
              ? `${formatMoney(totals.cash)} en efectivo esperado hoy.`
              : 'Abre tu caja para comenzar a registrar movimientos.'}
          </Text>
        </View>
        <View style={styles.tabs}>
          {(
            [
              ['summary', 'Resumen'],
              ['history', 'Historial'],
              ['commissions', 'Comisiones'],
              ['settings', 'Configuración'],
            ] as const
          ).map(([value, label]) => (
            <Pressable key={value} onPress={() => setTab(value)}>
              <Text style={tab === value ? styles.tabActive : styles.tab}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'summary' ? (
          <>
            <View style={styles.metrics}>
              <Text style={styles.metric}>
                Tarjeta {formatMoney(totals?.card ?? 0)}
              </Text>
              <Text style={styles.metric}>
                Transferencias {formatMoney(totals?.transfers ?? 0)}
              </Text>
              <Text style={styles.metric}>
                Gastos {formatMoney(totals?.expenses ?? 0)}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/cash-register')}
              style={styles.card}
            >
              <View style={styles.icon}>
                <Ionicons color={appTheme.colors.accentDark} name="cash-outline" size={25} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>Caja física</Text>
                <Text style={styles.cardDescription}>
                  Abre caja, registra ventas, gastos, retiros y realiza el
                  cierre.
                </Text>
              </View>
              <Ionicons color={appTheme.colors.accentDark} name="chevron-forward" size={22} />
            </Pressable>
          </>
        ) : null}
        {tab === 'history' ? (
          <View style={styles.history}>
            {historyQuery.isLoading ? (
              <Text style={styles.cardDescription}>Cargando historial...</Text>
            ) : null}
            {(historyQuery.data?.sessions ?? []).map((cashSession) => (
              <Pressable
                accessibilityLabel={`Ver detalle de caja de ${cashSession.responsibleName}`}
                key={cashSession.id}
                onPress={() =>
                  router.push({
                    params: { sessionId: cashSession.id },
                    pathname: '/cash-register-detail',
                  })
                }
                style={styles.historyRow}
              >
                <View style={styles.copy}>
                  <Text style={styles.cardTitle}>
                    {cashSession.responsibleName}
                  </Text>
                  <Text style={styles.cardDescription}>
                    {new Date(cashSession.openedAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.historyValue}>
                  <Text style={styles.historyAmount}>
                    {formatMoney(
                      cashSession.closingAmountCents ??
                        cashSession.totals.expectedCash,
                    )}
                  </Text>
                  <Text style={styles.historyCaption}>Cierre</Text>
                </View>
                <Ionicons color="#69717c" name="chevron-forward" size={20} />
              </Pressable>
            ))}
            {!historyQuery.isLoading && !historyQuery.data?.sessions.length ? (
              <Text style={styles.cardDescription}>
                Aún no hay cierres de caja.
              </Text>
            ) : null}
          </View>
        ) : null}
        {tab === 'commissions' ? (
          <View style={styles.commissionSection}>
            {commissionsQuery.isLoading ? (
              <Text style={styles.cardDescription}>Cargando comisiones...</Text>
            ) : null}
            {commissionsQuery.isError ? (
              <Pressable
                onPress={() => commissionsQuery.refetch()}
                style={styles.card}
              >
                <Text style={styles.cardDescription}>
                  No pudimos cargar las comisiones. Toca para reintentar.
                </Text>
              </Pressable>
            ) : null}
            <ScrollView
              contentContainerStyle={styles.professionalFilters}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {(commissionsQuery.data?.professionals ?? []).map(
                (professional) => (
                  <Pressable
                    accessibilityRole="button"
                    key={professional.id}
                    onPress={() => setSelectedProfessionalId(professional.id)}
                    style={[
                      styles.professionalChip,
                      effectiveProfessional?.id === professional.id &&
                        styles.professionalChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.professionalChipText,
                        effectiveProfessional?.id === professional.id &&
                          styles.professionalChipTextActive,
                      ]}
                    >
                      {professional.name}
                    </Text>
                  </Pressable>
                ),
              )}
            </ScrollView>
            {effectiveProfessional ? (
              <>
                <View style={styles.commissionBalance}>
                  <Text style={styles.balanceLabel}>Neto estimado</Text>
                  <Text style={styles.balanceValue}>
                    {formatMoney(
                      Math.max(
                        0,
                        effectiveProfessional.commissionPendingCents -
                          effectiveProfessional.availableAdvanceCents,
                      ),
                    )}
                  </Text>
                  <View style={styles.commissionMetrics}>
                    <Text style={styles.commissionMetric}>
                      Comisiones{' '}
                      {formatMoney(
                        effectiveProfessional.commissionPendingCents,
                      )}
                    </Text>
                    <Text style={styles.commissionMetric}>
                      Anticipos -
                      {formatMoney(
                        effectiveProfessional.outstandingAdvanceCents,
                      )}
                    </Text>
                  </View>
                </View>
                {canManageCommissions ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      accessibilityLabel="Registrar anticipo de comisión"
                      onPress={() => setSheetMode('advance')}
                      style={styles.secondaryAction}
                    >
                      <Text style={styles.secondaryActionText}>
                        Registrar anticipo
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Crear liquidación de comisión"
                      onPress={() => setSheetMode('settlement')}
                      style={styles.primaryAction}
                    >
                      <Text style={styles.primaryActionText}>
                        Crear liquidación
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                <Text style={styles.sectionTitle}>Anticipos</Text>
                {selectedAdvances.map((advance) => (
                  <View key={advance.id} style={styles.financialRow}>
                    <View style={styles.copy}>
                      <Text style={styles.cardTitle}>
                        {formatMoney(advance.originalAmountCents)} ·{' '}
                        {advance.paymentMethod === 'cash'
                          ? 'Efectivo'
                          : advance.paymentMethod === 'transfer'
                            ? 'Transferencia'
                            : 'Otro'}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {new Date(advance.occurredAt).toLocaleDateString()} ·
                        Pendiente {formatMoney(advance.outstandingAmountCents)}
                      </Text>
                    </View>
                    <Text style={styles.statusText}>
                      {advance.status.replaceAll('_', ' ')}
                    </Text>
                  </View>
                ))}
                {!selectedAdvances.length ? (
                  <Text style={styles.cardDescription}>
                    No hay anticipos para este profesional.
                  </Text>
                ) : null}
                <Text style={styles.sectionTitle}>Liquidaciones</Text>
                {selectedSettlements.map((settlement) => (
                  <View key={settlement.id} style={styles.settlementCard}>
                    <View style={styles.financialRowHeader}>
                      <View style={styles.copy}>
                        <Text style={styles.cardTitle}>
                          {settlement.periodStart} → {settlement.periodEnd}
                        </Text>
                        <Text style={styles.cardDescription}>
                          Comisión{' '}
                          {formatMoney(settlement.commissionAmountCents)}
                          {' · '}Anticipos -
                          {formatMoney(settlement.advanceDeductionCents)}
                        </Text>
                      </View>
                      <Text style={styles.settlementAmount}>
                        {formatMoney(settlement.totalPayableCents)}
                      </Text>
                    </View>
                    <Text style={styles.statusText}>
                      Estado: {settlement.status}
                    </Text>
                    {canManageCommissions && settlement.status === 'draft' ? (
                      <View style={styles.rowButtons}>
                        <Pressable
                          onPress={() =>
                            settlementAction.mutate({
                              action: 'cancel',
                              id: settlement.id,
                            })
                          }
                        >
                          <Text style={styles.dangerText}>Cancelar</Text>
                        </Pressable>
                        {canApproveCommissions ? (
                          <Pressable
                            onPress={() =>
                              settlementAction.mutate({
                                action: 'approve',
                                id: settlement.id,
                              })
                            }
                          >
                            <Text style={styles.linkText}>Aprobar</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                    {canApproveCommissions &&
                    settlement.status === 'approved' ? (
                      <Pressable
                        onPress={() =>
                          settlementAction.mutate({
                            action: 'pay',
                            id: settlement.id,
                          })
                        }
                      >
                        <Text style={styles.linkText}>Pagar en efectivo</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {!selectedSettlements.length ? (
                  <Text style={styles.cardDescription}>
                    Aún no existen liquidaciones.
                  </Text>
                ) : null}
              </>
            ) : !commissionsQuery.isLoading ? (
              <Text style={styles.cardDescription}>
                No hay profesionales activos con comisiones.
              </Text>
            ) : null}
          </View>
        ) : null}
        {tab === 'settings' ? (
          <View style={styles.card}>
            <View style={styles.icon}>
              <Ionicons color={appTheme.colors.accentDark} name="card-outline" size={25} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.cardTitle}>PayPhone</Text>
              <Text style={styles.cardDescription}>
                No configurado. Conecta tu cuenta PayPhone Business desde
                Configuración.
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Próximamente</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <Modal
        animationType="slide"
        onRequestClose={() => setSheetMode(null)}
        transparent
        visible={sheetMode !== null}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Cerrar formulario"
            onPress={() => setSheetMode(null)}
            style={styles.modalBackdrop}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {sheetMode === 'advance'
                ? 'Registrar anticipo'
                : 'Crear liquidación'}
            </Text>
            <Text style={styles.sheetCopy}>
              {effectiveProfessional?.name ?? 'Selecciona un profesional'}
            </Text>
            {sheetMode === 'advance' ? (
              <>
                <Text style={styles.inputLabel}>Monto</Text>
                <TextInput
                  accessibilityLabel="Monto del anticipo"
                  keyboardType="decimal-pad"
                  onChangeText={setAmount}
                  placeholder="0.00"
                  style={styles.input}
                  value={amount}
                />
                <Text style={styles.inputLabel}>Método de entrega</Text>
                <View style={styles.methodRow}>
                  {(
                    [
                      ['cash', 'Efectivo'],
                      ['transfer', 'Transferencia'],
                      ['other', 'Otro'],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      key={value}
                      onPress={() => setPaymentMethod(value)}
                      style={[
                        styles.method,
                        paymentMethod === value && styles.methodActive,
                      ]}
                    >
                      <Text
                        style={
                          paymentMethod === value
                            ? styles.methodTextActive
                            : styles.methodText
                        }
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.inputLabel}>Referencia opcional</Text>
                <TextInput
                  accessibilityLabel="Referencia del anticipo"
                  onChangeText={setReference}
                  style={styles.input}
                  value={reference}
                />
              </>
            ) : (
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.inputLabel}>Desde</Text>
                  <TextInput
                    accessibilityLabel="Inicio del período"
                    onChangeText={setPeriodStart}
                    placeholder="AAAA-MM-DD"
                    style={styles.input}
                    value={periodStart}
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.inputLabel}>Hasta</Text>
                  <TextInput
                    accessibilityLabel="Fin del período"
                    onChangeText={setPeriodEnd}
                    placeholder="AAAA-MM-DD"
                    style={styles.input}
                    value={periodEnd}
                  />
                </View>
              </View>
            )}
            <Text style={styles.inputLabel}>Nota opcional</Text>
            <TextInput
              accessibilityLabel="Nota"
              multiline
              onChangeText={setNotes}
              style={[styles.input, styles.notesInput]}
              value={notes}
            />
            {sheetMode === 'advance' ? (
              <Text style={styles.warningCopy}>
                Este valor se descontará de futuras liquidaciones.
              </Text>
            ) : null}
            <Pressable
              disabled={createAdvance.isPending || createSettlement.isPending}
              onPress={() =>
                sheetMode === 'advance'
                  ? createAdvance.mutate()
                  : createSettlement.mutate()
              }
              style={styles.confirmButton}
            >
              <Text style={styles.confirmButtonText}>
                {createAdvance.isPending || createSettlement.isPending
                  ? 'Guardando...'
                  : 'Confirmar'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: 10 },
  screen: appStyles.screen,
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 20 },
  back: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: { color: appTheme.colors.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 2 },
  content: { gap: 14, padding: 20 },
  history: { gap: 8 },
  historyCaption: { color: appTheme.colors.textMuted, fontSize: 11, marginTop: 2 },
  historyAmount: { color: appTheme.colors.text, fontSize: 14, fontWeight: '900' },
  historyRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    padding: 14,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  historyValue: { alignItems: 'flex-end' },
  metric: { color: appTheme.colors.textMuted, fontSize: 12, fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  balance: { backgroundColor: appTheme.colors.surface, borderRadius: 24, padding: 22, transform: [{ translateY: -3 }], ...goldButtonShadow },
  balanceLabel: { color: appTheme.colors.textMuted, fontSize: 14 },
  balanceValue: {
    color: appTheme.colors.text,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 8,
  },
  balanceCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  commissionBalance: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    padding: 18,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  commissionMetric: { color: appTheme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  commissionMetrics: { flexDirection: 'row', gap: 16, marginTop: 10 },
  commissionSection: { gap: 12 },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    marginTop: 8,
    padding: 15,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  confirmButtonText: { color: appTheme.colors.accentDark, fontSize: 15, fontWeight: '900' },
  dangerText: { color: appTheme.colors.danger, fontSize: 13, fontWeight: '900' },
  dateField: { flex: 1 },
  dateRow: { flexDirection: 'row', gap: 10 },
  financialRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    padding: 14,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  financialRowHeader: { alignItems: 'center', flexDirection: 'row' },
  input: {
    borderColor: appTheme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: appTheme.colors.text,
    padding: 12,
  },
  inputLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 8,
  },
  linkText: { color: appTheme.colors.accent, fontSize: 13, fontWeight: '900' },
  method: {
    borderColor: appTheme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  methodActive: { backgroundColor: appTheme.colors.accentWash, borderColor: appTheme.colors.accentWash },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodText: { color: appTheme.colors.textMuted, fontSize: 12, fontWeight: '800' },
  methodTextActive: { color: appTheme.colors.text, fontSize: 12, fontWeight: '900' },
  modalBackdrop: { flex: 1 },
  modalRoot: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    flex: 1,
    padding: 13,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  primaryActionText: { color: appTheme.colors.accentDark, fontSize: 12, fontWeight: '900' },
  professionalChip: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  professionalChipActive: { backgroundColor: appTheme.colors.accentWash },
  professionalChipText: { color: appTheme.colors.textMuted, fontSize: 12, fontWeight: '800' },
  professionalChipTextActive: { color: appTheme.colors.text },
  professionalFilters: { gap: 8 },
  rowButtons: {
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'flex-end',
  },
  secondaryAction: {
    backgroundColor: appTheme.colors.surface,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    padding: 13,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  secondaryActionText: { color: appTheme.colors.accentDark, fontSize: 12, fontWeight: '900' },
  sectionTitle: { color: appTheme.colors.text, fontSize: 16, fontWeight: '900' },
  settlementAmount: { color: appTheme.colors.text, fontSize: 18, fontWeight: '900' },
  settlementCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 16,
    gap: 9,
    padding: 14,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  sheet: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 8,
    padding: 22,
    paddingBottom: 30,
  },
  sheetCopy: { color: appTheme.colors.textMuted, fontSize: 13 },
  sheetTitle: { color: appTheme.colors.text, fontSize: 22, fontWeight: '900' },
  statusText: { color: appTheme.colors.textMuted, fontSize: 11, textTransform: 'capitalize' },
  warningCopy: { color: appTheme.colors.accentDark, fontSize: 12, lineHeight: 17 },
  tabs: {
    borderBottomColor: appTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 25,
    paddingVertical: 12,
  },
  tab: { color: appTheme.colors.textMuted, fontSize: 14, fontWeight: '800' },
  tabActive: { color: appTheme.colors.text, fontSize: 14, fontWeight: '900' },
  card: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 19,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 17,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  copy: { flex: 1 },
  cardTitle: { color: appTheme.colors.text, fontSize: 16, fontWeight: '900' },
  cardDescription: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  badge: {
    backgroundColor: appTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeText: { color: appTheme.colors.textMuted, fontSize: 10, fontWeight: '900' },
});
