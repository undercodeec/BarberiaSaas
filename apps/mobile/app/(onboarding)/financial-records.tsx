import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CashMovementRecord,
  FinancialRecordsResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BottomNavigation,
  appTheme,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

const types = [
  { label: 'Todos', value: undefined },
  { label: 'Ventas', value: 'sale' },
  { label: 'Ingresos', value: 'deposit' },
  { label: 'Gastos', value: 'expense' },
] as const;

function todayFor(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function labelFor(movement: CashMovementRecord) {
  if (movement.source === 'appointment') return 'Servicio de cita';
  if (movement.source === 'manual_service') return 'Servicio manual';
  if (movement.source === 'product_sale') return 'Venta de producto';
  if (movement.type === 'deposit') return 'Depósito';
  if (movement.type === 'other_income') return 'Otro ingreso';
  if (movement.type === 'expense') return 'Gasto';
  if (movement.type === 'withdrawal') return 'Retiro';
  return 'Movimiento de caja';
}

function attributionFor(movement: CashMovementRecord) {
  const professional =
    movement.attribution?.professional?.name ??
    movement.professionalNameSnapshot;
  const seller =
    movement.attribution?.seller?.name ?? movement.sellerNameSnapshot;
  const recordedBy =
    movement.attribution?.recordedBy?.name ?? movement.recordedByNameSnapshot;
  return [
    professional ? `Hecho por: ${professional}` : null,
    seller ? `Vendió: ${seller}` : null,
    recordedBy ? `Registró: ${recordedBy}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

export default function FinancialRecordsScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const organizationQuery = useCurrentOrganization();
  const router = useRouter();
  const { locationId: locationParam } = useLocalSearchParams<{
    locationId?: string;
  }>();
  const locationId = locationParam ?? tenant.scope.locationId;
  const [type, setType] = useState<(typeof types)[number]['value']>();
  const [page, setPage] = useState(1);
  const date = todayFor(
    organizationQuery.data?.location?.timezone ?? 'America/Guayaquil',
  );
  const query = useQuery({
    enabled: Boolean(session && locationId),
    queryFn: () =>
      requireApiClient().request<FinancialRecordsResponse>(
        `/v1/financial-records?locationId=${encodeURIComponent(locationId)}&date=${date}&page=${page}&pageSize=30${type ? `&type=${type}` : ''}`,
      ),
    queryKey: tenant.key('financial-records', locationId, date, type, page),
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const records = query.data?.records ?? [];
  const pageSize = query.data?.pageSize ?? 30;
  const total = query.data?.total ?? 0;
  const canGoPrevious = page > 1;
  const canGoNext = page * pageSize < total;
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
            Registro del día
          </Text>
          <Text style={styles.subtitle}>{date}</Text>
        </View>
        <View style={styles.backPlaceholder} />
      </View>
      <View style={styles.filters}>
        {types.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => {
              setPage(1);
              setType(item.value);
            }}
            style={[styles.filter, type === item.value && styles.filterActive]}
          >
            <Text
              style={[
                styles.filterText,
                type === item.value && styles.filterTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {query.isLoading ? (
          <Text style={styles.empty}>Cargando registros…</Text>
        ) : null}
        {query.isError ? (
          <Text style={styles.empty}>No pudimos cargar los movimientos.</Text>
        ) : null}
        {!query.isLoading && !query.isError && !records.length ? (
          <Text style={styles.empty}>No hay movimientos registrados hoy.</Text>
        ) : null}
        {records.map((movement) => {
          const income =
            movement.type === 'sale' ||
            movement.type === 'deposit' ||
            movement.type === 'other_income' ||
            movement.type === 'professional_advance_reversal';
          const attribution = attributionFor(movement);
          return (
            <View key={movement.id} style={styles.record}>
              <View style={styles.recordTop}>
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{movement.description}</Text>
                  <Text style={styles.recordMeta}>
                    {labelFor(movement)} ·{' '}
                    {movement.paymentMethod ?? 'sin método'}
                  </Text>
                  {movement.productName ? (
                    <Text style={styles.recordMeta}>
                      {movement.productName} ×{movement.productQuantity ?? 1}
                    </Text>
                  ) : null}
                  {movement.services?.length ? (
                    <Text style={styles.recordMeta}>
                      {movement.services
                        .map((service) => service.name)
                        .join(', ')}
                    </Text>
                  ) : null}
                  {attribution ? (
                    <Text style={styles.attribution}>{attribution}</Text>
                  ) : null}
                  {movement.reversedAt ? (
                    <Text style={styles.reversed}>
                      Revertida · {movement.reversalReason ?? 'sin motivo'}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.amount,
                    (!income || movement.reversedAt) && styles.amountExpense,
                  ]}
                >
                  {movement.reversedAt ? '↶ ' : income ? '+' : '-'}
                  {formatMoney(movement.amountCents)}
                </Text>
              </View>
              <Text style={styles.time}>
                {new Date(movement.createdAt).toLocaleTimeString('es-EC', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          );
        })}
        {total > pageSize ? (
          <View style={styles.pagination}>
            <Pressable
              disabled={!canGoPrevious}
              onPress={() => setPage((value) => value - 1)}
            >
              <Text
                style={[styles.pageButton, !canGoPrevious && styles.disabled]}
              >
                Anterior
              </Text>
            </Pressable>
            <Text style={styles.pageText}>Página {page}</Text>
            <Pressable
              disabled={!canGoNext}
              onPress={() => setPage((value) => value + 1)}
            >
              <Text style={[styles.pageButton, !canGoNext && styles.disabled]}>
                Siguiente
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
  amount: { color: '#288B52', fontSize: 15, fontWeight: '800' },
  amountExpense: { color: '#B54747' },
  attribution: {
    color: '#805E21',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  backPlaceholder: { width: 28 },
  content: { gap: 10, padding: 20, paddingBottom: 120 },
  disabled: { opacity: 0.35 },
  empty: {
    color: appTheme.colors.textMuted,
    paddingTop: 36,
    textAlign: 'center',
  },
  filter: {
    borderColor: appTheme.colors.border,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterActive: {
    backgroundColor: '#F7E8B8',
    borderColor: appTheme.colors.accentDark,
  },
  filterText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: { color: '#805E21' },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 5,
  },
  headerCopy: { alignItems: 'center' },
  pageButton: { color: '#805E21', fontSize: 13, fontWeight: '800' },
  pageText: { color: appTheme.colors.textMuted, fontSize: 13 },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  record: {
    backgroundColor: '#FFFFFF',
    borderColor: appTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  recordCopy: { flex: 1, paddingRight: 10 },
  recordMeta: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 3 },
  recordTitle: { color: appTheme.colors.text, fontSize: 15, fontWeight: '800' },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between' },
  reversed: { color: '#B54747', fontSize: 12, fontWeight: '700', marginTop: 5 },
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 2 },
  time: { color: appTheme.colors.textMuted, fontSize: 11, marginTop: 8 },
  title: { color: appTheme.colors.text, fontSize: 19, fontWeight: '800' },
});
