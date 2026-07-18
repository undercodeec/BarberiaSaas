import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>BASE LISTA</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Tu barbería en la palma de tu mano.
        </Text>
        <Text style={styles.description}>
          La aplicación móvil está preparada para comenzar el flujo de
          onboarding en la siguiente fase.
        </Text>
        <View style={styles.card}>
          <View style={styles.dot} />
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Infraestructura operativa</Text>
            <Text style={styles.cardText}>
              Expo Router · TypeScript estricto
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#101816' },
  container: { flex: 1, justifyContent: 'center', padding: 28 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 99,
    backgroundColor: '#d9ff70',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    color: '#101816',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: 24,
    color: '#f7f3e8',
    fontSize: 46,
    lineHeight: 48,
    fontWeight: '900',
    letterSpacing: -2,
  },
  description: {
    marginTop: 20,
    color: '#aab7b1',
    fontSize: 17,
    lineHeight: 27,
  },
  card: {
    marginTop: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3934',
    borderRadius: 20,
    backgroundColor: '#18231f',
    padding: 18,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d9ff70',
    marginRight: 14,
  },
  cardCopy: { flex: 1 },
  cardTitle: { color: '#f7f3e8', fontSize: 15, fontWeight: '700' },
  cardText: { marginTop: 3, color: '#7f9189', fontSize: 13 },
});
