import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CashRegisterHistoryResponse,
  CashRegisterSummaryResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function WalletScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [tab, setTab] = useState<'summary' | 'history' | 'settings'>('summary');
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
          <Ionicons color="#101c2d" name="chevron-back" size={24} />
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
                <Ionicons color="#101c2d" name="cash-outline" size={25} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>Caja física</Text>
                <Text style={styles.cardDescription}>
                  Abre caja, registra ventas, gastos, retiros y realiza el
                  cierre.
                </Text>
              </View>
              <Ionicons color="#101c2d" name="chevron-forward" size={22} />
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
        {tab === 'settings' ? (
          <View style={styles.card}>
            <View style={styles.icon}>
              <Ionicons color="#101c2d" name="card-outline" size={25} />
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
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { backgroundColor: '#fff', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 20 },
  back: {
    alignItems: 'center',
    backgroundColor: '#eef0f2',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: { color: '#101c2d', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#69717c', fontSize: 13, marginTop: 2 },
  content: { gap: 14, padding: 20 },
  history: { gap: 8 },
  historyCaption: { color: '#69717c', fontSize: 11, marginTop: 2 },
  historyAmount: { color: '#101c2d', fontSize: 14, fontWeight: '900' },
  historyRow: {
    alignItems: 'center',
    backgroundColor: '#f7f7f6',
    borderRadius: 14,
    flexDirection: 'row',
    padding: 14,
  },
  historyValue: { alignItems: 'flex-end' },
  metric: { color: '#3d4652', fontSize: 12, fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  balance: { backgroundColor: '#17191d', borderRadius: 24, padding: 22 },
  balanceLabel: { color: '#c9cdd2', fontSize: 14 },
  balanceValue: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 8,
  },
  balanceCopy: {
    color: '#d9dcdf',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  tabs: {
    borderBottomColor: '#e2e4e6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 25,
    paddingVertical: 12,
  },
  tab: { color: '#747b85', fontSize: 14, fontWeight: '800' },
  tabActive: { color: '#101c2d', fontSize: 14, fontWeight: '900' },
  card: {
    alignItems: 'center',
    backgroundColor: '#f7f7f6',
    borderColor: '#e1e3e5',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: '#e3e5e7',
    borderRadius: 17,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  copy: { flex: 1 },
  cardTitle: { color: '#101c2d', fontSize: 16, fontWeight: '900' },
  cardDescription: {
    color: '#667080',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#e6e8eb',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeText: { color: '#59606a', fontSize: 10, fontWeight: '900' },
});
