import { styles } from '../../src/features/screens/wallet.styles';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CashRegisterHistoryResponse,
  CashRegisterSummaryResponse,
  CommissionOverviewResponse,
  PayphoneConfigurationResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appTheme,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { AgendaCalendarModal } from '../../src/features/screens/agenda-components';
import { calendarGrid } from '../../src/features/screens/agenda-model';
import { localCalendarDate } from '../../src/lib/agenda-range';
import { requireApiClient } from '../../src/lib/api';
import { settlementPeriodForTimeZone } from '../../src/lib/calendar-date';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { walletAccessForRole } from '../../src/lib/wallet-access';
import { splitCommissionEntries } from '../../src/lib/wallet-commission-records';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

// PayPhone se habilitará en una futura versión. Conservamos el flujo para
// reactivarlo sin exponer configuración ni cobros antes de su lanzamiento.
const PAYPHONE_FEATURE_ENABLED = false;

type WalletCalendarTarget =
  | 'filter-end'
  | 'filter-start'
  | 'history-date'
  | 'period-end'
  | 'period-start';

type WalletTab =
  'commissions' | 'former-professionals' | 'history' | 'settings' | 'summary';

function dateForCalendar(value: string) {
  const [year = 2000, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateDaysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return localCalendarDate(value);
}

function isWithinDateRange(value: string, start: string, end: string) {
  const date = value.slice(0, 10);
  return date >= start && date <= end;
}

function calendarDateInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function commissionConcept(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return 'Venta registrada';
  const record = snapshot as {
    originalSnapshot?: unknown;
    productName?: unknown;
    serviceName?: unknown;
  };
  if (typeof record.serviceName === 'string' && record.serviceName.trim())
    return record.serviceName;
  if (typeof record.productName === 'string' && record.productName.trim())
    return record.productName;
  if (record.originalSnapshot)
    return commissionConcept(record.originalSnapshot);
  return 'Venta registrada';
}

function advanceDetail(
  notes: string | null,
  reference: string | null,
): string | null {
  const values = [notes, reference ? `Referencia: ${reference}` : null].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return values.length ? values.join(' · ') : null;
}

export default function WalletScreen() {
  const router = useRouter();
  const layout = useNativeLayoutMetrics();
  const searchParams = useLocalSearchParams<{ tab?: string | string[] }>();
  const { session } = useAuth();
  const tenant = useTenantScope();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WalletTab>(() => {
    const requestedTab = Array.isArray(searchParams.tab)
      ? searchParams.tab[0]
      : searchParams.tab;
    return requestedTab === 'commissions' ||
      requestedTab === 'former-professionals' ||
      requestedTab === 'history' ||
      (PAYPHONE_FEATURE_ENABLED && requestedTab === 'settings')
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
  const [movementDateStart, setMovementDateStart] = useState(() =>
    dateDaysAgo(29),
  );
  const [movementDateEnd, setMovementDateEnd] = useState(() => dateDaysAgo(0));
  const [historyDate, setHistoryDate] = useState(() => dateDaysAgo(0));
  const [selectedFormerProfessionalId, setSelectedFormerProfessionalId] =
    useState<string | null>(null);
  const [calendarTarget, setCalendarTarget] =
    useState<WalletCalendarTarget | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [chartMetric, setChartMetric] = useState<'base' | 'commission'>(
    'commission',
  );
  const organizationQuery = useCurrentOrganization();
  const role = organizationQuery.data?.membership?.role;
  const walletAccess = walletAccessForRole(role);
  const canManageCommissions = role === 'owner' || role === 'manager';
  const hasKnownRole = role !== null && role !== undefined;
  const shouldLoadCommissions =
    tab === 'commissions' ||
    (walletAccess.summarySource === 'commissions' && tab === 'summary') ||
    (walletAccess.historySource === 'commissions' && tab === 'history') ||
    (canManageCommissions &&
      (tab === 'history' || tab === 'former-professionals'));
  const summaryQuery = useQuery({
    enabled: Boolean(session) && hasKnownRole && walletAccess.canReadCash,
    queryFn: () =>
      requireApiClient().request<CashRegisterSummaryResponse>(
        '/v1/cash-register/summary',
      ),
    queryKey: tenant.key('cash-register-summary'),
  });
  const historyQuery = useQuery({
    enabled:
      Boolean(session) &&
      hasKnownRole &&
      tab === 'history' &&
      walletAccess.canReadCash,
    queryFn: () =>
      requireApiClient().request<CashRegisterHistoryResponse>(
        `/v1/cash-register/history?date=${encodeURIComponent(historyDate)}`,
      ),
    queryKey: tenant.key('cash-register-history', historyDate),
  });
  const commissionsQuery = useQuery({
    enabled: Boolean(session) && hasKnownRole && shouldLoadCommissions,
    queryFn: () =>
      requireApiClient().request<CommissionOverviewResponse>(
        tab === 'history' || tab === 'former-professionals'
          ? `/v1/commissions/overview?periodStart=${historyDate}&periodEnd=${historyDate}`
          : '/v1/commissions/overview',
      ),
    queryKey: tenant.key(
      'commission-overview',
      tab === 'history' || tab === 'former-professionals' ? historyDate : 'all',
    ),
  });
  const payphoneQuery = useQuery({
    enabled: PAYPHONE_FEATURE_ENABLED && Boolean(session) && tab === 'settings',
    queryFn: () =>
      requireApiClient().request<PayphoneConfigurationResponse>(
        '/v1/payphone/configuration',
      ),
    queryKey: tenant.key('payphone-configuration'),
  });
  const refreshPayphone = () =>
    queryClient.invalidateQueries({
      queryKey: tenantQueryPrefix('payphone-configuration'),
    });
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
  const canApproveCommissions = role === 'owner';
  const cashHistoryTimeZone =
    organizationQuery.data?.location?.timezone ??
    organizationQuery.data?.organization.defaultTimezone ??
    'America/Guayaquil';
  // La API ya filtra por la fecha civil de la sucursal. Esta comprobación evita
  // que una respuesta conservada durante un cambio de fecha llegue a mostrarse
  // como si perteneciera al nuevo día seleccionado.
  const historySessions = useMemo(
    () =>
      (historyQuery.data?.sessions ?? []).filter((session) => {
        const closedAt = session.closedAt;
        return (
          typeof closedAt === 'string' &&
          calendarDateInTimeZone(closedAt, cashHistoryTimeZone) === historyDate
        );
      }),
    [cashHistoryTimeZone, historyDate, historyQuery.data?.sessions],
  );
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
  const formerProfessionals = commissionsQuery.data?.formerProfessionals ?? [];
  const effectiveFormerProfessional =
    formerProfessionals.find(
      (professional) => professional.id === selectedFormerProfessionalId,
    ) ?? formerProfessionals[0];
  const formerEntries = (commissionsQuery.data?.entries ?? []).filter(
    (entry) =>
      entry.professionalMembershipId === effectiveFormerProfessional?.id,
  );
  const formerAdvances = (commissionsQuery.data?.advances ?? []).filter(
    (advance) =>
      advance.professionalMembershipId === effectiveFormerProfessional?.id,
  );
  const formerSettlements = (commissionsQuery.data?.settlements ?? []).filter(
    (settlement) =>
      settlement.professionalMembershipId === effectiveFormerProfessional?.id,
  );
  const commissionEntries = splitCommissionEntries(selectedEntries);
  const commissionEntriesForTab = canManageCommissions
    ? selectedEntries
    : commissionEntries.current;
  const barberMovementEntries = useMemo(
    () =>
      commissionEntries.current
        .filter((entry) =>
          isWithinDateRange(
            entry.occurredAt,
            movementDateStart,
            movementDateEnd,
          ),
        )
        .sort(
          (left, right) =>
            Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
        ),
    [commissionEntries.current, movementDateEnd, movementDateStart],
  );
  const barberAdvances = useMemo(
    () =>
      selectedAdvances
        .filter((advance) =>
          isWithinDateRange(
            advance.occurredAt,
            movementDateStart,
            movementDateEnd,
          ),
        )
        .sort(
          (left, right) =>
            Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
        ),
    [movementDateEnd, movementDateStart, selectedAdvances],
  );
  const barberSettlements = useMemo(
    () =>
      selectedSettlements
        .filter(
          (settlement) =>
            settlement.periodEnd >= movementDateStart &&
            settlement.periodStart <= movementDateEnd,
        )
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt),
        ),
    [movementDateEnd, movementDateStart, selectedSettlements],
  );
  const chartData = useMemo(() => {
    const buckets = new Map<string, { base: number; commission: number }>();
    for (const entry of barberMovementEntries) {
      const key = entry.occurredAt.slice(0, 10);
      const current = buckets.get(key) ?? { base: 0, commission: 0 };
      buckets.set(key, {
        base: current.base + entry.baseAmountCents,
        commission: current.commission + entry.amountCents,
      });
    }
    return [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-7)
      .map(([date, amounts]) => ({
        date,
        value: amounts[chartMetric],
      }));
  }, [barberMovementEntries, chartMetric]);
  const chartMaximum = Math.max(...chartData.map((item) => item.value), 1);
  const refreshCommissions = () =>
    queryClient.invalidateQueries({
      queryKey: tenantQueryPrefix('commission-overview'),
    });
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
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('cash-register-summary'),
        }),
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
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('cash-register-summary'),
        }),
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
  const netEstimatedCents = Math.max(
    0,
    (effectiveProfessional?.commissionPendingCents ?? 0) -
      (effectiveProfessional?.availableAdvanceCents ?? 0),
  );
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
          <Text style={styles.subtitle}>
            {walletAccess.canReadCash
              ? 'Pagos y caja de tu actividad'
              : 'Tus comisiones y liquidaciones'}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>
            {walletAccess.summarySource === 'cash'
              ? 'Resumen de hoy'
              : 'Neto estimado'}
          </Text>
          <Text style={styles.balanceValue}>
            {formatMoney(
              walletAccess.summarySource === 'cash'
                ? (totals?.sales ?? 0)
                : netEstimatedCents,
            )}
          </Text>
          <Text style={styles.balanceCopy}>
            {walletAccess.summarySource === 'cash'
              ? totals
                ? `${formatMoney(totals.cash)} en efectivo esperado hoy.`
                : 'Abre tu caja para comenzar a registrar movimientos.'
              : 'Disponible según tus cobros registrados, sin depender del cierre de caja.'}
          </Text>
        </View>
        <View style={styles.tabs}>
          {(
            [
              ['summary', 'Resumen'],
              ['history', 'Historial'],
              ['commissions', 'Comisiones'],
              ...(canManageCommissions
                ? [['former-professionals', 'Equipo anterior']]
                : []),
            ] as const
          ).map(([value, label]) => (
            <Pressable key={value} onPress={() => setTab(value as WalletTab)}>
              <Text style={tab === value ? styles.tabActive : styles.tab}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'summary' ? (
          walletAccess.summarySource === 'cash' ? (
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
          ) : (
            <View style={styles.barberSummary}>
              <View style={styles.metrics}>
                <Text style={styles.metric}>
                  Comisiones{' '}
                  {formatMoney(
                    effectiveProfessional?.commissionPendingCents ?? 0,
                  )}
                </Text>
                <Text style={styles.metric}>
                  Anticipos -
                  {formatMoney(
                    effectiveProfessional?.outstandingAdvanceCents ?? 0,
                  )}
                </Text>
              </View>
              <Text style={styles.sectionTitle}>Actividad de comisiones</Text>
              <View style={styles.dateRow}>
                <Pressable
                  accessibilityLabel="Filtrar movimientos desde"
                  onPress={() => {
                    setCalendarMonth(dateForCalendar(movementDateStart));
                    setCalendarTarget('filter-start');
                  }}
                  style={styles.calendarField}
                >
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name="calendar-outline"
                    size={18}
                  />
                  <View>
                    <Text style={styles.inputLabel}>Desde</Text>
                    <Text style={styles.calendarFieldValue}>
                      {movementDateStart}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel="Filtrar movimientos hasta"
                  onPress={() => {
                    setCalendarMonth(dateForCalendar(movementDateEnd));
                    setCalendarTarget('filter-end');
                  }}
                  style={styles.calendarField}
                >
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name="calendar-outline"
                    size={18}
                  />
                  <View>
                    <Text style={styles.inputLabel}>Hasta</Text>
                    <Text style={styles.calendarFieldValue}>
                      {movementDateEnd}
                    </Text>
                  </View>
                </Pressable>
              </View>
              <View style={styles.quickDateFilters}>
                {[
                  ['7 días', 6],
                  ['30 días', 29],
                  ['90 días', 89],
                ].map(([label, days]) => (
                  <Pressable
                    key={label}
                    onPress={() => {
                      setMovementDateStart(dateDaysAgo(days as number));
                      setMovementDateEnd(dateDaysAgo(0));
                    }}
                    style={styles.dateChip}
                  >
                    <Text style={styles.dateChipText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.cardTitle}>Tendencia</Text>
                    <Text style={styles.cardDescription}>
                      Toca una métrica para actualizar la gráfica.
                    </Text>
                  </View>
                  <View style={styles.chartToggle}>
                    {(
                      [
                        ['commission', 'Comisión'],
                        ['base', 'Ventas'],
                      ] as const
                    ).map(([value, label]) => (
                      <Pressable
                        key={value}
                        onPress={() => setChartMetric(value)}
                        style={[
                          styles.chartToggleOption,
                          chartMetric === value &&
                            styles.chartToggleOptionActive,
                        ]}
                      >
                        <Text
                          style={
                            chartMetric === value
                              ? styles.chartToggleTextActive
                              : styles.chartToggleText
                          }
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {chartData.length ? (
                  <View style={styles.chartBars}>
                    {chartData.map((item) => (
                      <View key={item.date} style={styles.chartColumn}>
                        <Text style={styles.chartValue}>
                          {formatMoney(item.value)}
                        </Text>
                        <View style={styles.chartTrack}>
                          <View
                            style={[
                              styles.chartBar,
                              {
                                height: Math.max(
                                  8,
                                  Math.round((item.value / chartMaximum) * 88),
                                ),
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.chartLabel}>
                          {item.date.slice(8)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.cardDescription}>
                    No hay comisiones en el período elegido.
                  </Text>
                )}
              </View>
              <Text style={styles.sectionTitle}>Movimientos del período</Text>
              {barberMovementEntries.map((entry) => (
                <View key={entry.id} style={styles.financialRow}>
                  <View style={styles.copy}>
                    <Text style={styles.cardTitle}>
                      {entry.reversalOfEntryId
                        ? 'Reverso de comisión'
                        : 'Comisión'}
                    </Text>
                    <Text style={styles.cardDescription}>
                      {new Date(entry.occurredAt).toLocaleDateString('es-EC')} ·
                      Venta {formatMoney(entry.baseAmountCents)} ·{' '}
                      {entry.status.replaceAll('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.movementAmount}>
                    {formatMoney(entry.amountCents)}
                  </Text>
                </View>
              ))}
              {barberAdvances.map((advance) => (
                <View key={advance.id} style={styles.financialRow}>
                  <View style={styles.copy}>
                    <Text style={styles.cardTitle}>Anticipo recibido</Text>
                    <Text style={styles.cardDescription}>
                      {new Date(advance.occurredAt).toLocaleDateString('es-EC')}{' '}
                      · Pendiente {formatMoney(advance.outstandingAmountCents)}
                    </Text>
                  </View>
                  <Text style={styles.movementExpense}>
                    -{formatMoney(advance.originalAmountCents)}
                  </Text>
                </View>
              ))}
              {barberSettlements.map((settlement) => (
                <View key={settlement.id} style={styles.financialRow}>
                  <View style={styles.copy}>
                    <Text style={styles.cardTitle}>
                      Liquidación {settlement.status}
                    </Text>
                    <Text style={styles.cardDescription}>
                      {settlement.periodStart} → {settlement.periodEnd} ·
                      Anticipos -{formatMoney(settlement.advanceDeductionCents)}
                    </Text>
                  </View>
                  <Text style={styles.movementAmount}>
                    {formatMoney(settlement.totalPayableCents)}
                  </Text>
                </View>
              ))}
              {!barberMovementEntries.length &&
              !barberAdvances.length &&
              !barberSettlements.length ? (
                <Text style={styles.cardDescription}>
                  No hay movimientos para las fechas seleccionadas.
                </Text>
              ) : null}
            </View>
          )
        ) : null}
        {tab === 'history' ? (
          <>
            {walletAccess.historySource === 'cash' ? (
              <View style={styles.history}>
                <Text style={styles.sectionTitle}>Historial de caja</Text>
                <Text style={styles.cardDescription}>
                  Consulta los cierres registrados en un dÃ­a especÃ­fico.
                </Text>
                <Pressable
                  accessibilityLabel="Seleccionar fecha del historial"
                  onPress={() => {
                    setCalendarMonth(dateForCalendar(historyDate));
                    setCalendarTarget('history-date');
                  }}
                  style={styles.calendarField}
                >
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name="calendar-outline"
                    size={18}
                  />
                  <View>
                    <Text style={styles.inputLabel}>Fecha</Text>
                    <Text style={styles.calendarFieldValue}>{historyDate}</Text>
                  </View>
                </Pressable>
                {historyQuery.isLoading ? (
                  <Text style={styles.cardDescription}>
                    Cargando historial...
                  </Text>
                ) : null}
                {historySessions.map((cashSession) => (
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
                        {new Date(
                          cashSession.closedAt ?? cashSession.openedAt,
                        ).toLocaleDateString()}
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
                    <Ionicons
                      color="#69717c"
                      name="chevron-forward"
                      size={20}
                    />
                  </Pressable>
                ))}
                {!historyQuery.isLoading && !historySessions.length ? (
                  <Text style={styles.cardDescription}>
                    Aún no hay cierres de caja.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.history}>
                <Text style={styles.cardDescription}>
                  Consulta los movimientos registrados en un día específico.
                </Text>
                <Pressable
                  accessibilityLabel="Seleccionar fecha del historial"
                  onPress={() => {
                    setCalendarMonth(dateForCalendar(historyDate));
                    setCalendarTarget('history-date');
                  }}
                  style={styles.calendarField}
                >
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name="calendar-outline"
                    size={18}
                  />
                  <View>
                    <Text style={styles.inputLabel}>Fecha</Text>
                    <Text style={styles.calendarFieldValue}>{historyDate}</Text>
                  </View>
                </Pressable>
                <Text style={styles.sectionTitle}>Movimientos de comisión</Text>
                {commissionEntries.historical.map((entry) => (
                  <View key={entry.id} style={styles.financialRow}>
                    <View style={styles.copy}>
                      <Text style={styles.cardTitle}>
                        {entry.reversalOfEntryId ? 'Reverso' : 'Comisión'} ·{' '}
                        {commissionConcept(entry.calculationSnapshot)}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {new Date(entry.occurredAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.movementAmount}>
                      {formatMoney(entry.amountCents)}
                    </Text>
                  </View>
                ))}
                {!commissionEntries.historical.length ? (
                  <Text style={styles.cardDescription}>
                    Aún no hay movimientos históricos de comisión.
                  </Text>
                ) : null}
                <Text style={styles.sectionTitle}>Anticipos</Text>
                {selectedAdvances.map((advance) => (
                  <View key={advance.id} style={styles.financialRow}>
                    <View style={styles.copy}>
                      <Text style={styles.cardTitle}>
                        {formatMoney(advance.originalAmountCents)}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {new Date(advance.occurredAt).toLocaleDateString()} ·
                        Pendiente {formatMoney(advance.outstandingAmountCents)}
                      </Text>
                      {advanceDetail(advance.notes, advance.reference) ? (
                        <Text style={styles.cardDescription}>
                          {advanceDetail(advance.notes, advance.reference)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.statusText}>
                      {advance.status.replaceAll('_', ' ')}
                    </Text>
                  </View>
                ))}
                {!selectedAdvances.length ? (
                  <Text style={styles.cardDescription}>
                    No hay anticipos registrados.
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
                          Comision{' '}
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
                  </View>
                ))}
                {!selectedSettlements.length ? (
                  <Text style={styles.cardDescription}>
                    Aun no existen liquidaciones.
                  </Text>
                ) : null}
              </View>
            )}
          </>
        ) : null}
        {tab === 'former-professionals' ? (
          <View style={styles.history}>
            <Text style={styles.sectionTitle}>Equipo anterior</Text>
            <Text style={styles.cardDescription}>
              Consulta los movimientos reales de colaboradores que ya no están
              activos en el equipo.
            </Text>
            <Pressable
              accessibilityLabel="Seleccionar fecha de movimientos anteriores"
              onPress={() => {
                setCalendarMonth(dateForCalendar(historyDate));
                setCalendarTarget('history-date');
              }}
              style={styles.calendarField}
            >
              <Ionicons
                color={appTheme.colors.accentDark}
                name="calendar-outline"
                size={18}
              />
              <View>
                <Text style={styles.inputLabel}>Fecha de movimientos</Text>
                <Text style={styles.calendarFieldValue}>{historyDate}</Text>
              </View>
            </Pressable>
            {commissionsQuery.isLoading ? (
              <Text style={styles.cardDescription}>
                Cargando equipo anterior...
              </Text>
            ) : null}
            {formerProfessionals.length ? (
              <ScrollView
                contentContainerStyle={styles.professionalFilters}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {formerProfessionals.map((professional) => {
                  const selected =
                    professional.id === effectiveFormerProfessional?.id;
                  return (
                    <Pressable
                      accessibilityLabel={`Ver movimientos de ${professional.name}`}
                      accessibilityRole="button"
                      key={professional.id}
                      onPress={() =>
                        setSelectedFormerProfessionalId(professional.id)
                      }
                      style={[
                        styles.professionalChip,
                        selected && styles.professionalChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.professionalChipText,
                          selected && styles.professionalChipTextActive,
                        ]}
                      >
                        {professional.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {effectiveFormerProfessional ? (
              <View style={styles.history}>
                <Text style={styles.cardTitle}>
                  {effectiveFormerProfessional.name}
                </Text>
                <Text style={styles.cardDescription}>
                  Fuera del equipo desde{' '}
                  {new Date(
                    effectiveFormerProfessional.departedAt,
                  ).toLocaleDateString('es-EC')}
                </Text>
                <Text style={styles.sectionTitle}>Comisiones</Text>
                {formerEntries.map((entry) => (
                  <View key={entry.id} style={styles.financialRow}>
                    <View style={styles.copy}>
                      <Text style={styles.cardTitle}>
                        {entry.reversalOfEntryId ? 'Reverso' : 'Comisión'} ·{' '}
                        {commissionConcept(entry.calculationSnapshot)}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {new Date(entry.occurredAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.movementAmount}>
                      {formatMoney(entry.amountCents)}
                    </Text>
                  </View>
                ))}
                {!formerEntries.length ? (
                  <Text style={styles.cardDescription}>
                    No hay comisiones para esta fecha.
                  </Text>
                ) : null}
                <Text style={styles.sectionTitle}>Anticipos</Text>
                {formerAdvances.map((advance) => (
                  <View key={advance.id} style={styles.financialRow}>
                    <View style={styles.copy}>
                      <Text style={styles.cardTitle}>
                        {formatMoney(advance.originalAmountCents)}
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
                {!formerAdvances.length ? (
                  <Text style={styles.cardDescription}>
                    No hay anticipos para esta fecha.
                  </Text>
                ) : null}
                <Text style={styles.sectionTitle}>Liquidaciones</Text>
                {formerSettlements.map((settlement) => (
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
                  </View>
                ))}
                {!formerSettlements.length ? (
                  <Text style={styles.cardDescription}>
                    No hay liquidaciones para esta fecha.
                  </Text>
                ) : null}
              </View>
            ) : !commissionsQuery.isLoading ? (
              <Text style={styles.cardDescription}>
                No hay colaboradores anteriores con movimientos para consultar.
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
            {canManageCommissions ? (
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
            ) : null}
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
                {commissionEntriesForTab.map((entry) => (
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
                {!commissionEntriesForTab.length ? (
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
        {PAYPHONE_FEATURE_ENABLED && tab === 'settings' ? (
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
      {PAYPHONE_FEATURE_ENABLED ? (
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
                  Ingresa las credenciales de PayPhone Business de este negocio.
                  El Token se cifra en el servidor y nunca se mostrara
                  nuevamente.
                </Text>
                <View style={styles.payphoneGuide}>
                  <Text style={styles.payphoneGuideTitle}>
                    Como obtener tu Token y StoreID
                  </Text>
                  <Text style={styles.payphoneGuideStep}>
                    1. Ingresa a PayPhone Business con una cuenta administradora
                    y crea un usuario con rol Desarrollador.
                  </Text>
                  <Text style={styles.payphoneGuideStep}>
                    2. Ingresa a PayPhone Developer con ese usuario y pulsa
                    Agregar para crear una aplicacion.
                  </Text>
                  <Text style={styles.payphoneGuideStep}>
                    3. Selecciona tipo de aplicacion API, completa los datos y
                    guarda. PayPhone determina el ambiente con esas
                    credenciales.
                  </Text>
                  <Text style={styles.payphoneGuideStep}>
                    4. Abre Credenciales, copia solamente Token y StoreID, y
                    pegalos abajo. No compartas el Token con nadie.
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
                    El resto del video no es necesario para Nava: solo necesitas
                    los campos Token y StoreID. Nava genera el enlace de cobro,
                    pero PayPhone no comunica automáticamente el resultado.
                    Verifica la transacción en PayPhone Business antes de
                    registrarla como pagada.
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
                        {testPayphone.isPending
                          ? 'Probando...'
                          : 'Probar conexion'}
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
                      <Text style={styles.dangerText}>
                        Desconectar PayPhone
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
      <AgendaCalendarModal
        bottomInset={layout.bottomInset}
        calendarMonth={calendarMonth}
        days={calendarGrid(calendarMonth)}
        onClose={() => setCalendarTarget(null)}
        onMonthChange={setCalendarMonth}
        onSelectDay={(day) => {
          const value = localCalendarDate(day);
          if (calendarTarget === 'filter-start') {
            setMovementDateStart(value);
            if (value > movementDateEnd) setMovementDateEnd(value);
          }
          if (calendarTarget === 'filter-end') {
            setMovementDateEnd(value);
            if (value < movementDateStart) setMovementDateStart(value);
          }
          if (calendarTarget === 'history-date') setHistoryDate(value);
          if (calendarTarget === 'period-start') {
            setPeriodStart(value);
            if (value > periodEnd) setPeriodEnd(value);
          }
          if (calendarTarget === 'period-end') {
            setPeriodEnd(value);
            if (value < periodStart) setPeriodStart(value);
          }
          setCalendarTarget(null);
        }}
        selectedDay={dateForCalendar(
          calendarTarget === 'filter-start'
            ? movementDateStart
            : calendarTarget === 'filter-end'
              ? movementDateEnd
              : calendarTarget === 'history-date'
                ? historyDate
                : calendarTarget === 'period-start'
                  ? periodStart
                  : periodEnd,
        )}
        today={new Date()}
        topInset={layout.topInset}
        visible={calendarTarget !== null}
      />
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
                    <Pressable
                      accessibilityLabel="Seleccionar inicio del período"
                      onPress={() => {
                        setCalendarMonth(dateForCalendar(periodStart));
                        setCalendarTarget('period-start');
                      }}
                      style={styles.calendarField}
                    >
                      <Ionicons
                        color={appTheme.colors.accentDark}
                        name="calendar-outline"
                        size={18}
                      />
                      <Text style={styles.calendarFieldValue}>
                        {periodStart}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.dateField}>
                    <Text style={styles.inputLabel}>Hasta</Text>
                    <Pressable
                      accessibilityLabel="Seleccionar fin del período"
                      onPress={() => {
                        setCalendarMonth(dateForCalendar(periodEnd));
                        setCalendarTarget('period-end');
                      }}
                      style={styles.calendarField}
                    >
                      <Ionicons
                        color={appTheme.colors.accentDark}
                        name="calendar-outline"
                        size={18}
                      />
                      <Text style={styles.calendarFieldValue}>{periodEnd}</Text>
                    </Pressable>
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
