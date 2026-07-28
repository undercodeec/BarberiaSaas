import * as LocalAuthentication from 'expo-local-authentication';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { requireApiClient } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

const LOCK_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

export function SessionLock({ children }: PropsWithChildren) {
  const { session, signOut } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const isUnlocking = useRef(false);

  const unlock = useCallback(async () => {
    if (isUnlocking.current) return;
    isUnlocking.current = true;
    setUnlockError(null);

    try {
      if (Platform.OS === 'web') {
        await signOut();
        return;
      }

      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);

      if (!hasHardware || !isEnrolled) {
        await signOut();
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        biometricsSecurityLevel: 'strong',
        disableDeviceFallback: false,
        promptMessage: 'Desbloquea Barberia para continuar',
      });

      if (result.success) {
        try {
          await requireApiClient().request('/v1/auth/session');
          setIsLocked(false);
        } catch {
          await signOut();
        }
        return;
      }

      setUnlockError(
        'No se pudo verificar tu identidad. Intentalo nuevamente.',
      );
    } catch {
      setUnlockError(
        'No se pudo desbloquear la aplicacion. Intentalo nuevamente.',
      );
    } finally {
      isUnlocking.current = false;
    }
  }, [signOut]);

  useEffect(() => {
    if (!session) {
      backgroundedAt.current = null;
      setIsLocked(false);
      return;
    }

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasActive = appState.current === 'active';
      if (
        wasActive &&
        (nextAppState === 'background' || nextAppState === 'inactive')
      ) {
        backgroundedAt.current = Date.now();
      }

      if (nextAppState === 'active' && backgroundedAt.current !== null) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (elapsed >= LOCK_AFTER_BACKGROUND_MS) setIsLocked(true);
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [session]);

  useEffect(() => {
    if (isLocked) void unlock();
  }, [isLocked, unlock]);

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => undefined}
        statusBarTranslucent
        transparent
        visible={isLocked}
      >
        <View accessibilityViewIsModal style={styles.overlay}>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              Aplicacion bloqueada
            </Text>
            <Text style={styles.description}>
              Verifica tu identidad para continuar usando Barberia.
            </Text>
            {unlockError ? (
              <Text style={styles.error}>{unlockError}</Text>
            ) : null}
            <Pressable
              accessibilityLabel="Desbloquear aplicacion"
              accessibilityRole="button"
              onPress={() => void unlock()}
              style={styles.button}
            >
              <Text style={styles.buttonLabel}>Desbloquear</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#101c2d',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 52,
  },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    maxWidth: 360,
    padding: 28,
    width: '100%',
  },
  description: {
    color: '#5c6470',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20, marginTop: 16 },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 28, 45, 0.76)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#101c2d', fontSize: 24, fontWeight: '900' },
});
