import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../src/components/BottomNavigation';
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
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openRoute);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openRoute(response);
    });
    return () => subscription.remove();
  }, [consumeNotificationResponse, role, session]);

  return null;
}

function SessionStateGate() {
  const { retrySessionRestore, status } = useAuth();

  if (status === 'restoring') {
    return (
      <View style={styles.sessionState}>
        <ActivityIndicator color={appTheme.colors.accent} size="large" />
        <Text style={styles.sessionMessage}>Comprobando tu sesión…</Text>
      </View>
    );
  }

  if (status === 'offline-auth-unknown') {
    return (
      <View style={styles.sessionState}>
        <Text style={styles.sessionTitle}>No pudimos comprobar tu sesión</Text>
        <Text style={styles.sessionMessage}>
          Tu acceso sigue guardado. Revisa la conexión y vuelve a intentarlo.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void retrySessionRestore()}
          style={styles.retryButton}
        >
          <Text style={styles.retryLabel}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <NativePushNotifications />
      <GlobalNotificationsBanner />
    </>
  );
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
        <SessionStateGate />
      </AppProviders>
      {showPreloader ? <NavaPreloader onFinish={finishPreloader} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  retryButton: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    marginTop: 22,
    paddingHorizontal: 28,
    paddingVertical: 15,
    ...goldButtonShadow,
  },
  retryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '800',
  },
  root: {
    flex: 1,
  },
  sessionMessage: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 360,
    textAlign: 'center',
  },
  sessionState: {
    alignItems: 'center',
    ...appStyles.screen,
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  sessionTitle: {
    color: appTheme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
});
