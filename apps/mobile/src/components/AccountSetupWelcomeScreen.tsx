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
const teamIllustration = require('../../assets/onboarding-team.png') as number;

interface AccountSetupWelcomeScreenProps {
  readonly fullName: string;
  readonly onContinue: () => void;
}

export function AccountSetupWelcomeScreen({
  fullName,
  onContinue,
}: AccountSetupWelcomeScreenProps) {
  const { height, width } = useWindowDimensions();
  const compact = height < 720;
  const firstName = fullName.trim().split(/\s+/u)[0] || 'bienvenido';

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right', 'top']}
      style={styles.screen}
    >
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.background}>
        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />
        <Ionicons
          color="rgba(16, 28, 45, 0.035)"
          name="cut-outline"
          size={260}
          style={styles.backgroundScissors}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          compact ? styles.contentCompact : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>NAVA</Text>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeLabel}>CONFIGURACIÓN INICIAL</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Image
            accessibilityLabel="Equipo profesional de barbería"
            resizeMode="contain"
            source={teamIllustration}
            style={[
              styles.illustration,
              compact ? styles.illustrationCompact : null,
              { maxWidth: Math.min(width - 36, 520) },
            ]}
          />

          <View style={styles.message}>
            <Text style={styles.greeting}>¡Hola, {firstName}!</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Configura tu cuenta
            </Text>
            <Text style={styles.description}>
              Prepara tu espacio de trabajo para empezar a gestionar tu barbería
              con Nava.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.benefits}>
            <View style={styles.benefit}>
              <View style={styles.iconShell}>
                <Ionicons color="#245fdf" name="storefront-outline" size={19} />
              </View>
              <Text style={styles.benefitLabel}>Tu barbería</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.benefit}>
              <View style={styles.iconShell}>
                <Ionicons color="#245fdf" name="location-outline" size={19} />
              </View>
              <Text style={styles.benefitLabel}>Tu sucursal</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.benefit}>
              <View style={styles.iconShell}>
                <Ionicons color="#245fdf" name="checkmark-outline" size={19} />
              </View>
              <Text style={styles.benefitLabel}>Todo listo</Text>
            </View>
          </View>

          <NavaButton
            compact={width < 390}
            icon="arrow-forward-outline"
            label="Comenzar configuración"
            onPress={onContinue}
            style={styles.continueButton}
            variant="primary"
          />
          <Text style={styles.helper}>Solo te tomará un par de minutos</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  backgroundScissors: {
    bottom: 60,
    left: -110,
    position: 'absolute',
    transform: [{ rotate: '22deg' }],
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#eef3ff',
    borderRadius: 99,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeDot: {
    backgroundColor: '#245fdf',
    borderRadius: 5,
    height: 7,
    width: 7,
  },
  badgeLabel: {
    color: '#245fdf',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  benefit: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
  },
  benefitLabel: {
    color: '#4f5d70',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  benefits: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: '#e6e9ed',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    width: '100%',
  },
  bottomGlow: {
    backgroundColor: 'rgba(168, 221, 217, 0.15)',
    borderRadius: 250,
    bottom: -170,
    height: 360,
    position: 'absolute',
    right: -130,
    width: 360,
  },
  brand: {
    color: '#101c2d',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 5,
  },
  content: {
    alignItems: 'center',
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 560,
    paddingBottom: 20,
    paddingHorizontal: 22,
    paddingTop: 12,
    width: '100%',
  },
  contentCompact: {
    paddingTop: 4,
  },
  continueButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    minHeight: 68,
    width: '100%',
  },
  description: {
    color: '#667080',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 440,
    textAlign: 'center',
  },
  divider: {
    backgroundColor: '#dfe4e9',
    height: 30,
    width: 1,
  },
  footer: {
    alignItems: 'center',
    marginTop: 22,
    width: '100%',
  },
  greeting: {
    color: '#245fdf',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 5,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  helper: {
    color: '#7d8795',
    fontSize: 13,
    marginTop: 11,
  },
  hero: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
  },
  iconShell: {
    alignItems: 'center',
    backgroundColor: '#edf3ff',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  illustration: {
    aspectRatio: 1.437,
    marginTop: 18,
    width: '100%',
  },
  illustrationCompact: {
    marginTop: 5,
    maxHeight: 238,
  },
  message: {
    alignItems: 'center',
    marginTop: 4,
  },
  screen: {
    backgroundColor: '#fcfcfb',
    flex: 1,
  },
  title: {
    color: '#101c2d',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  topGlow: {
    backgroundColor: 'rgba(36, 95, 223, 0.055)',
    borderRadius: 260,
    height: 420,
    position: 'absolute',
    right: -210,
    top: 80,
    width: 420,
  },
});
