import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppNotificationRecord,
  AppNotificationsResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appTheme, goldButtonShadow, goldShadow } from './BottomNavigation';
import { requireApiClient } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

function relativeDate(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60_000),
  );
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 24 * 60) return `Hace ${Math.floor(minutes / 60)} h`;
  return new Date(value).toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'short',
  });
}

export function GlobalNotificationsBanner() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const borderDotProgress = useRef(new Animated.Value(0)).current;
  const [translateX] = useState(() => new Animated.Value(-520));
  useEffect(() => {
    let isActive = true;

    const animateBorderDot = () => {
      borderDotProgress.setValue(0);
      Animated.timing(borderDotProgress, {
        duration: 24_000,
        easing: Easing.linear,
        isInteraction: false,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && isActive) animateBorderDot();
      });
    };

    animateBorderDot();
    return () => {
      isActive = false;
      borderDotProgress.stopAnimation();
    };
  }, [borderDotProgress]);

  const borderDotRotation = borderDotProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const query = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<AppNotificationsResponse>('/v1/notifications'),
    queryKey: ['notifications'],
    refetchInterval: 15_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) =>
      requireApiClient().request(`/v1/notifications/${id}/read`, {
        method: 'POST',
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/notifications/read-all', {
        method: 'POST',
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const notifications = query.data?.notifications ?? [];
  const unread = notifications.filter(
    (notification) => !notification.readAt,
  ).length;
  const openBanner = () => {
    setIsOpen(true);
    translateX.setValue(-520);
    Animated.spring(translateX, {
      bounciness: 0,
      speed: 18,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };
  const closeBanner = () => {
    Animated.timing(translateX, {
      duration: 220,
      toValue: -520,
      useNativeDriver: true,
    }).start(() => setIsOpen(false));
  };
  const openNotification = (notification: AppNotificationRecord) => {
    if (!notification.readAt) void markRead.mutateAsync(notification.id);
    closeBanner();
    router.push((notification.data.route ?? '/agenda') as never);
  };

  if (!session) return null;
  return (
    <>
      <Pressable
        accessibilityLabel={
          unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'
        }
        accessibilityRole="button"
        onPress={openBanner}
        style={[styles.trigger, { top: insets.top + 14 }]}
      >
        <Ionicons color="#B47D17" name="notifications-outline" size={24} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.borderDotOrbit,
            { transform: [{ rotate: borderDotRotation }] },
          ]}
        >
          <View style={styles.borderDot} />
        </Animated.View>
        {unread ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
      <Modal
        animationType="none"
        navigationBarTranslucent
        onRequestClose={closeBanner}
        statusBarTranslucent
        transparent
        visible={isOpen}
      >
        <View style={styles.modal}>
          <Pressable
            accessibilityLabel="Cerrar notificaciones"
            onPress={closeBanner}
            style={styles.backdrop}
          />
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.banner,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                paddingTop: insets.top + 14,
                transform: [{ translateX }],
              },
            ]}
          >
            <View style={styles.header}>
              <View>
                <Text accessibilityRole="header" style={styles.title}>
                  Notificaciones
                </Text>
                <Text style={styles.subtitle}>
                  {unread ? `${unread} sin leer` : 'Todo al día'}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel="Marcar todas como leídas"
                  disabled={!unread || markAll.isPending}
                  onPress={() => void markAll.mutateAsync()}
                  style={[styles.readAll, !unread && styles.disabled]}
                >
                  <Text style={styles.readAllText}>Leer todas</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Cerrar"
                  onPress={closeBanner}
                  style={styles.close}
                >
                  <Ionicons color="#101c2d" name="close" size={22} />
                </Pressable>
              </View>
            </View>
            <ScrollView
              contentContainerStyle={styles.list}
              overScrollMode="never"
              showsVerticalScrollIndicator={false}
            >
              {query.isLoading ? (
                <Text style={styles.state}>Cargando notificaciones…</Text>
              ) : null}
              {query.isError ? (
                <Text style={styles.state}>
                  No pudimos cargar las notificaciones.
                </Text>
              ) : null}
              {!query.isLoading && !query.isError && !notifications.length ? (
                <View style={styles.empty}>
                  <Ionicons
                    color="#747b85"
                    name="notifications-off-outline"
                    size={34}
                  />
                  <Text style={styles.emptyTitle}>Sin novedades</Text>
                  <Text style={styles.state}>
                    Aquí verás reservas, cancelaciones y cambios de horario.
                  </Text>
                </View>
              ) : null}
              {notifications.map((notification) => (
                <Pressable
                  key={notification.id}
                  onPress={() => openNotification(notification)}
                  style={[
                    styles.item,
                    !notification.readAt && styles.itemUnread,
                  ]}
                >
                  <View style={styles.itemIcon}>
                    <Ionicons
                      color="#101c2d"
                      name={
                        notification.type === 'appointment_cancelled'
                          ? 'close-circle-outline'
                          : notification.type === 'appointment_rescheduled'
                            ? 'calendar-outline'
                            : 'calendar-sharp'
                      }
                      size={20}
                    />
                  </View>
                  <View style={styles.itemCopy}>
                    <View style={styles.itemHeading}>
                      <Text style={styles.itemTitle}>{notification.title}</Text>
                      {!notification.readAt ? (
                        <View style={styles.dot} />
                      ) : null}
                    </View>
                    <Text style={styles.itemBody}>{notification.body}</Text>
                    <Text style={styles.date}>
                      {relativeDate(notification.createdAt)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#B47D17',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    minWidth: 22,
    position: 'absolute',
    right: -8,
    top: 15,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  borderDot: {
    backgroundColor: '#B47D17',
    borderRadius: 3,
    height: 6,
    left: '50%',
    marginLeft: -3,
    position: 'absolute',
    top: -3,
    width: 6,
  },
  borderDotOrbit: {
    height: 52,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 52,
    zIndex: 2,
  },
  banner: {
    backgroundColor: appTheme.colors.surfaceElevated,
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    position: 'absolute',
    ...goldShadow,
    top: 0,
    width: '88%',
  },
  close: {
    alignItems: 'center',
    backgroundColor: '#EEF0F2',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  date: { color: '#747b85', fontSize: 12, fontWeight: '700', marginTop: 8 },
  disabled: { opacity: 0.35 },
  dot: { backgroundColor: '#101c2d', borderRadius: 5, height: 9, width: 9 },
  empty: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 17,
    gap: 10,
    marginTop: 42,
    padding: 28,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  emptyTitle: { color: '#101c2d', fontSize: 18, fontWeight: '900' },
  header: {
    alignItems: 'center',
    borderBottomColor: '#E4E6E8',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 17,
  },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  item: {
    backgroundColor: '#F8F8F7',
    borderColor: '#E4E5E7',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 13,
  },
  itemBody: { color: '#59606A', fontSize: 14, lineHeight: 20, marginTop: 2 },
  itemCopy: { flex: 1 },
  itemHeading: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  itemIcon: {
    alignItems: 'center',
    backgroundColor: '#E5E7E9',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  itemTitle: { color: '#101c2d', flex: 1, fontSize: 15, fontWeight: '900' },
  itemUnread: { backgroundColor: '#ECEEF0', borderColor: '#BBC0C6' },
  list: { gap: 10, paddingBottom: 24, paddingTop: 18 },
  modal: { flex: 1 },
  readAll: { padding: 6 },
  readAllText: { color: '#101c2d', fontSize: 12, fontWeight: '900' },
  state: {
    color: '#69717C',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  subtitle: { color: '#747b85', fontSize: 13, marginTop: 2 },
  title: { color: '#101c2d', fontSize: 23, fontWeight: '900' },
  trigger: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    elevation: 16,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    shadowColor: '#B47D17',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    width: 52,
    zIndex: 9999,
  },
});
