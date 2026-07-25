import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavaButton } from '../../src/components/NavaButton';
import {
  type ServiceDraft,
  ServiceFormSheet,
} from '../../src/components/ServiceFormSheet';
import { useAuth } from '../../src/providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const servicesImage = require('../../assets/imagenServicios.png') as number;

export default function ServicesOnboardingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { height, width } = useWindowDimensions();
  const compact = height < 740;
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [services, setServices] = useState<ServiceDraft[]>([]);

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right', 'top']}
      style={styles.screen}
    >
      <StatusBar style="dark" />

      <View pointerEvents="none" style={styles.background}>
        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          compact ? styles.contentCompact : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Regresar"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons color="#101c2d" name="arrow-back" size={23} />
          <Text style={styles.backLabel}>Regresar</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Configura tu cuenta</Text>

          <View
            accessibilityLabel="Paso 2 de 4"
            accessibilityRole="progressbar"
            style={styles.progress}
          >
            <View style={styles.completedStep} />
            <View style={styles.activeStep} />
            <View style={styles.step} />
            <View style={styles.step} />
          </View>
        </View>

        <View style={styles.main}>
          <Image
            accessibilityLabel="Cliente de barbería rodeado de herramientas profesionales"
            resizeMode="contain"
            source={servicesImage}
            style={[
              styles.illustration,
              compact ? styles.illustrationCompact : null,
              { maxWidth: Math.min(width + 8, 560) },
            ]}
          />

          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>
              Crea los servicios de tu negocio
            </Text>
            <Text style={styles.description}>
              Configura los servicios que ofrecerá tu equipo, indicando su
              duración y precio para que tus clientes puedan reservarlos.
            </Text>
          </View>

          <NavaButton
            compact={width < 390}
            icon="cut-outline"
            label={
              services.length > 0 ? 'Añadir otro servicio' : 'Añadir servicio'
            }
            onPress={() => setServiceSheetOpen(true)}
            style={styles.actionButton}
            variant="outline"
          />
          {services.length > 0 ? (
            <Text style={styles.savedLabel}>
              {services.length}{' '}
              {services.length === 1
                ? 'servicio añadido'
                : 'servicios añadidos'}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <NavaButton
            disabled
            icon="arrow-forward-outline"
            label="Siguiente"
            onPress={() => undefined}
            style={styles.nextButton}
            variant="primary"
          />
        </View>
      </ScrollView>

      <ServiceFormSheet
        onClose={() => setServiceSheetOpen(false)}
        onSave={(service) => {
          setServices((current) => [...current, service]);
          setServiceSheetOpen(false);
        }}
        visible={serviceSheetOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activeStep: {
    backgroundColor: '#000000',
    borderRadius: 6,
    height: 10,
    width: 31,
  },
  actionButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    height: 66,
    marginTop: 25,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  backLabel: {
    color: '#101c2d',
    fontSize: 15,
    fontWeight: '800',
  },
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  bottomGlow: {
    backgroundColor: 'rgba(59, 116, 232, 0.07)',
    borderRadius: 260,
    bottom: -220,
    height: 430,
    left: -220,
    position: 'absolute',
    width: 430,
  },
  completedStep: {
    backgroundColor: '#88a9ee',
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 640,
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 18,
    width: '100%',
  },
  contentCompact: {
    paddingBottom: 12,
    paddingTop: 10,
  },
  copy: {
    alignItems: 'center',
    marginTop: 8,
  },
  description: {
    color: '#667080',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 490,
    textAlign: 'center',
  },
  eyebrow: {
    color: '#101c2d',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  footer: {
    marginTop: 28,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  illustration: {
    aspectRatio: 1.5,
    width: '108%',
  },
  illustrationCompact: {
    maxHeight: 220,
  },
  main: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 22,
  },
  nextButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    height: 66,
    width: '100%',
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  savedLabel: {
    color: '#667080',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  screen: {
    backgroundColor: '#f9fbff',
    flex: 1,
  },
  step: {
    backgroundColor: '#dce7fb',
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  title: {
    color: '#101c2d',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 36,
    maxWidth: 470,
    textAlign: 'center',
  },
  topGlow: {
    backgroundColor: 'rgba(46, 103, 224, 0.08)',
    borderRadius: 260,
    height: 420,
    position: 'absolute',
    right: -230,
    top: -180,
    width: 420,
  },
});
