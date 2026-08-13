import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReviewRecord, ReviewsResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { appStyles, appTheme, goldButtonShadow } from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ReviewsManagementScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const reviewsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ReviewsResponse>('/v1/reviews'),
    queryKey: ['reviews'],
  });
  const changeVisibility = useMutation({
    mutationFn: ({
      isVisible,
      reviewId,
    }: {
      isVisible: boolean;
      reviewId: string;
    }) =>
      requireApiClient().request<{ review: ReviewRecord }>(
        `/v1/reviews/${reviewId}/visibility`,
        { body: { isVisible }, method: 'PATCH' },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos actualizar la reseña',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/dashboard')
        }
        style={styles.back}
      >
          <Ionicons color="#111827" name="arrow-back" size={23} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Reseñas</Text>
          <Text style={styles.headerSubtitle}>
            Publicadas automáticamente después de citas completadas
          </Text>
        </View>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {(reviewsQuery.data?.reviews ?? []).map((review) => (
          <View key={review.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.client}>{review.clientName}</Text>
                <Text style={styles.professional}>
                  {review.professionalName}
                </Text>
              </View>
              <Text style={styles.stars}>{'★'.repeat(review.rating)}</Text>
            </View>
            <Text style={styles.comment}>
              {review.comment || 'Sin comentario.'}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.status}>
                {review.isVisible ? 'Visible públicamente' : 'Oculta'}
              </Text>
              <Pressable
                disabled={changeVisibility.isPending}
                onPress={() =>
                  changeVisibility.mutate({
                    isVisible: !review.isVisible,
                    reviewId: review.id,
                  })
                }
                style={styles.toggle}
              >
                <Ionicons
                  color="#111827"
                  name={review.isVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                />
                <Text style={styles.toggleText}>
                  {review.isVisible ? 'Ocultar' : 'Mostrar'}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
        {reviewsQuery.isLoading ? (
          <Text style={styles.empty}>Cargando reseñas...</Text>
        ) : null}
        {!reviewsQuery.isLoading &&
        !(reviewsQuery.data?.reviews.length ?? 0) ? (
          <Text style={styles.empty}>
            Aún no existen reseñas de citas completadas.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  card: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  cardFooter: {
    alignItems: 'center',
    borderTopColor: appTheme.colors.surfaceMuted,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  client: { color: appTheme.colors.text, fontSize: 15, fontWeight: '900' },
  comment: { color: appTheme.colors.textMuted, lineHeight: 21, marginTop: 13 },
  content: { padding: 20 },
  empty: {
    color: appTheme.colors.textMuted,
    lineHeight: 21,
    padding: 30,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderBottomColor: appTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: 14,
  },
  headerCopy: { flex: 1 },
  headerSubtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  headerTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  professional: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 3 },
  screen: appStyles.screen,
  spacer: { width: 40 },
  stars: { color: appTheme.colors.text, fontSize: 16, letterSpacing: 2 },
  status: { color: appTheme.colors.textMuted, fontSize: 12 },
  toggle: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 999,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  toggleText: { color: appTheme.colors.text, fontSize: 12, fontWeight: '800' },
});
