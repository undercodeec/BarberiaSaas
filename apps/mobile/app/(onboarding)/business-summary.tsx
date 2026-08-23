import Ionicons from '@expo/vector-icons/Ionicons';
import type { BusinessSummaryResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { InlineMessage } from '../../src/components/InlineMessage';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';
import { useAuth } from '../../src/providers/AuthProvider';

type Preset = BusinessSummaryResponse['period']['preset'];

const PRESETS: ReadonlyArray<{ label: string; value: Preset }> = [
  { label: 'Hoy', value: 'today' },
  { label: 'Últimos 7 días', value: 'last_7_days' },
  { label: 'Este mes', value: 'this_month' },
  { label: 'Últimos 30 días', value: 'last_30_days' },
];

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat('es-EC', {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(value / 100);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

export default function BusinessSummaryScreen() {
  const tenant = useTenantScope();
  const router = useRouter();
  const layout = useNativeLayoutMetrics();
  const { session } = useAuth();
  const organizationQuery = useCurrentOrganization();
  const canAccessFinancialReports =
    organizationQuery.data?.membership.role === 'owner' ||
    organizationQuery.data?.membership.role === 'manager';
  const [preset, setPreset] = useState<Preset>('this_month');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const summaryQuery = useQuery({
    enabled: Boolean(session) && canAccessFinancialReports,
    queryFn: () => {
      const location = locationId
        ? `&locationId=${encodeURIComponent(locationId)}`
        : '';
      return requireApiClient().request<BusinessSummaryResponse>(
        `/v1/reports/business-summary?range=${preset}${location}`,
      );
    },
    queryKey: tenant.key('business-summary', preset),
  });
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!organizationQuery.isLoading && !canAccessFinancialReports)
    return <Redirect href="/reports" />;

  const report = summaryQuery.data;
  const currency = report?.currencyCode ?? 'USD';
  const periodLabel = report
    ? `${shortDate(report.period.from)} – ${shortDate(report.period.to)}`
    : 'Consultando período';
  const presetLabel =
    PRESETS.find(({ value }) => value === preset)?.label ?? 'Este mes';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver a reportes"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/reports')
          }
          style={styles.headerButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={25}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Resumen negocio
          </Text>
          <Text style={styles.headerCaption}>{periodLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel="Filtrar reporte"
          accessibilityRole="button"
          onPress={() => setIsFilterOpen(true)}
          style={[styles.headerButton, styles.headerButtonTrailing]}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="options-outline"
            size={25}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {summaryQuery.isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator
              color={appTheme.colors.accentDark}
              size="large"
            />
            <Text style={styles.muted}>Preparando tu resumen…</Text>
          </View>
        ) : null}
        {summaryQuery.error ? (
          <View style={styles.errorArea}>
            <InlineMessage
              message={
                summaryQuery.error instanceof Error
                  ? summaryQuery.error.message
                  : 'No pudimos cargar el resumen del negocio.'
              }
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void summaryQuery.refetch()}
              style={styles.retryButton}
            >
              <Text style={styles.retryLabel}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {report ? (
          <>
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Resultado neto</Text>
              <Text
                style={[
                  styles.resultValue,
                  report.netResultCents < 0 && styles.negativeValue,
                ]}
              >
                {money(report.netResultCents, currency)}
              </Text>
              <Text style={styles.resultCaption}>
                Ingresos menos gastos y pagos a colaboradores ·{' '}
                {report.period.locationName}
              </Text>
            </View>

            <ReportCard
              subtitle="Compara las entradas y salidas registradas en Caja"
              title="Ingresos y egresos"
            >
              <ComparisonBars
                currency={currency}
                expenses={report.expenses.totalCents}
                income={report.income.totalCents}
              />
              <View style={styles.metricGrid}>
                <MetricTile
                  color={appTheme.colors.accentWash}
                  icon="arrow-up-outline"
                  label="Ventas cobradas"
                  value={money(report.income.salesCents, currency)}
                />
                <MetricTile
                  color={appTheme.colors.accentWash}
                  icon="add-circle-outline"
                  label="Otros ingresos"
                  value={money(report.income.otherIncomeCents, currency)}
                />
                <MetricTile
                  color={appTheme.colors.dangerSurface}
                  icon="arrow-down-outline"
                  label="Gastos operativos"
                  value={money(report.expenses.operatingCents, currency)}
                />
                <MetricTile
                  color={appTheme.colors.surfaceMuted}
                  icon="people-outline"
                  label="Pago a colaboradores"
                  value={money(
                    report.expenses.collaboratorPaymentsCents,
                    currency,
                  )}
                />
                <MetricTile
                  color={appTheme.colors.accentSubtle}
                  icon="swap-horizontal-outline"
                  label="Retiros de caja"
                  value={money(report.withdrawalsCents, currency)}
                />
              </View>
              <Text style={styles.footnote}>
                Los retiros mueven efectivo, pero no se consideran un gasto del
                negocio. Los depósitos manuales y otros ingresos se muestran
                separados de las ventas cobradas.
              </Text>
            </ReportCard>

            <ReportCard
              subtitle="Distribución de las ventas cobradas en el período"
              title="Tipo de ventas"
            >
              <ProgressMetric
                color={appTheme.colors.accent}
                label="Servicios"
                percent={percentage(
                  report.sales.servicesCents,
                  report.sales.grossCents,
                )}
                value={money(report.sales.servicesCents, currency)}
              />
              <ProgressMetric
                color={appTheme.colors.accentLight}
                label="Productos"
                percent={percentage(
                  report.sales.productsCents,
                  report.sales.grossCents,
                )}
                value={money(report.sales.productsCents, currency)}
              />
              <ProgressMetric
                color={appTheme.colors.textMuted}
                label="Venta libre"
                percent={percentage(
                  report.sales.uncategorizedCents,
                  report.sales.grossCents,
                )}
                value={money(report.sales.uncategorizedCents, currency)}
              />
              <View style={styles.salesFooter}>
                <View>
                  <Text style={styles.footerValue}>
                    {report.sales.transactionCount}
                  </Text>
                  <Text style={styles.footerLabel}>Transacciones</Text>
                </View>
                <View style={styles.footerDivider} />
                <View>
                  <Text style={styles.footerValue}>
                    {money(report.sales.averageTicketCents, currency)}
                  </Text>
                  <Text style={styles.footerLabel}>Ticket promedio</Text>
                </View>
              </View>
            </ReportCard>

            <ReportCard
              subtitle="Comisiones generadas por las ventas del período"
              title="Comisiones"
            >
              <CommissionBars
                currency={currency}
                products={report.commissions.productsGeneratedCents}
                services={report.commissions.servicesGeneratedCents}
              />
              <Text style={styles.footnote}>
                Este valor representa comisiones generadas. El pago efectivo
                depende de las liquidaciones y anticipos aplicados.
              </Text>
            </ReportCard>
          </>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={() => setIsFilterOpen(false)}
        statusBarTranslucent
        transparent
        visible={isFilterOpen}
      >
        <Pressable
          accessibilityLabel="Cerrar filtros"
          onPress={() => setIsFilterOpen(false)}
          style={styles.modalBackdrop}
        >
          <Pressable
            onPress={() => undefined}
            style={[
              styles.filterSheet,
              {
                maxHeight: layout.sheetMaxHeight,
                paddingBottom: layout.bottomInset + 16,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filtrar resumen</Text>
            <Text style={styles.filterLabel}>Período</Text>
            <View style={styles.optionList}>
              {PRESETS.map((option) => (
                <FilterOption
                  active={preset === option.value}
                  key={option.value}
                  label={option.label}
                  onPress={() => setPreset(option.value)}
                />
              ))}
            </View>
            {(report?.accessibleLocations.length ?? 0) > 1 ? (
              <>
                <Text style={styles.filterLabel}>Sucursal</Text>
                <View style={styles.optionList}>
                  <FilterOption
                    active={!locationId}
                    label="Todas las sucursales"
                    onPress={() => setLocationId(null)}
                  />
                  {report?.accessibleLocations.map((location) => (
                    <FilterOption
                      active={locationId === location.id}
                      key={location.id}
                      label={location.name}
                      onPress={() => setLocationId(location.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsFilterOpen(false)}
              style={styles.applyButton}
            >
              <Text style={styles.applyLabel}>Ver {presetLabel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ReportCard({
  children,
  subtitle,
  title,
}: {
  readonly children: React.ReactNode;
  readonly subtitle: string;
  readonly title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <View style={styles.headerCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function ComparisonBars({
  currency,
  expenses,
  income,
}: {
  readonly currency: string;
  readonly expenses: number;
  readonly income: number;
}) {
  const maximum = Math.max(income, expenses, 1);
  return (
    <View style={styles.comparisonArea}>
      <ChartColumn
        color={appTheme.colors.accentLight}
        height={(income / maximum) * 126}
        label="Ingresos"
        value={money(income, currency)}
      />
      <ChartColumn
        color={appTheme.colors.dangerBorder}
        height={(expenses / maximum) * 126}
        label="Egresos"
        value={money(expenses, currency)}
      />
    </View>
  );
}

function ChartColumn({
  color,
  height,
  label,
  value,
}: {
  readonly color: string;
  readonly height: number;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.chartColumnWrap}>
      <View style={styles.chartTrack}>
        <View
          style={[
            styles.chartColumn,
            { backgroundColor: color, height: Math.max(8, height) },
          ]}
        />
      </View>
      <Text style={styles.chartValue}>{value}</Text>
      <Text style={styles.chartLabel}>{label}</Text>
    </View>
  );
}

function MetricTile({
  color,
  icon,
  label,
  value,
}: {
  readonly color: string;
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={[styles.metricTile, { backgroundColor: color }]}>
      <View style={styles.metricHeading}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Ionicons color={appTheme.colors.accentDark} name={icon} size={20} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ProgressMetric({
  color,
  label,
  note,
  percent,
  value,
}: {
  readonly color: string;
  readonly label: string;
  readonly note?: string;
  readonly percent: number;
  readonly value: string;
}) {
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeading}>
        <View style={styles.progressLabelRow}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.progressLabel}>{label}</Text>
          {note ? <Text style={styles.noteBadge}>{note}</Text> : null}
        </View>
        <Text style={styles.progressValue}>
          {percent.toFixed(1)}% · {value}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: color, width: `${percent}%` },
          ]}
        />
      </View>
    </View>
  );
}

function CommissionBars({
  currency,
  products,
  services,
}: {
  readonly currency: string;
  readonly products: number;
  readonly services: number;
}) {
  const maximum = Math.max(products, services, 1);
  return (
    <View style={styles.commissionArea}>
      <ChartColumn
        color={appTheme.colors.accentLight}
        height={(products / maximum) * 110}
        label="Productos"
        value={money(products, currency)}
      />
      <ChartColumn
        color={appTheme.colors.accent}
        height={(services / maximum) * 110}
        label="Servicios"
        value={money(services, currency)}
      />
    </View>
  );
}

function FilterOption({
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
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.filterOption, active && styles.filterOptionActive]}
    >
      <Text style={[styles.filterOptionLabel, active && styles.filterActive]}>
        {label}
      </Text>
      <Ionicons
        color={active ? appTheme.colors.white : appTheme.colors.textMuted}
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    marginTop: 22,
    paddingVertical: 15,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  applyLabel: {
    color: appTheme.colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  card: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    padding: 18,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  cardHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  cardSubtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  cardTitle: { color: appTheme.colors.text, fontSize: 21, fontWeight: '900' },
  chartColumn: { borderRadius: 12, width: 64 },
  chartColumnWrap: { alignItems: 'center', flex: 1 },
  chartLabel: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 3 },
  chartTrack: { height: 132, justifyContent: 'flex-end' },
  chartValue: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 8,
  },
  commissionArea: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  comparisonArea: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 20,
    paddingHorizontal: appTheme.spacing.page,
  },
  content: {
    alignSelf: 'center',
    gap: 18,
    maxWidth: 720,
    paddingBottom: 44,
    paddingHorizontal: appTheme.spacing.page,
    width: '100%',
  },
  errorArea: { gap: 10 },
  filterActive: { color: appTheme.colors.white },
  filterLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 18,
    textTransform: 'uppercase',
  },
  filterOption: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  filterOptionActive: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  filterOptionLabel: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  filterSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
  },
  footnote: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  footerDivider: {
    backgroundColor: appTheme.colors.border,
    height: 38,
    width: 1,
  },
  footerLabel: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 2 },
  footerValue: { color: appTheme.colors.text, fontSize: 17, fontWeight: '900' },
  header: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    maxWidth: 720,
    minHeight: 76,
    paddingHorizontal: 12,
    width: '100%',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerButtonTrailing: { marginRight: 64 },
  headerCaption: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  headerCopy: { flex: 1 },
  legendDot: { borderRadius: 5, height: 10, width: 10 },
  loadingCard: { alignItems: 'center', gap: 12, paddingVertical: 80 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: appTheme.colors.textMuted,
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  metricTile: { borderRadius: 17, minHeight: 94, padding: 14, width: '48%' },
  metricValue: {
    color: appTheme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 8,
  },
  modalBackdrop: {
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  muted: { color: appTheme.colors.textMuted, fontSize: 14 },
  negativeValue: { color: appTheme.colors.danger },
  noteBadge: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 99,
    color: appTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  optionList: { gap: 8 },
  progressBlock: { marginBottom: 15 },
  progressFill: { borderRadius: 99, height: 8 },
  progressHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  progressLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  progressTrack: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 99,
    height: 8,
  },
  progressValue: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  resultCaption: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  resultHeader: { paddingBottom: 4, paddingHorizontal: 3, paddingTop: 10 },
  resultLabel: { color: appTheme.colors.textMuted, fontSize: 18 },
  resultValue: {
    color: appTheme.colors.text,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 1,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '900',
  },
  salesFooter: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radii.control,
    flexDirection: 'row',
    gap: 28,
    marginTop: 8,
    padding: 14,
  },
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: appTheme.colors.border,
    borderRadius: 99,
    height: 5,
    width: 44,
  },
  sheetTitle: {
    color: appTheme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 15,
  },
  title: { color: appTheme.colors.text, fontSize: 21, fontWeight: '900' },
});
