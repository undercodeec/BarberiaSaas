import Ionicons from '@expo/vector-icons/Ionicons';
import type { DailyReportResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { shareTemporaryExport } from '../../src/lib/temporary-export';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

type Preset = DailyReportResponse['period']['preset'];
const presets: ReadonlyArray<{ label: string; value: Preset }> = [
  { label: 'Hoy', value: 'today' },
  { label: '7 días', value: 'last_7_days' },
  { label: 'Este mes', value: 'this_month' },
  { label: '30 días', value: 'last_30_days' },
];

function money(value: number, currency: string) {
  return new Intl.NumberFormat('es-EC', { currency, style: 'currency' }).format(
    value / 100,
  );
}

export default function DailyReportScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const router = useRouter();
  const organizationQuery = useCurrentOrganization();
  const canAccessFinancialReports =
    organizationQuery.data?.membership.role === 'owner' ||
    organizationQuery.data?.membership.role === 'manager';
  const [preset, setPreset] = useState<Preset>('today');
  const [locationId, setLocationId] = useState<string | null>(null);
  const queryString = useMemo(() => {
    const search = new URLSearchParams({ range: preset });
    if (locationId) search.set('locationId', locationId);
    return search.toString();
  }, [locationId, preset]);
  const reportQuery = useQuery({
    enabled: Boolean(session) && canAccessFinancialReports,
    queryFn: () =>
      requireApiClient().request<DailyReportResponse>(
        `/v1/reports/daily?${queryString}`,
      ),
    queryKey: tenant.key('daily-report', queryString),
    refetchInterval: 15_000,
    refetchOnMount: 'always',
  });
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!organizationQuery.isLoading && !canAccessFinancialReports)
    return <Redirect href="/reports" />;
  const report = reportQuery.data;
  const expenses = report?.expenses ?? [];
  const services = report?.services ?? [];
  const currency = report?.currencyCode ?? 'USD';
  const performCsvExport = async () => {
    try {
      const csv = await requireApiClient().request<string>(
        `/v1/reports/daily?${queryString}&format=csv`,
        { responseType: 'text' },
      );
      await shareTemporaryExport({
        contents: csv,
        filename: `reporte-diario-${new Date().toISOString().slice(0, 10)}.csv`,
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

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <IconButton
          label="Volver a reportes"
          name="arrow-back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/reports')
          }
        />
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Control diario
          </Text>
          <Text style={styles.muted}>
            {report
              ? `${report.period.from} · ${report.period.to}`
              : 'Citas, ventas y caja'}
          </Text>
        </View>
        <IconButton
          label="Exportar CSV"
          name="share-outline"
          onPress={exportCsv}
          trailing
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {presets.map((item) => (
              <Chip
                active={preset === item.value}
                key={item.value}
                label={item.label}
                onPress={() => setPreset(item.value)}
              />
            ))}
          </View>
        </ScrollView>
        {(report?.accessibleLocations.length ?? 0) > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              <Chip
                active={!locationId}
                label="Todas"
                onPress={() => setLocationId(null)}
              />
              {report?.accessibleLocations.map((location) => (
                <Chip
                  active={locationId === location.id}
                  key={location.id}
                  label={location.name}
                  onPress={() => setLocationId(location.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
        {reportQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator
              color={appTheme.colors.accentDark}
              size="large"
            />
            <Text style={styles.muted}>Calculando indicadores…</Text>
          </View>
        ) : null}
        {reportQuery.error ? (
          <View style={styles.errorArea}>
            <InlineMessage
              message={
                reportQuery.error instanceof Error
                  ? reportQuery.error.message
                  : 'No pudimos cargar el reporte.'
              }
            />
            <Pressable onPress={() => void reportQuery.refetch()}>
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
        {report ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Ventas cobradas</Text>
              <Text style={styles.heroValue}>
                {money(report.sales.grossCents, currency)}
              </Text>
              <Text style={styles.heroNote}>
                {report.sales.transactionCount} transacciones · ticket{' '}
                {money(report.sales.averageTicketCents, currency)} ·{' '}
                {report.period.locationName}
              </Text>
            </View>
            <Section title="Citas">
              <View style={styles.metricGrid}>
                <Metric label="Del período" value={report.appointments.total} />
                <Metric
                  label="Atendidas"
                  value={report.appointments.attended}
                />
                <Metric
                  label="Canceladas"
                  value={report.appointments.cancelled}
                />
                <Metric label="No-show" value={report.appointments.noShow} />
              </View>
              <Text style={styles.sectionNote}>
                {report.appointments.paid} pagadas · valor programado{' '}
                {money(report.appointments.paidScheduledValueCents, currency)}
              </Text>
            </Section>
            <Section title="Servicios realizados">
              {services.map((service) => (
                <Detail
                  key={service.id}
                  name={service.name}
                  note={`${service.quantity} cobrados · ventas ${money(service.revenueCents, currency)}`}
                  value={`${service.quantity} ${service.quantity === 1 ? 'servicio' : 'servicios'}`}
                />
              ))}
              {!services.length ? (
                <Text style={styles.muted}>
                  No hay servicios realizados en este período.
                </Text>
              ) : null}
            </Section>
            <Section title="Cobros por método">
              <Amount
                label="Efectivo"
                value={money(report.collections.cashCents, currency)}
              />
              <Amount
                label="Tarjeta"
                value={money(report.collections.cardCents, currency)}
              />
              <Amount
                label="Transferencia"
                value={money(report.collections.transferCents, currency)}
              />
              <Amount
                label="Otro"
                value={money(report.collections.otherCents, currency)}
              />
            </Section>
            <Section title="Por profesional">
              {report.professionals.map((professional) => (
                <Detail
                  key={professional.id}
                  name={professional.name}
                  note={`${professional.completedAppointments} atendidas · ${professional.saleCount} ventas · comisión ${money(professional.commissionCents, currency)}`}
                  value={money(professional.salesCents, currency)}
                />
              ))}
              {!report.professionals.length ? (
                <Text style={styles.muted}>No hay actividad profesional.</Text>
              ) : null}
            </Section>
            <Section title="Productos vendidos">
              {report.products.map((product) => (
                <Detail
                  key={product.id}
                  name={product.name}
                  note={`${product.quantity} unidades`}
                  value={money(product.revenueCents, currency)}
                />
              ))}
              {!report.products.length ? (
                <Text style={styles.muted}>No hay productos vendidos.</Text>
              ) : null}
            </Section>
            <Section title="Egresos registrados">
              {expenses.map((expense) => (
                <Detail
                  key={expense.description}
                  name={expense.description}
                  note={`${expense.count} ${expense.count === 1 ? 'registro' : 'registros'}`}
                  value={money(expense.amountCents, currency)}
                />
              ))}
              {!expenses.length ? (
                <Text style={styles.muted}>
                  No hay egresos registrados en este período.
                </Text>
              ) : null}
            </Section>
            <Section title="Cierre de Caja">
              <Amount
                label={`${report.cashClosures.count} cierres · esperado`}
                value={money(report.cashClosures.expectedAmountCents, currency)}
              />
              <Amount
                label="Efectivo contado"
                value={money(report.cashClosures.closingAmountCents, currency)}
              />
              <Amount
                alert={report.cashClosures.differenceCents !== 0}
                label="Diferencia"
                value={money(report.cashClosures.differenceCents, currency)}
              />
            </Section>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function IconButton({
  label,
  name,
  onPress,
  trailing = false,
}: {
  readonly label: string;
  readonly name: React.ComponentProps<typeof Ionicons>['name'];
  readonly onPress: () => void;
  readonly trailing?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.headerButton, trailing && styles.headerButtonTrailing]}
    >
      <Ionicons color={appTheme.colors.accentDark} name={name} size={24} />
    </Pressable>
  );
}
function Chip({
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
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Section({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}
function Amount({
  alert,
  label,
  value,
}: {
  readonly alert?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, alert && styles.alert]}>{value}</Text>
    </View>
  );
}
function Detail({
  name,
  note,
  value,
}: {
  readonly name: string;
  readonly note: string;
  readonly value: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.detailCopy}>
        <Text style={styles.detailTitle}>{name}</Text>
        <Text style={styles.muted}>{note}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: { color: '#B54747' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    ...goldButtonShadow,
  },
  cardTitle: {
    color: '#18202B',
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 8,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: appTheme.colors.accentDark },
  chips: { flexDirection: 'row', gap: 8 },
  chipText: { color: '#4B5563', fontSize: 13, fontWeight: '800' },
  chipTextActive: { color: '#FFFFFF' },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    padding: 20,
    paddingBottom: 48,
    width: '100%',
  },
  detailCopy: { flex: 1, gap: 3 },
  detailTitle: { color: '#18202B', fontSize: 15, fontWeight: '800' },
  errorArea: { gap: 10 },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 20,
  },
  headerButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerButtonTrailing: { marginRight: 64 },
  headerCopy: { flex: 1, marginHorizontal: 8 },
  hero: { backgroundColor: '#18202B', borderRadius: 24, padding: 22 },
  heroLabel: { color: '#D5D9E0', fontSize: 14, fontWeight: '700' },
  heroNote: { color: '#D5D9E0', fontSize: 13, lineHeight: 19 },
  heroValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginVertical: 8,
  },
  loading: { alignItems: 'center', gap: 12, padding: 36 },
  metric: {
    backgroundColor: '#F6F7F9',
    borderRadius: 16,
    padding: 14,
    width: '48%',
  },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricValue: { color: '#18202B', fontSize: 25, fontWeight: '900' },
  muted: { color: '#7A8492', fontSize: 13, lineHeight: 19 },
  retry: { color: appTheme.colors.accentDark, fontWeight: '900' },
  row: {
    alignItems: 'center',
    borderBottomColor: '#EEF0F3',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  rowLabel: { color: '#4B5563', flex: 1, fontSize: 14 },
  rowValue: { color: '#18202B', fontSize: 15, fontWeight: '900' },
  screen: { backgroundColor: '#F5F6F8', flex: 1 },
  sectionNote: { color: '#4B5563', fontSize: 13, marginTop: 12 },
  title: { color: '#18202B', fontSize: 22, fontWeight: '900' },
});
