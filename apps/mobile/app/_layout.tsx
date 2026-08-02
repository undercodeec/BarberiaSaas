import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlobalNotificationsBanner } from '../src/components/GlobalNotificationsBanner';
import { NavaPreloader } from '../src/components/NavaPreloader';
import { AppProviders } from '../src/providers/AppProviders';
import { SessionLock } from '../src/components/SessionLock';

export default function RootLayout() {
  const [showPreloader, setShowPreloader] = useState(true);
  const finishPreloader = useCallback(() => {
    setShowPreloader(false);
  }, []);

  return (
    <View style={styles.root}>
      <AppProviders>
        <SessionLock>
          <StatusBar style={showPreloader ? 'dark' : 'light'} />
          <Stack screenOptions={{ headerShown: false }} />
          <GlobalNotificationsBanner />
        </SessionLock>
      </AppProviders>
      {showPreloader ? <NavaPreloader onFinish={finishPreloader} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
