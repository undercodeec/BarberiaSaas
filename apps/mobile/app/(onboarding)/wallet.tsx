import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CashRegisterHistoryResponse,
  CashRegisterSummaryResponse,
  CommissionOverviewResponse,
  CurrentOrganizationResponse,
  PayphoneConfigurationResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
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
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { requireApiClient } from '../../src/lib/api';
import { settlementPeriodForTimeZone } from '../../src/lib/calendar-date';
import { useAuth } from '../../src/providers/AuthProvider';

export default function WalletScreen() {
  const router = useRouter();
  const layout = useNativeLayoutMetrics();
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
  const [payphoneSheetOpen, setPayphoneSheetOpen] = useState(false);
  const [payphoneStoreId, setPayphoneStoreId] = useState('');
  const [payphoneToken, setPayphoneToken] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'other' | 'transfer'
  >('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [initialPeriod] = useState(() =>
    settlementPeriodForTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/Guayaquil',
    ),
  );
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
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
  const payphoneQuery = useQuery({
    enabled: Boolean(session) && tab === 'settings',
    queryFn: () =>
      requireApiClient().request<PayphoneConfigurationResponse>(
        '/v1/payphone/configuration',
      ),
    queryKey: ['payphone-configuration'],
  });
  const refreshPayphone = () =>
    queryClient.invalidateQueries({ queryKey: ['payphone-configuration'] });
  const closePayphoneSheet = () => {
    setPayphoneSheetOpen(false);
    setPayphoneStoreId('');
    setPayphoneToken('');
  };
  const savePayphone = useMutation({
    mutationFn: () =>
      requireApiClient().request<PayphoneConfigurationResponse>(
        '/v1/payphone/configuration',
        {
          body: {
            storeId: payphoneStoreId.trim(),
            token: payphoneToken.trim(),
          },
          method: 'POST',
        },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar PayPhone',
        error instanceof Error ? error.message : 'Intentalo nuevamente.',
      ),
    onSuccess: async () => {
      setPayphoneToken('');
      await refreshPayphone();
      Alert.alert(
        'Credenciales guardadas',
        'Ahora prueba la conexion antes de activarla.',
      );
    },
  });
  const testPayphone = useMutation({
    mutationFn: () =>
      requireApiClient().request<PayphoneConfigurationResponse>(
        '/v1/payphone/configuration/test',
        { method: 'POST' },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos conectar PayPhone',
        error instanceof Error ? error.message : 'Intentalo nuevamente.',
      ),
    onSuccess: async () => {
      await refreshPayphone();
      Alert.alert(
        'Conexion verificada',
        'Ya puedes activar PayPhone para este negocio.',
      );
    },
  });
  const setPayphoneEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      requireApiClient().request<PayphoneConfigurationResponse>(
        '/v1/payphone/configuration',
        { body: { enabled }, method: 'PATCH' },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos actualizar PayPhone',
        error instanceof Error ? error.message : 'Intentalo nuevamente.',
      ),
    onSuccess: refreshPayphone,
  });
  const disconnectPayphone = useMutation({
    mutationFn: () =>
      requireApiClient().request<void>('/v1/payphone/configuration', {
        method: 'DELETE',
      }),
    onError: (error) =>
      Alert.alert(
        'No pudimos desconectar PayPhone',
        error instanceof Error ? error.message : 'Intentalo nuevamente.',
      ),
    onSuccess: async () => {
      closePayphoneSheet();
      await refreshPayphone();
    },
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
  const selectedEntries = (commissionsQuery.data?.entries ?? []).filter(
    (entry) => entry.professionalMembershipId === effectiveProfessional?.id,
  );
  const refreshCommissions = () =>
    queryClient.invalidateQueries({ queryKey: ['commission-overview'] });
  const openSettlementSheet = () => {
    const timeZone =
      organizationQuery.data?.location?.timezone ??
      organizationQuery.data?.organization.defaultTimezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      'America/Guayaquil';
    const period = settlementPeriodForTimeZone(timeZone);
    setPeriodStart(period.periodStart);
    setPeriodEnd(period.periodEnd);
    setSheetMode('settlement');
  };
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
  const reverseCommission = useMutation({
    mutationFn: (id: string) =>
      requireApiClient().request(`/v1/commissions/entries/${id}/reverse`, {
        body: { reason: 'Anulación o devolución registrada desde Nava Wallet' },
        method: 'POST',
      }),
    onError: (error) =>
      Alert.alert(
        'No pudimos revertir la comisión',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: () => refreshCommissions(),
  });
  const confirmCommissionReversal = (id: string) =>
    Alert.alert(
      'Revertir comisión',
      'Se creará un ajuste compensatorio auditable. La entrada original conservará su historial.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          onPress: () => reverseCommission.mutate(id),
          style: 'destructive',
          text: 'Registrar reverso',
        },
      ],
    );
  const totals = summaryQuery.data?.totals;
  const formatMoney = (amountCents: number) =>
    `$${(amountCents / 100).toFixed(2)}`;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/dashboard')
          }
          style={styles.back}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="chevron-back"
            size={24}
          />
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
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name="cash-outline"
                  size={25}
                />
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>Caja física</Text>
                <Text style={styles.cardDescription}>
                  Abre caja, registra ventas, gastos, retiros y realiza el
                  cierre.
                </Text>
              </View>
              <Ionicons
                color={appTheme.colors.accentDark}
                name="chevron-forward"
                size={22}
              />
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
                      onPress={openSettlementSheet}
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
                <Text style={styles.sectionTitle}>Movimientos de comisión</Text>
                {selectedEntries.map((entry) => (
                  <View key={entry.id} style={styles.financialRow}>
                    <View style={styles.copy}>
                      <Text style={styles.cardTitle}>
                        {entry.reversalOfEntryId ? 'Reverso' : 'Comisión'} ·{' '}
                        {formatMoney(entry.amountCents)}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {new Date(entry.occurredAt).toLocaleDateString()} ·{' '}
                        {entry.status.replaceAll('_', ' ')}
                      </Text>
                    </View>
                    {canManageCommissions &&
                    !entry.reversalOfEntryId &&
                    entry.status !== 'reversed' ? (
                      <Pressable
                        accessibilityLabel="Revertir comisión"
                        disabled={reverseCommission.isPending}
                        onPress={() => confirmCommissionReversal(entry.id)}
                      >
                        <Text style={styles.dangerText}>Revertir</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {!selectedEntries.length ? (
                  <Text style={styles.cardDescription}>
                    Aún no existen movimientos de comisión.
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
          <View style={styles.payphoneCard}>
            <View style={styles.icon}>
              <Ionicons
                color={appTheme.colors.accentDark}
                name="card-outline"
                size={25}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.cardTitle}>PayPhone</Text>
              <Text style={styles.cardDescription}>
                {payphoneQuery.data?.configuration
                  ? `${payphoneQuery.data.configuration.isEnabled ? 'Activo' : 'Configurado sin activar'} · ${payphoneQuery.data.configuration.storeIdHint}`
                  : 'Conecta la cuenta PayPhone Business de este negocio.'}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {payphoneQuery.data?.configuration?.status === 'connected'
                  ? 'Conectado'
                  : payphoneQuery.data?.configuration?.status === 'error'
                    ? 'Error'
                    : 'Pendiente'}
              </Text>
            </View>
            {role === 'owner' ? (
              <Pressable
                accessibilityLabel="Configurar PayPhone"
                onPress={() => {
                  setPayphoneStoreId('');
                  setPayphoneToken('');
                  setPayphoneSheetOpen(true);
                }}
                style={styles.payphoneAction}
              >
                <Text style={styles.primaryActionText}>Configurar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={closePayphoneSheet}
        statusBarTranslucent
        transparent
        visible={payphoneSheetOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Cerrar configuracion PayPhone"
            onPress={closePayphoneSheet}
            style={styles.modalBackdrop}
          />
          <ScrollView
            contentContainerStyle={[
              styles.payphoneSheet,
              { paddingBottom: layout.bottomInset + 20 },
            ]}
            keyboardShouldPersistTaps="handled"
            style={[
              styles.sheetViewport,
              { maxHeight: layout.sheetMaxHeight },
            ]}
          >
            <Text style={styles.sheetTitle}>Configurar PayPhone</Text>
            <Text style={styles.sheetCopy}>
              Ingresa las credenciales de PayPhone Business de este negocio. El
              Token se cifra en el servidor y nunca se mostrara nuevamente.
            </Text>
            <View style={styles.payphoneGuide}>
              <Text style={styles.payphoneGuideTitle}>
                Como obtener tu Token y StoreID
              </Text>
              <Text style={styles.payphoneGuideStep}>
                1. Ingresa a PayPhone Business con una cuenta administradora y
                crea un usuario con rol Desarrollador.
              </Text>
              <Text style={styles.payphoneGuideStep}>
                2. Ingresa a PayPhone Developer con ese usuario y pulsa Agregar
                para crear una aplicacion.
              </Text>
              <Text style={styles.payphoneGuideStep}>
                3. Selecciona tipo de aplicacion API, completa los datos y
                guarda. PayPhone determina el ambiente con esas credenciales.
              </Text>
              <Text style={styles.payphoneGuideStep}>
                4. Abre Credenciales, copia solamente Token y StoreID, y pegalos
                abajo. No compartas el Token con nadie.
              </Text>
              <Pressable
                accessibilityLabel="Ver video de configuracion de PayPhone"
                onPress={() =>
                  void Linking.openURL(
                    'https://www.youtube.com/watch?v=Y7KCMq91QPk&list=PL5vPkGVDdQxRw-tRc5gocIEj9E2iv6fts&index=2',
                  )
                }
              >
                <Text style={styles.linkText}>
                  Ver video guia — mira solo del minuto 1:00 al 4:00
                </Text>
              </Pressable>
              <Text style={styles.payphoneGuideNote}>
                El resto del video no es necesario para Nava: solo necesitas los
                campos Token y StoreID. Nava genera el enlace de cobro, pero
                PayPhone no comunica automáticamente el resultado. Verifica la
                transacción en PayPhone Business antes de registrarla como
                pagada.
              </Text>
            </View>
            <Text style={styles.inputLabel}>Ambiente</Text>

            <Text style={styles.inputLabel}>StoreID</Text>
            <TextInput
              autoCapitalize="none"
              editable={!savePayphone.isPending}
              onChangeText={setPayphoneStoreId}
              placeholder="StoreID de PayPhone"
              placeholderTextColor={appTheme.colors.textMuted}
              style={styles.input}
              value={payphoneStoreId}
            />
            <Text style={styles.inputLabel}>Token</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!savePayphone.isPending}
              onChangeText={setPayphoneToken}
              placeholder={
                payphoneQuery.data?.configuration
                  ? 'Nuevo Token para rotarlo'
                  : 'Token de PayPhone'
              }
              placeholderTextColor={appTheme.colors.textMuted}
              secureTextEntry
              style={styles.input}
              value={payphoneToken}
            />
            <Pressable
              disabled={
                !payphoneStoreId.trim() ||
                !payphoneToken.trim() ||
                savePayphone.isPending ||
                !payphoneQuery.data?.encryptionConfigured
              }
              onPress={() => savePayphone.mutate()}
              style={styles.confirmButton}
            >
              <Text style={styles.confirmButtonText}>
                {savePayphone.isPending
                  ? 'Guardando...'
                  : 'Guardar credenciales'}
              </Text>
            </Pressable>
            {payphoneQuery.data?.configuration ? (
              <>
                <Pressable
                  disabled={testPayphone.isPending}
                  onPress={() => testPayphone.mutate()}
                  style={styles.secondaryAction}
                >
                  <Text style={styles.secondaryActionText}>
                    {testPayphone.isPending ? 'Probando...' : 'Probar conexion'}
                  </Text>
                </Pressable>
                {payphoneQuery.data.configuration.status === 'connected' ? (
                  <Pressable
                    disabled={setPayphoneEnabled.isPending}
                    onPress={() =>
                      setPayphoneEnabled.mutate(
                        !payphoneQuery.data?.configuration?.isEnabled,
                      )
                    }
                    style={styles.confirmButton}
                  >
                    <Text style={styles.confirmButtonText}>
                      {payphoneQuery.data.configuration.isEnabled
                        ? 'Desactivar PayPhone'
                        : 'Activar PayPhone'}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  disabled={disconnectPayphone.isPending}
                  onPress={() =>
                    Alert.alert(
                      'Desconectar PayPhone',
                      'Se eliminara el Token cifrado de este negocio.',
                      [
                        { style: 'cancel', text: 'Cancelar' },
                        {
                          onPress: () => disconnectPayphone.mutate(),
                          style: 'destructive',
                          text: 'Desconectar',
                        },
                      ],
                    )
                  }
                  style={styles.dangerButton}
                >
                  <Text style={styles.dangerText}>Desconectar PayPhone</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={() => setSheetMode(null)}
        statusBarTranslucent
        transparent
        visible={sheetMode !== null}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Cerrar formulario"
            onPress={() => setSheetMode(null)}
            style={styles.modalBackdrop}
          />
          <ScrollView
            contentContainerStyle={[
              styles.sheet,
              { paddingBottom: layout.bottomInset + 18 },
            ]}
            keyboardShouldPersistTaps="handled"
            style={[
              styles.sheetViewport,
              { maxHeight: layout.sheetMaxHeight },
            ]}
          >
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
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
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
  historyCaption: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  historyAmount: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
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
  balance: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 24,
    padding: 22,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
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
  commissionMetric: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
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
  confirmButtonText: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  dangerText: {
    color: appTheme.colors.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  dangerButton: { alignItems: 'center', padding: 12 },
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
  methodActive: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentWash,
  },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  methodTextActive: {
    color: appTheme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  modalBackdrop: { flex: 1 },
  modalRoot: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1 },
  modalKeyboard: { flex: 1 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  payphoneAction: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  payphoneCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 19,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  payphoneGuide: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
    padding: 14,
  },
  payphoneGuideNote: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  payphoneGuideStep: {
    color: appTheme.colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  payphoneGuideTitle: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  payphoneSheet: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 8,
    marginTop: 'auto',
    padding: 22,
    paddingBottom: 36,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    flex: 1,
    padding: 13,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  primaryActionText: {
    color: appTheme.colors.accentDark,
    fontSize: 12,
    fontWeight: '900',
  },
  professionalChip: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  professionalChipActive: { backgroundColor: appTheme.colors.accentWash },
  professionalChipText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
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
  secondaryActionText: {
    color: appTheme.colors.accentDark,
    fontSize: 12,
    fontWeight: '900',
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  settlementAmount: {
    color: appTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
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
  sheetViewport: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 'auto',
  },
  sheetCopy: { color: appTheme.colors.textMuted, fontSize: 13 },
  sheetTitle: { color: appTheme.colors.text, fontSize: 22, fontWeight: '900' },
  statusText: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  warningCopy: {
    color: appTheme.colors.accentDark,
    fontSize: 12,
    lineHeight: 17,
  },
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
  badgeText: {
    color: appTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
});
