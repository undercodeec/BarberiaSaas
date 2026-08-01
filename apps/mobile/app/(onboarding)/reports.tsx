import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
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
import { useAuth } from '../../src/providers/AuthProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];
type ReportMenuItem = {
  readonly description: string;
  readonly icon: IconName;
  readonly id: string;
  readonly planning?: string;
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
        id: 'business-overview',
        title: 'Resumen del negocio',
        description:
          'Ventas, gastos, pagos, resultado neto y comisiones por período.',
        icon: 'bar-chart-outline',
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
        route: '/wallet?tab=history',
        status: 'available',
      },
      {
        id: 'expense-history',
        title: 'Historial de gastos',
        description:
          'Movimientos de gasto por fecha, sucursal, categoría y responsable.',
        icon: 'trending-down-outline',
        planning:
          'Usará los movimientos EXPENSE de Caja con filtros y exportación CSV.',
        status: 'planned',
      },
      {
        id: 'deposit-history',
        title: 'Historial de dep\u00f3sitos',
        description: 'Entradas de dinero que no corresponden a una venta.',
        icon: 'trending-up-outline',
        planning:
          'Requiere crear el movimiento DEPOSIT/OTHER_INCOME antes de mostrar datos reales.',
        status: 'planned',
      },
      {
        id: 'pay-collaborators',
        title: 'Pagar a colaboradores',
        description: 'Pagar a tus colaboradores por rango de fechas.',
        icon: 'cash-outline',
        route: '/wallet?tab=commissions',
        status: 'available',
      },
      {
        id: 'collaborator-payment-history',
        title: 'Historial de pagos a colaboradores',
        description:
          'Liquidaciones pagadas, anticipos, descuentos y reversos auditables.',
        icon: 'receipt-outline',
        route: '/wallet?tab=commissions',
        status: 'available',
      },
      {
        id: 'inventory-alert',
        title: 'Alerta de inventario',
        description: 'Descubre los productos que est\u00e1n agotados.',
        icon: 'shield-outline',
        planning:
          'Depende de Inventario: productos, existencias por sucursal y umbral mínimo.',
        status: 'planned',
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
        planning:
          'Partirá de movimientos SALE y conservará el vínculo con cita, servicio y profesional.',
        status: 'planned',
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
  const { session } = useAuth();
  const router = useRouter();
  const isOpening = useRef(false);
  const openReport = useCallback(
    (item: ReportMenuItem) => {
      if (item.route) {
        router.push(item.route as never);
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
    [router],
  );
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/settings');
  }, [router]);
  if (!session) return <Redirect href="/(auth)/login" />;
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
            <Ionicons color="#101c2d" name="arrow-back" size={25} />
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
        {reportSections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {section.title}
            </Text>
            <View style={styles.cardList}>
              {section.items.map((item) => (
                <ReportNavigationCard
                  item={item}
                  key={item.id}
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

function ReportNavigationCard({
  item,
  onPress,
}: {
  readonly item: ReportMenuItem;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint="Abre esta secci\u00f3n de reportes"
      accessibilityLabel={[item.title, item.description].join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconContainer}>
        <Ionicons color="#101c2d" name={item.icon} size={28} />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <View
            style={
              item.status === 'available'
                ? styles.availableBadge
                : styles.plannedBadge
            }
          >
            <Text
              style={
                item.status === 'available'
                  ? styles.availableLabel
                  : styles.plannedLabel
              }
            >
              {item.status === 'available' ? 'Disponible' : 'Planificado'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDescription}>{item.description}</Text>
      </View>
      <View style={styles.chevron}>
        <Ionicons color="#101c2d" name="chevron-forward" size={24} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  availableBadge: {
    backgroundColor: '#dff3e7',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  availableLabel: { color: '#287247', fontSize: 10, fontWeight: '900' },
  backButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 8,
    width: 44,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#f4f4f3',
    borderColor: '#d2d4d8',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 88,
    padding: 16,
  },
  cardCopy: { flex: 1, marginLeft: 14 },
  cardDescription: {
    color: '#555a63',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 5,
  },
  cardList: { gap: 16, marginTop: 14 },
  cardTitle: {
    color: '#101c2d',
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
  header: { backgroundColor: '#ffffff', paddingHorizontal: 22 },
  headerContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    maxWidth: 720,
    minHeight: 64,
    width: '100%',
  },
  headerTitle: {
    color: '#101c2d',
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  iconContainer: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderRadius: 18,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  plannedBadge: {
    backgroundColor: '#e5e8ec',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  plannedLabel: { color: '#667080', fontSize: 10, fontWeight: '900' },
  screen: { backgroundColor: '#ffffff', flex: 1 },
  section: { marginBottom: 36 },
  sectionTitle: {
    color: '#101c2d',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
});
