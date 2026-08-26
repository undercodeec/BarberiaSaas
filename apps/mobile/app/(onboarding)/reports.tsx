import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  MovementReportResponse,
  OnboardingAccountDetailsResponse,
  SubscriptionFeatureFlags,
  SubscriptionResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
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
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { accountQueryKey } from '../../src/lib/query-keys';
import { shareTemporaryExport } from '../../src/lib/temporary-export';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];
type ReportMenuItem = {
  readonly description: string;
  readonly icon: IconName;
  readonly id: string;
  readonly movementKind?: 'deposits' | 'expenses' | 'sales';
  readonly planning?: string;
  readonly requiredFeatures?: readonly (keyof SubscriptionFeatureFlags)[];
  readonly requiresFinancialReportsAccess?: boolean;
  readonly route?: string;
  readonly status: 'available' | 'planned';
  readonly title: string;
};
type ReportSection = {
  readonly id: string;
  readonly items: readonly ReportMenuItem[];
  readonly title: string;
};
const reportSections: readonly ReportSection[] = [
  {
    id: 'business-summary',
    title: 'Resumen de negocio',
    items: [
      {
        id: 'daily-control',
        title: 'Control diario',
        description:
          'Citas, cobros, ventas por profesional, productos y cierres de Caja.',
        icon: 'today-outline',
        requiresFinancialReportsAccess: true,
        route: '/daily-report',
        status: 'available',
      },
      {
        id: 'business-overview',
        title: 'Resumen del negocio',
        description:
          'Ventas, gastos, pagos, resultado neto y comisiones por período.',
        icon: 'bar-chart-outline',
        requiresFinancialReportsAccess: true,
        route: '/business-summary',
        status: 'available',
      },
    ],
  },
  {
    id: 'cash-reports',
    title: 'Reportes de caja',
    items: [
      {
        id: 'cash-history',
        title: 'Historial de caja',
        description:
          'Consulta cierres, efectivo esperado, contado y diferencias.',
        icon: 'wallet-outline',
        requiresFinancialReportsAccess: true,
        route: '/wallet?tab=history',
        status: 'available',
      },
      {
        id: 'expense-history',
        title: 'Historial de gastos',
        description:
          'Movimientos de gasto por fecha, sucursal, categoría y responsable.',
        icon: 'trending-down-outline',
        movementKind: 'expenses',
        requiresFinancialReportsAccess: true,
        status: 'available',
      },
      {
        id: 'deposit-history',
        title: 'Historial de dep\u00f3sitos',
        description: 'Entradas de dinero que no corresponden a una venta.',
        icon: 'trending-up-outline',
        movementKind: 'deposits',
        requiresFinancialReportsAccess: true,
        status: 'available',
      },
      {
        id: 'pay-collaborators',
        title: 'Pagar a colaboradores',
        description: 'Pagar a tus colaboradores por rango de fechas.',
        icon: 'cash-outline',
        requiredFeatures: ['team', 'commissions'],
        requiresFinancialReportsAccess: true,
        route: '/wallet?tab=commissions',
        status: 'available',
      },
      {
        id: 'collaborator-payment-history',
        title: 'Historial de pagos a colaboradores',
        description:
          'Liquidaciones pagadas, anticipos, descuentos y reversos auditables.',
        icon: 'receipt-outline',
        requiredFeatures: ['team', 'commissions'],
        requiresFinancialReportsAccess: true,
        route: '/wallet?tab=commissions',
        status: 'available',
      },
      {
        id: 'inventory-alert',
        title: 'Alerta de inventario',
        description: 'Descubre los productos que est\u00e1n agotados.',
        icon: 'shield-outline',
        requiredFeatures: ['inventory'],
        route: '/inventory?filter=low-stock',
        status: 'available',
      },
    ],
  },
  {
    id: 'sales-reports',
    title: 'Reportes de ventas',
    items: [
      {
        id: 'sales-history',
        title: 'Historial de ventas',
        description:
          'Detalle paginado por fecha, método, servicio, profesional y cliente.',
        icon: 'pricetag-outline',
        movementKind: 'sales',
        status: 'available',
      },
      {
        id: 'customer-loans',
        title: 'Pr\u00e9stamos a clientes',
        description: 'Funcionalidad pendiente de definici\u00f3n para el MVP.',
        icon: 'card-outline',
        planning:
          'Su alcance y reglas se definirán después de validar un caso de uso adecuado para el MVP.',
        status: 'planned',
      },
    ],
  },
  {
    id: 'other-reports',
    title: 'Otros reportes',
    items: [
      {
        id: 'customer-reviews',
        title: 'Rese\u00f1as de tus clientes',
        description: 'Vea las opiniones de sus clientes',
        icon: 'star-outline',
        route: '/reviews-management',
        status: 'available',
      },
    ],
  },
];

export default function ReportsScreen() {
  const { session, user } = useAuth();
  const router = useRouter();
  const organizationQuery = useCurrentOrganization();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
  });
  const subscriptionQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<SubscriptionResponse>('/v1/subscription'),
    queryKey: accountQueryKey(user?.id, 'subscription'),
  });
  const featureFlags = subscriptionQuery.data?.current.featureFlags;
  const isSolo = accountQuery.data?.accountType === 'professional';
  const role = organizationQuery.data?.membership.role;
  const canAccessFinancialReports = role === 'owner' || role === 'manager';
  const visibleReportSections = useMemo(
    () =>
      reportSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              (!item.requiresFinancialReportsAccess ||
                canAccessFinancialReports) &&
              (!isSolo ||
                (item.id !== 'pay-collaborators' &&
                  item.id !== 'collaborator-payment-history')),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [canAccessFinancialReports, isSolo],
  );
  const [movementReport, setMovementReport] = useState<
    'deposits' | 'expenses' | 'sales' | null
  >(null);
  const isOpening = useRef(false);
  const openReport = useCallback(
    (item: ReportMenuItem) => {
      if (
        item.requiredFeatures?.some(
          (feature) => !featureFlags || featureFlags[feature] === false,
        )
      ) {
        router.push('/subscription' as never);
        return;
      }
      if (item.route) {
        router.push(item.route as never);
        return;
      }
      if (item.movementKind) {
        setMovementReport(item.movementKind);
        return;
      }
      if (isOpening.current) return;
      isOpening.current = true;
      Alert.alert(
        item.title,
        item.planning ?? 'Esta sección estará disponible en una próxima etapa.',
        [
          {
            text: 'Entendido',
            onPress: () => {
              isOpening.current = false;
            },
          },
        ],
      );
    },
    [featureFlags, router],
  );
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/settings');
  }, [router]);
  if (!session) return <Redirect href="/(auth)/login" />;
  if (movementReport)
    return (
      <MovementReportView
        kind={movementReport}
        onBack={() => setMovementReport(null)}
      />
    );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Pressable
            accessibilityLabel="Regresar a ajustes"
            accessibilityRole="button"
            hitSlop={6}
            onPress={goBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={appTheme.colors.accentDark}
              name="arrow-back"
              size={25}
            />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {'Estad\u00edsticas e informes'}
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {visibleReportSections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {section.title}
            </Text>
            <View style={styles.cardList}>
              {section.items
                .filter((item) => item.id !== 'customer-loans')
                .map((item) => (
                  <ReportNavigationCard
                    item={item}
                    key={item.id}
                    locked={Boolean(
                      item.requiredFeatures &&
                      (!featureFlags ||
                        item.requiredFeatures.some(
                          (feature) => featureFlags[feature] === false,
                        )),
                    )}
                    onPress={() => openReport(item)}
                  />
                ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

type MovementPreset = 'last_7_days' | 'last_30_days' | 'this_month' | 'today';
type MovementPayment = 'card' | 'cash' | 'other' | 'transfer';

const movementPresets: ReadonlyArray<{
  label: string;
  value: MovementPreset;
}> = [
  { label: 'Hoy', value: 'today' },
  { label: '7 días', value: 'last_7_days' },
  { label: 'Este mes', value: 'this_month' },
  { label: '30 días', value: 'last_30_days' },
];
const movementPayments: ReadonlyArray<{
  label: string;
  value: MovementPayment | null;
}> = [
  { label: 'Todos', value: null },
  { label: 'Efectivo', value: 'cash' },
  { label: 'Tarjeta', value: 'card' },
  { label: 'Transferencia', value: 'transfer' },
  { label: 'Otro', value: 'other' },
];

function MovementReportView({
  kind,
  onBack,
}: {
  readonly kind: 'deposits' | 'expenses' | 'sales';
  readonly onBack: () => void;
}) {
  const tenant = useTenantScope();
  const [preset, setPreset] = useState<MovementPreset>('this_month');
  const [payment, setPayment] = useState<MovementPayment | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const queryString = useMemo(() => {
    const search = new URLSearchParams({
      kind,
      page: String(page),
      pageSize: '30',
      range: preset,
    });
    if (payment) search.set('paymentMethod', payment);
    if (locationId) search.set('locationId', locationId);
    return search.toString();
  }, [kind, locationId, page, payment, preset]);
  const reportQuery = useQuery({
    queryFn: () =>
      requireApiClient().request<MovementReportResponse>(
        `/v1/reports/movements?${queryString}`,
      ),
    queryKey: tenant.key('movement-report', queryString),
  });
  const report = reportQuery.data;
  const title =
    kind === 'expenses'
      ? 'Historial de gastos'
      : kind === 'sales'
        ? 'Historial de ventas'
        : 'Historial de depósitos';
  const performCsvExport = async () => {
    try {
      const search = new URLSearchParams(queryString);
      search.set('format', 'csv');
      const csv = await requireApiClient().request<string>(
        `/v1/reports/movements?${search.toString()}`,
        { responseType: 'text' },
      );
      await shareTemporaryExport({
        contents: csv,
        filename: `${kind}-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv;charset=utf-8',
      });
    } catch (error) {
      Alert.alert(
        'No pudimos exportar el reporte',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      );
    }
  };
  const exportCsv = () => {
    Alert.alert(
      'Exportación con datos financieros',
      'El archivo puede contener información sensible. Compártelo solo con personas y aplicaciones autorizadas.',
      [
        { style: 'cancel', text: 'Cancelar' },
        { onPress: () => void performCsvExport(), text: 'Exportar' },
      ],
    );
  };
  const money = (value: number) =>
    new Intl.NumberFormat('es-EC', {
      currency: 'USD',
      style: 'currency',
    }).format(value / 100);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.movementHeader}>
        <Pressable
          accessibilityLabel="Volver a reportes"
          onPress={onBack}
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={25}
          />
        </Pressable>
        <Text style={styles.movementTitle}>{title}</Text>
        <Pressable
          accessibilityLabel="Exportar CSV"
          disabled={!report?.rows.length}
          onPress={exportCsv}
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="share-outline"
            size={24}
          />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.movementContent}>
        <ReportFilter
          items={movementPresets}
          onSelect={(value) => {
            setPreset(value);
            setPage(1);
          }}
          selected={preset}
        />
        <ReportFilter
          items={movementPayments}
          onSelect={(value) => {
            setPayment(value);
            setPage(1);
          }}
          selected={payment}
        />
        {report && report.accessibleLocations.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.reportFilters}>
              <ReportChip
                active={!locationId}
                label="Todas"
                onPress={() => {
                  setLocationId(null);
                  setPage(1);
                }}
              />
              {report.accessibleLocations.map((location) => (
                <ReportChip
                  active={locationId === location.id}
                  key={location.id}
                  label={location.name}
                  onPress={() => {
                    setLocationId(location.id);
                    setPage(1);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
        {reportQuery.isLoading ? (
          <Text style={styles.reportMuted}>Preparando reporte…</Text>
        ) : null}
        {reportQuery.error ? (
          <Pressable onPress={() => void reportQuery.refetch()}>
            <Text style={styles.reportError}>
              No pudimos cargar el reporte. Toca para reintentar.
            </Text>
          </Pressable>
        ) : null}
        {report ? (
          <>
            <View style={styles.reportTotal}>
              <Text style={styles.reportMuted}>Total mostrado</Text>
              <Text style={styles.reportTotalValue}>
                {money(report.totalAmountCents)}
              </Text>
              <Text style={styles.reportMuted}>
                {report.pagination.total} movimientos encontrados
              </Text>
            </View>
            {report.rows.map((row) => (
              <View key={row.id} style={styles.reportRow}>
                <View style={styles.reportRowCopy}>
                  <Text style={styles.reportRowTitle}>{row.description}</Text>
                  <Text style={styles.reportMuted}>
                    {new Date(row.createdAt).toLocaleString('es-EC')} ·{' '}
                    {row.locationName}
                  </Text>
                  {kind === 'deposits' ? (
                    <Text style={styles.reportMuted}>
                      {row.type === 'deposit'
                        ? 'Depósito manual'
                        : 'Otro ingreso'}
                    </Text>
                  ) : null}
                  <Text style={styles.reportMuted}>
                    {[
                      row.clientName,
                      row.serviceName,
                      row.productName,
                      row.professionalName,
                    ]
                      .filter(Boolean)
                      .join(' · ') || row.createdByName}
                  </Text>
                </View>
                <Text style={styles.reportAmount}>
                  {money(row.amountCents)}
                </Text>
              </View>
            ))}
            {!report.rows.length ? (
              <Text style={styles.reportMuted}>
                No hay movimientos para estos filtros.
              </Text>
            ) : null}
            {report.pagination.totalPages > 1 ? (
              <View style={styles.reportPagination}>
                <Pressable
                  disabled={page === 1}
                  onPress={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <Text style={styles.reportLink}>Anterior</Text>
                </Pressable>
                <Text style={styles.reportMuted}>
                  {page} de {report.pagination.totalPages}
                </Text>
                <Pressable
                  disabled={page === report.pagination.totalPages}
                  onPress={() => setPage((value) => value + 1)}
                >
                  <Text style={styles.reportLink}>Siguiente</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportFilter<T extends string | null>({
  items,
  onSelect,
  selected,
}: {
  readonly items: ReadonlyArray<{ label: string; value: T }>;
  readonly onSelect: (value: T) => void;
  readonly selected: T;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.reportFilters}>
        {items.map((item) => (
          <ReportChip
            active={selected === item.value}
            key={item.label}
            label={item.label}
            onPress={() => onSelect(item.value)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function ReportChip({
  active,
  label,
  onPress,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.reportChip, active && styles.reportChipActive]}
    >
      <Text
        style={[styles.reportChipText, active && styles.reportChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ReportNavigationCard({
  item,
  locked,
  onPress,
}: {
  readonly item: ReportMenuItem;
  readonly locked: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={
        locked
          ? 'Disponible con Nava Local. Abre la suscripción para actualizar.'
          : 'Abre esta sección de reportes'
      }
      accessibilityLabel={[
        item.title,
        locked ? 'Requiere Nava Local' : item.description,
      ].join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        locked && styles.cardPlanLocked,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          color={appTheme.colors.accentDark}
          name={item.icon}
          size={28}
        />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.status === 'planned' ? (
            <View style={styles.plannedBadge}>
              <Text style={styles.plannedLabel}>Planificado</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardDescription}>
          {locked ? 'Disponible con Nava Local' : item.description}
        </Text>
      </View>
      <View style={styles.chevron}>
        <Ionicons
          color={appTheme.colors.accentDark}
          name="chevron-forward"
          size={24}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 8,
    width: 44,
  },
  card: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    borderWidth: 0,
    flexDirection: 'row',
    minHeight: 88,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  cardCopy: { flex: 1, marginLeft: 14 },
  cardDescription: {
    color: appTheme.colors.textMuted,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 5,
  },
  cardList: { gap: 16, marginTop: 14 },
  cardPlanLocked: { opacity: 0.46 },
  cardTitle: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
  },
  cardTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  chevron: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: 8,
    width: 28,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 22,
    paddingTop: 22,
    width: '100%',
  },
  header: { backgroundColor: appTheme.colors.surface, paddingHorizontal: 22 },
  headerContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    maxWidth: 720,
    minHeight: 64,
    width: '100%',
  },
  headerTitle: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  iconContainer: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  movementContent: { gap: 14, padding: 20, paddingBottom: 44 },
  movementHeader: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 20,
  },
  movementTitle: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
  },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  plannedBadge: {
    backgroundColor: appTheme.colors.border,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  plannedLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  reportAmount: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  reportChip: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  reportChipActive: { backgroundColor: appTheme.colors.accentDark },
  reportChipText: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  reportChipTextActive: { color: '#FFFFFF' },
  reportError: { color: '#B42318', fontSize: 14, fontWeight: '800' },
  reportFilters: { flexDirection: 'row', gap: 8 },
  reportLink: { color: appTheme.colors.accentDark, fontWeight: '900' },
  reportMuted: { color: appTheme.colors.textMuted, fontSize: 13 },
  reportPagination: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  reportRow: {
    alignItems: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    ...goldButtonShadow,
  },
  reportRowCopy: { flex: 1, gap: 4 },
  reportRowTitle: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  reportTotal: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    padding: 20,
    ...goldButtonShadow,
  },
  reportTotalValue: {
    color: appTheme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginVertical: 4,
  },
  screen: appStyles.screen,
  section: { marginBottom: 36 },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
});
