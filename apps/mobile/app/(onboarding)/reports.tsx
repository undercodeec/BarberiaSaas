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
          'Podr\u00e1s ver gr\u00e1ficas de las ventas, gastos, ingresos.',
        icon: 'bar-chart-outline',
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
          'Podr\u00e1s ver historial de caja filtrando por fechas que desees.',
        icon: 'wallet-outline',
      },
      {
        id: 'expense-history',
        title: 'Historial de gastos',
        description:
          'Podr\u00e1s ver historial de gastos filtrando por fechas que desees.',
        icon: 'trending-down-outline',
      },
      {
        id: 'deposit-history',
        title: 'Historial de dep\u00f3sitos',
        description:
          'Podr\u00e1s ver historial de dep\u00f3sitos filtrando por fechas que desees.',
        icon: 'trending-up-outline',
      },
      {
        id: 'pay-collaborators',
        title: 'Pagar a colaboradores',
        description: 'Pagar a tus colaboradores por rango de fechas.',
        icon: 'cash-outline',
      },
      {
        id: 'collaborator-payment-history',
        title: 'Historial de pagos a colaboradores',
        description:
          'Podr\u00e1s ver historial de los pagos realizados a tus colaboradores filtrando por fechas que desees.',
        icon: 'receipt-outline',
      },
      {
        id: 'inventory-alert',
        title: 'Alerta de inventario',
        description: 'Descubre los productos que est\u00e1n agotados.',
        icon: 'shield-outline',
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
          'Podr\u00e1s ver historial de las ventas filtrando por fechas que desees.',
        icon: 'pricetag-outline',
      },
      {
        id: 'customer-loans',
        title: 'Pr\u00e9stamos a clientes',
        description: 'Visualiza el estado de pr\u00e9stamo de tus clientes',
        icon: 'card-outline',
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
      },
    ],
  },
];

export default function ReportsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const isOpening = useRef(false);
  const openReport = useCallback((title: string) => {
    if (isOpening.current) return;
    isOpening.current = true;
    Alert.alert(
      title,
      'Esta secci\u00f3n estar\u00e1 disponible pr\u00f3ximamente.',
      [
        {
          text: 'Entendido',
          onPress: () => {
            isOpening.current = false;
          },
        },
      ],
    );
  }, []);
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
                  onPress={() => openReport(item.title)}
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
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDescription}>{item.description}</Text>
      </View>
      <View style={styles.chevron}>
        <Ionicons color="#101c2d" name="chevron-forward" size={24} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
  },
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
  screen: { backgroundColor: '#ffffff', flex: 1 },
  section: { marginBottom: 36 },
  sectionTitle: {
    color: '#101c2d',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
});
