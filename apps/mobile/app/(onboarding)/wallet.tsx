import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WalletScreen() {
  const router = useRouter();
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
          <Text style={styles.balanceValue}>$0.00</Text>
          <Text style={styles.balanceCopy}>
            Los cobros online, transferencias y efectivo se mostrarán aquí.
          </Text>
        </View>
        <View style={styles.tabs}>
          <Text style={styles.tabActive}>Resumen</Text>
          <Text style={styles.tab}>Historial</Text>
          <Text style={styles.tab}>Configuración</Text>
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
              Abre caja, registra ventas, gastos, retiros y realiza el cierre.
            </Text>
          </View>
          <Ionicons color="#101c2d" name="chevron-forward" size={22} />
        </Pressable>
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
