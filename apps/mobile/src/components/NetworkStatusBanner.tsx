import { useNetInfo } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appTheme } from './BottomNavigation';
import { isNetworkOnline, latestDataUpdate } from '../lib/query-lifecycle';

export function NetworkStatusBanner() {
  const networkState = useNetInfo();
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      queryCache.subscribe(() => {
        // Creating a query can synchronously notify this cache while another
        // component is rendering. Notify React after that render has finished.
        queueMicrotask(onStoreChange);
      }),
    [queryCache],
  );
  const getSnapshot = useCallback(
    () => latestDataUpdate(queryCache.getAll()),
    [queryCache],
  );
  const lastUpdatedAt = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  if (isNetworkOnline(networkState)) return null;
  const lastUpdate = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString('es-EC', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <View accessibilityLiveRegion="polite" style={styles.banner}>
      <Text style={styles.text}>
        Sin conexión. Mostramos los últimos datos guardados
        {lastUpdate ? ` (actualizados a las ${lastUpdate})` : ''}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#7A2E0E',
    left: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    position: 'absolute',
    right: 12,
    top: 10,
    zIndex: 1000,
  },
  text: {
    color: appTheme.colors.surface,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
