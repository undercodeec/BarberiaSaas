import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavaButton } from '../../src/components/NavaButton';
import { requireApiClient } from '../../src/lib/api';
import { BookingLinkSheet } from '../../src/components/BookingLinkSheet';
import { useAuth } from '../../src/providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const congratulationsImage = require('../../assets/Felicidadez.png') as number;

export default function CongratulationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });

  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false);
  const bookingUrl = profileQuery.data?.bookingUrl ?? '';

  const completeOnboardingMutation = useMutation({
    mutationFn: () =>
      requireApiClient().request<{ readonly onboardingCompletedAt: string }>(
        '/v1/onboarding/complete-account-setup',
        { method: 'POST' },
      ),
    onSuccess: async (result) => {
      queryClient.setQueryData<OnboardingAccountDetailsResponse>(
        ['onboarding-account-details', user?.id],
        (profile) =>
          profile
            ? {
                ...profile,
                onboardingCompletedAt: result.onboardingCompletedAt,
              }
            : profile,
      );
      await queryClient.invalidateQueries({
        queryKey: ['current-organization'],
      });
      router.replace('/dashboard' as never);
    },
  });

  const shareBookingUrl = async () => {
    if (!bookingUrl) return;
    try {
      await Share.share({
        message: bookingUrl,
        title: 'Mi enlace de reservas',
      });
    } catch {
      await Clipboard.setStringAsync(bookingUrl);
      Alert.alert(
        'Enlace copiado',
        'Puedes pegarlo y compartirlo donde prefieras.',
      );
    }
  };

  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right', 'top']}
      style={styles.screen}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Image
          accessibilityLabel="Equipo de profesionales de barber?a celebrando"
          resizeMode="contain"
          source={congratulationsImage}
          style={styles.illustration}
        />

        <Text accessibilityRole="header" style={styles.title}>
          {'\u00a1Felicitaciones!'}
        </Text>
        <Text style={styles.copy}>
          {
            'Has completado tus primeros pasos para empezar a utilizar tu nueva herramienta, dise?ada para potenciar tus ventas y reservas.'
          }
        </Text>
        <Text style={styles.copy}>
          {
            'Aqu? tienes tu enlace de reservas para compartirlo en tus redes sociales.'
          }
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              'Instagram',
              'Agrega este enlace en el campo Sitio web de tu perfil de Instagram.',
            )
          }
          style={styles.helpRow}
        >
          <Text style={styles.helpLabel}>
            {'¿Como configurar el enlace en Instagram?'}
          </Text>
          <Ionicons color="#101c2d" name="arrow-forward" size={21} />
        </Pressable>

        <View style={styles.linkBox}>
          <Ionicons color="#101c2d" name="link-outline" size={22} />
          <Text numberOfLines={2} style={styles.linkValue}>
            {bookingUrl || 'Preparando tu enlace de reservas?'}
          </Text>
          <Pressable
            accessibilityLabel="Abrir enlace de reservas"
            accessibilityRole="button"
            disabled={!bookingUrl}
            onPress={() => setIsBookingSheetOpen(true)}
            style={styles.openButton}
          >
            <Text style={styles.openLabel}>Abrir</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BookingLinkSheet
        onClose={() => setIsBookingSheetOpen(false)}
        url={bookingUrl}
        visible={isBookingSheetOpen}
      />
      <View style={styles.footer}>
        <NavaButton
          disabled={!bookingUrl}
          icon="share-social-outline"
          label="Compartir enlace"
          onPress={() => void shareBookingUrl()}
          style={styles.shareButton}
          variant="outline"
        />
        <NavaButton
          icon="home-outline"
          label="Ir al inicio"
          disabled={completeOnboardingMutation.isPending}
          onPress={() =>
            completeOnboardingMutation.mutate(undefined, {
              onError: () =>
                Alert.alert(
                  'No pudimos finalizar la configuraci\u00f3n',
                  'Revisa tu conexi\u00f3n e int\u00e9ntalo nuevamente.',
                ),
            })
          }
          style={styles.homeButton}
          variant="primary"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  copy: {
    color: '#667080',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 500,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: '#f9fbff',
    borderTopColor: '#e1e8f4',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  helpLabel: {
    color: '#101c2d',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  helpRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d9dde3',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 26,
    minHeight: 62,
    paddingHorizontal: 17,
    width: '100%',
  },
  homeButton: { flexBasis: 0, height: 58, minWidth: 0 },
  illustration: {
    aspectRatio: 1.45,
    marginBottom: 4,
    maxHeight: 320,
    width: '108%',
  },
  linkBox: {
    alignItems: 'center',
    backgroundColor: '#e8f0ff',
    borderColor: '#d3e0f6',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    minHeight: 74,
    paddingHorizontal: 15,
    width: '100%',
  },
  linkValue: { color: '#101c2d', flex: 1, fontSize: 14, fontWeight: '700' },
  openButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  openLabel: { color: '#101c2d', fontSize: 14, fontWeight: '900' },
  screen: { backgroundColor: '#f9fbff', flex: 1 },
  shareButton: { flexBasis: 0, height: 58, minWidth: 0 },
  title: {
    color: '#101c2d',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 4,
    textAlign: 'center',
  },
});
