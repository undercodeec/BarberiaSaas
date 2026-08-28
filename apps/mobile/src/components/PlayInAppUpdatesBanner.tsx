import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  checkForPlayInAppUpdate,
  completePlayInAppUpdate,
  isPlayInAppUpdateDownloaded,
  type PlayInAppUpdateState,
  subscribeToPlayInAppUpdates,
} from '../lib/play-in-app-updates';

export function PlayInAppUpdatesBanner() {
  const insets = useSafeAreaInsets();
  const [updateState, setUpdateState] = useState<PlayInAppUpdateState | null>(
    null,
  );
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let mounted = true;
    const subscription = subscribeToPlayInAppUpdates((state) => {
      if (mounted) setUpdateState(state);
    });
    void checkForPlayInAppUpdate()
      .then((state) => {
        if (mounted) setUpdateState(state);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  if (
    Platform.OS !== 'android' ||
    !updateState ||
    !isPlayInAppUpdateDownloaded(updateState)
  ) {
    return null;
  }

  const completeUpdate = () => {
    if (isCompleting) return;
    setIsCompleting(true);
    void completePlayInAppUpdate()
      .catch(() => undefined)
      .finally(() => setIsCompleting(false));
  };

  return (
    <View style={[styles.overlay, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.card}>
        <Text style={styles.title}>Actualización lista</Text>
        <Text style={styles.message}>
          La nueva versión de Nava ya se descargó. Reinicia la aplicación para
          completar la actualización.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isCompleting}
          onPress={completeUpdate}
          style={[styles.button, isCompleting && styles.buttonDisabled]}
        >
          <Text style={styles.buttonLabel}>
            {isCompleting ? 'Actualizando…' : 'Actualizar ahora'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#101c2d',
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#ead9a7',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 8,
    maxWidth: 520,
    padding: 20,
    shadowColor: '#101c2d',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: '100%',
  },
  message: {
    color: '#667080',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  overlay: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  title: {
    color: '#101c2d',
    fontSize: 19,
    fontWeight: '800',
  },
});
