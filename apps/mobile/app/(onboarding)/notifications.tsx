import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppNotificationRecord,
  AppNotificationsResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { notificationDestination } from '../../src/lib/notification-navigation';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

function relativeDate(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60_000),
  );
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return new Date(value).toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'short',
  });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const organizationQuery = useCurrentOrganization();
  const tenant = useTenantScope();
  const query = useQuery({
    queryFn: () =>
      requireApiClient().request<AppNotificationsResponse>('/v1/notifications'),
    queryKey: tenant.key('notifications'),
    refetchInterval: 15_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) =>
      requireApiClient().request(`/v1/notifications/${id}/read`, {
        method: 'POST',
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('notifications'),
      }),
  });
  const markAllRead = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/notifications/read-all', {
        method: 'POST',
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('notifications'),
      }),
  });
  const open = (notification: AppNotificationRecord) => {
    if (!notification.readAt) void markRead.mutateAsync(notification.id);
    const destination = notificationDestination(
      notification.data,
      organizationQuery.data?.membership.role,
    );
    if (destination) router.push(destination as never);
  };
  const unread =
    query.data?.notifications.filter((notification) => !notification.readAt)
      .length ?? 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/dashboard')
          }
          style={styles.back}
        >
          <Ionicons color="#101c2d" name="chevron-back" size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Notificaciones
          </Text>
          <Text style={styles.subtitle}>
            {unread ? `${unread} sin leer` : 'Todo al día'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Marcar todas como leídas"
          disabled={!unread || markAllRead.isPending}
          onPress={() => void markAllRead.mutateAsync()}
          style={[styles.allRead, !unread && styles.disabled]}
        >
          <Text style={styles.allReadText}>Marcar leídas</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {query.isLoading ? (
          <Text style={styles.empty}>Cargando notificaciones…</Text>
        ) : null}
        {query.isError ? (
          <Text style={styles.empty}>
            No pudimos cargar tus notificaciones.
          </Text>
        ) : null}
        {!query.isLoading &&
        !query.isError &&
        !query.data?.notifications.length ? (
          <View style={styles.emptyCard}>
            <Ionicons
              color="#70757f"
              name="notifications-off-outline"
              size={34}
            />
            <Text style={styles.emptyTitle}>Aún no hay notificaciones</Text>
            <Text style={styles.empty}>
              Aquí verás las reservas nuevas, cancelaciones y reprogramaciones.
            </Text>
          </View>
        ) : null}
        {query.data?.notifications.map((notification) => (
          <Pressable
            key={notification.id}
            onPress={() => open(notification)}
            style={[styles.item, !notification.readAt && styles.unread]}
          >
            <View style={styles.icon}>
              <Ionicons
                color="#101c2d"
                name={
                  notification.type === 'appointment_cancelled'
                    ? 'close-circle-outline'
                    : notification.type === 'appointment_rescheduled'
                      ? 'calendar-outline'
                      : 'calendar-sharp'
                }
                size={22}
              />
            </View>
            <View style={styles.itemCopy}>
              <View style={styles.itemTop}>
                <Text style={styles.itemTitle}>{notification.title}</Text>
                {!notification.readAt ? <View style={styles.dot} /> : null}
              </View>
              <Text style={styles.body}>{notification.body}</Text>
              <Text style={styles.date}>
                {relativeDate(notification.createdAt)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  allRead: { padding: 8 },
  allReadText: { color: '#101c2d', fontSize: 13, fontWeight: '800' },
  back: {
    alignItems: 'center',
    backgroundColor: '#eef0f2',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  body: { color: '#565c66', fontSize: 14, lineHeight: 20, marginTop: 3 },
  content: { gap: 10, padding: 20, paddingBottom: 38 },
  date: { color: '#747b85', fontSize: 12, fontWeight: '700', marginTop: 9 },
  disabled: { opacity: 0.35 },
  dot: { backgroundColor: '#101c2d', borderRadius: 5, height: 9, width: 9 },
  empty: {
    color: '#69717c',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#f2f3f4',
    borderRadius: 22,
    gap: 12,
    marginTop: 48,
    padding: 30,
  },
  emptyTitle: { color: '#101c2d', fontSize: 18, fontWeight: '900' },
  header: {
    alignItems: 'center',
    borderBottomColor: '#e5e6e8',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 20,
  },
  headerCopy: { flex: 1 },
  icon: {
    alignItems: 'center',
    backgroundColor: '#e5e7e9',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  item: {
    backgroundColor: '#f7f7f6',
    borderColor: '#e3e4e6',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  itemCopy: { flex: 1 },
  itemTitle: { color: '#101c2d', flex: 1, fontSize: 15, fontWeight: '900' },
  itemTop: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  screen: { backgroundColor: '#fff', flex: 1 },
  subtitle: { color: '#747b85', fontSize: 13, marginTop: 2 },
  title: { color: '#101c2d', fontSize: 23, fontWeight: '900' },
  unread: { backgroundColor: '#eceef0', borderColor: '#bbc0c6' },
});
