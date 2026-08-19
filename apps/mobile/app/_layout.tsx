import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { GlobalNotificationsBanner } from '../src/components/GlobalNotificationsBanner';
import { NavaPreloader } from '../src/components/NavaPreloader';
import { useCurrentOrganization } from '../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../src/lib/api';
import { createNotificationResponseConsumer } from '../src/lib/notification-navigation';
import { AppProviders } from '../src/providers/AppProviders';
import { useAuth } from '../src/providers/AuthProvider';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function NativePushNotifications() {
  const { session, user } = useAuth();
  const router = useRouter();
  const organizationQuery = useCurrentOrganization();
  const role = organizationQuery.data?.membership.role;
  const consumeNotificationResponse = useMemo(
    () =>
      createNotificationResponseConsumer({
        clearLastResponse: Notifications.clearLastNotificationResponseAsync,
        navigate: (destination) => router.push(destination as never),
        role,
      }),
    [role, router],
  );

  useEffect(() => {
    if (Platform.OS === 'web' || !session || !user) return;
    const register = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== Notifications.PermissionStatus.GRANTED) return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('appointments', {
          importance: Notifications.AndroidImportance.MAX,
          name: 'Citas y reservas',
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      const token = (await Notifications.getDevicePushTokenAsync()).data;
      await requireApiClient().request('/v1/push-tokens', {
        body: { platform: Platform.OS, token },
        method: 'PUT',
      });
    };
    void register().catch(() => undefined);
  }, [session, user]);

  useEffect(() => {
    if (Platform.OS === 'web' || !session || !role) return;
    const openRoute = (response: Notifications.NotificationResponse) =>
      void consumeNotificationResponse({
        data: response.notification.request.content.data,
        id: response.notification.request.identifier,
      });
    const subscription = Notifications.addNotificationResponseReceivedListener(
      openRoute,
    );
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openRoute(response);
    });
    return () => subscription.remove();
  }, [consumeNotificationResponse, role, session]);

  return null;
}

export default function RootLayout() {
  const [showPreloader, setShowPreloader] = useState(true);
  const finishPreloader = useCallback(() => {
    setShowPreloader(false);
  }, []);

  return (
    <View style={styles.root}>
      <AppProviders>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        <NativePushNotifications />
        <GlobalNotificationsBanner />
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
