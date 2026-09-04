import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  checkForAppStoreUpdate,
  openAppStoreUpdate,
} from '../lib/app-store-updates';

export function AppStoreUpdatesBanner() {
  const insets = useSafeAreaInsets();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isOpeningStore, setIsOpeningStore] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const installedVersion =
      Constants.nativeAppVersion ?? Constants.expoConfig?.version;
    if (!installedVersion) return;

    let mounted = true;
    void checkForAppStoreUpdate(installedVersion)
      .then((available) => {
        if (mounted) setUpdateAvailable(available);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  if (Platform.OS !== 'ios' || !updateAvailable) return null;

  const openUpdate = () => {
    if (isOpeningStore) return;
    setIsOpeningStore(true);
    void openAppStoreUpdate()
      .catch(() => undefined)
      .finally(() => setIsOpeningStore(false));
  };

  return (
    <View style={[styles.overlay, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.card}>
        <Text style={styles.title}>Actualización disponible</Text>
        <Text style={styles.message}>
          Hay una nueva versión de Nava. Actualízala desde App Store para
          continuar con las mejoras más recientes.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isOpeningStore}
          onPress={openUpdate}
          style={[styles.button, isOpeningStore && styles.buttonDisabled]}
        >
          <Text style={styles.buttonLabel}>
            {isOpeningStore ? 'Abriendo App Store…' : 'Actualizar ahora'}
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
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
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
  message: { color: '#667080', fontSize: 15, lineHeight: 22, marginTop: 8 },
  overlay: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  title: { color: '#101c2d', fontSize: 19, fontWeight: '800' },
});
