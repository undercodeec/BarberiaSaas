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
} from '../../src/components/BottomNavigation';
import { InlineMessage } from '../../src/components/InlineMessage';
import { requireApiClient } from '../../src/lib/api';
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
  const router = useRouter();
  const { session } = useAuth();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const summaryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      const location = locationId
        ? `&locationId=${encodeURIComponent(locationId)}`
        : '';
      return requireApiClient().request<BusinessSummaryResponse>(
        `/v1/reports/business-summary?range=${preset}${location}`,
      );
    },
    queryKey: ['business-summary', preset, locationId],
  });
  if (!session) return <Redirect href="/(auth)/login" />;

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
            Resumen de mi negocio
          </Text>
          <Text style={styles.headerCaption}>{periodLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel="Filtrar reporte"
          accessibilityRole="button"
          onPress={() => setIsFilterOpen(true)}
          style={styles.headerButton}
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
                  color="#e7f7ee"
                  icon="arrow-up-outline"
                  label="Ventas cobradas"
                  value={money(report.income.salesCents, currency)}
                />
                <MetricTile
                  color="#e7f7ee"
                  icon="add-circle-outline"
                  label="Otros ingresos"
                  value={money(report.income.otherIncomeCents, currency)}
                />
                <MetricTile
                  color="#fdecec"
                  icon="arrow-down-outline"
                  label="Gastos operativos"
                  value={money(report.expenses.operatingCents, currency)}
                />
                <MetricTile
                  color="#eef4ff"
                  icon="people-outline"
                  label="Pago a colaboradores"
                  value={money(
                    report.expenses.collaboratorPaymentsCents,
                    currency,
                  )}
                />
                <MetricTile
                  color="#f6f1ff"
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
                color="#4979eb"
                label="Servicios"
                percent={percentage(
                  report.sales.servicesCents,
                  report.sales.grossCents,
                )}
                value={money(report.sales.servicesCents, currency)}
              />
              <ProgressMetric
                color="#61cadc"
                label="Productos"
                percent={percentage(
                  report.sales.productsCents,
                  report.sales.grossCents,
                )}
                value={money(report.sales.productsCents, currency)}
              />
              <ProgressMetric
                color="#9aa7b7"
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
        onRequestClose={() => setIsFilterOpen(false)}
        transparent
        visible={isFilterOpen}
      >
        <Pressable
          accessibilityLabel="Cerrar filtros"
          onPress={() => setIsFilterOpen(false)}
          style={styles.modalBackdrop}
        >
          <Pressable onPress={() => undefined} style={styles.filterSheet}>
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
        <View style={styles.sparkBadge}>
          <Ionicons color={appTheme.colors.white} name="sparkles" size={20} />
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
        color="#cbf3dc"
        height={(income / maximum) * 126}
        label="Ingresos"
        value={money(income, currency)}
      />
      <ChartColumn
        color="#fde0e0"
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
        <Ionicons color="#526170" name={icon} size={20} />
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
        color="#dff4f7"
        height={(products / maximum) * 110}
        label="Productos"
        value={money(products, currency)}
      />
      <ChartColumn
        color="#e5eafe"
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
        color={active ? '#ffffff' : '#8a929d'}
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 16,
    marginTop: 22,
    paddingVertical: 15,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  applyLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  card: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 24,
    borderWidth: 0,
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
    color: '#7a818b',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  cardTitle: { color: '#101c2d', fontSize: 21, fontWeight: '900' },
  chartColumn: { borderRadius: 12, width: 64 },
  chartColumnWrap: { alignItems: 'center', flex: 1 },
  chartLabel: { color: '#7a818b', fontSize: 13, marginTop: 3 },
  chartTrack: { height: 132, justifyContent: 'flex-end' },
  chartValue: {
    color: '#101c2d',
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
    paddingHorizontal: 18,
  },
  content: {
    alignSelf: 'center',
    gap: 18,
    maxWidth: 720,
    paddingBottom: 44,
    paddingHorizontal: 18,
    width: '100%',
  },
  errorArea: { gap: 10 },
  filterActive: { color: '#ffffff' },
  filterLabel: {
    color: '#6f7782',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 18,
    textTransform: 'uppercase',
  },
  filterOption: {
    alignItems: 'center',
    borderColor: '#e2e5e9',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  filterOptionActive: { backgroundColor: '#101c2d', borderColor: '#101c2d' },
  filterOptionLabel: { color: '#263344', fontSize: 14, fontWeight: '800' },
  filterSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    maxHeight: '88%',
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
  },
  footnote: { color: '#7a818b', fontSize: 12, lineHeight: 18, marginTop: 14 },
  footerDivider: { backgroundColor: '#e0e4e8', height: 38, width: 1 },
  footerLabel: { color: '#7a818b', fontSize: 12, marginTop: 2 },
  footerValue: { color: '#101c2d', fontSize: 17, fontWeight: '900' },
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
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerCaption: { color: '#7a818b', fontSize: 12, marginTop: 2 },
  headerCopy: { flex: 1 },
  legendDot: { borderRadius: 5, height: 10, width: 10 },
  loadingCard: { alignItems: 'center', gap: 12, paddingVertical: 80 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: { color: '#667080', flex: 1, fontSize: 12, lineHeight: 16 },
  metricTile: { borderRadius: 17, minHeight: 94, padding: 14, width: '48%' },
  metricValue: {
    color: '#101c2d',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 8,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(8, 15, 25, 0.46)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  muted: { color: '#7a818b', fontSize: 14 },
  negativeValue: { color: '#c74646' },
  noteBadge: {
    backgroundColor: '#eef0f3',
    borderRadius: 99,
    color: '#69717c',
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
  progressLabel: { color: '#303b49', fontSize: 13, fontWeight: '800' },
  progressLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  progressTrack: { backgroundColor: '#edf0f3', borderRadius: 99, height: 8 },
  progressValue: { color: '#5e6875', fontSize: 12, fontWeight: '800' },
  resultCaption: {
    color: '#7a818b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  resultHeader: { paddingBottom: 4, paddingHorizontal: 3, paddingTop: 10 },
  resultLabel: { color: '#7a818b', fontSize: 18 },
  resultValue: {
    color: '#101c2d',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 1,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#101c2d',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryLabel: { color: '#101c2d', fontSize: 13, fontWeight: '900' },
  salesFooter: {
    alignItems: 'center',
    backgroundColor: '#f7f8fa',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 28,
    marginTop: 8,
    padding: 14,
  },
  screen: { backgroundColor: '#ffffff', flex: 1 },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#d8dce1',
    borderRadius: 99,
    height: 5,
    width: 44,
  },
  sheetTitle: {
    color: '#101c2d',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 15,
  },
  sparkBadge: {
    alignItems: 'center',
    backgroundColor: '#101c2d',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: { color: '#101c2d', fontSize: 21, fontWeight: '900' },
});
