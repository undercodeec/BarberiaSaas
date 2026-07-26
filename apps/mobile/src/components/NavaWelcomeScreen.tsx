import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavaButton } from './NavaButton';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logoImage = require('../../assets/nava-logo.png') as number;

interface NavaWelcomeScreenProps {
  readonly onLogin: () => void;
  readonly onRegister: () => void;
}

export function NavaWelcomeScreen({
  onLogin,
  onRegister,
}: NavaWelcomeScreenProps) {
  const { height, width } = useWindowDimensions();
  const compact = height < 700;
  const stackActions = width < 350;

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right', 'top']}
      style={styles.screen}
    >
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.backgroundArt}>
        <View style={styles.barberPole}>
          <View style={[styles.poleStripe, styles.poleStripeOne]} />
          <View style={[styles.poleStripe, styles.poleStripeTwo]} />
          <View style={[styles.poleStripe, styles.poleStripeThree]} />
        </View>
        <Ionicons
          color="rgba(16, 28, 45, 0.035)"
          name="cut-outline"
          size={340}
          style={styles.backgroundScissors}
        />
        <View style={styles.backgroundCurve} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          compact ? styles.contentCompact : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            accessibilityLabel="Nava"
            resizeMode="contain"
            source={logoImage}
            style={[styles.logo, compact ? styles.logoCompact : null]}
          />

          <View style={styles.message}>
            <Text accessibilityRole="header" style={styles.title}>
              Bienvenido a <Image resizeMode="contain" source={logoImage} style={styles.inlineBrandLogo} />
            </Text>
            <Text style={styles.description}>
              Reserva tu cita y gestiona{'\n'}tu barbería con facilidad
            </Text>

            <View accessibilityElementsHidden style={styles.separator}>
              <View style={styles.separatorLine} />
              <Ionicons color="#000000" name="cut-outline" size={30} />
              <View style={styles.separatorLine} />
            </View>
          </View>
        </View>

        <View
          style={[styles.actions, stackActions ? styles.actionsStacked : null]}
        >
          <NavaButton
            compact={width < 430}
            icon="person-outline"
            label="Crear cuenta"
            onPress={onRegister}
            style={[
              styles.actionButton,
              stackActions ? styles.actionButtonStacked : null,
            ]}
            variant="outline"
          />
          <NavaButton
            compact={width < 430}
            icon="log-in-outline"
            label="Iniciar sesión"
            onPress={onLogin}
            style={[
              styles.actionButton,
              stackActions ? styles.actionButtonStacked : null,
            ]}
            variant="primary"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    flexBasis: 0,
    minHeight: 72,
  },
  actionButtonStacked: {
    flexBasis: 'auto',
    flexGrow: 0,
    width: '100%',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 44,
    width: '100%',
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  backgroundArt: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  backgroundCurve: {
    backgroundColor: 'rgba(231, 236, 240, 0.34)',
    borderRadius: 500,
    bottom: -330,
    height: 540,
    left: -170,
    position: 'absolute',
    transform: [{ rotate: '-12deg' }],
    width: 760,
  },
  backgroundScissors: {
    bottom: 90,
    left: -115,
    position: 'absolute',
    transform: [{ rotate: '23deg' }],
  },
  barberPole: {
    backgroundColor: 'rgba(16, 28, 45, 0.018)',
    borderRadius: 80,
    height: 390,
    overflow: 'hidden',
    position: 'absolute',
    right: -108,
    top: 138,
    transform: [{ rotate: '27deg' }],
    width: 118,
  },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'space-between',
    marginHorizontal: 'auto',
    maxWidth: 560,
    paddingBottom: 24,
    paddingHorizontal: 22,
    paddingTop: 88,
    width: '100%',
  },
  contentCompact: {
    paddingTop: 32,
  },
  description: {
    color: '#667080',
    fontSize: 18,
    lineHeight: 27,
    marginTop: 16,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
  },
  inlineBrandLogo: {
    height: 28,
    width: 90,
  },
  logo: {
    height: 155,
    maxWidth: 440,
    width: '88%',
  },
  logoCompact: {
    height: 112,
  },
  message: {
    alignItems: 'center',
    marginTop: 48,
  },
  poleStripe: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    height: 48,
    left: -25,
    position: 'absolute',
    transform: [{ rotate: '-30deg' }],
    width: 175,
  },
  poleStripeOne: {
    top: 58,
  },
  poleStripeThree: {
    top: 254,
  },
  poleStripeTwo: {
    top: 156,
  },
  screen: {
    backgroundColor: '#fcfcfb',
    flex: 1,
  },
  separator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 20,
    marginTop: 34,
  },
  separatorLine: {
    backgroundColor: '#d9dedf',
    height: 1,
    width: 74,
  },
  title: {
    color: '#101c2d',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
});
