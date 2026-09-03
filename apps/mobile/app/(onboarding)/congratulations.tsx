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
import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { accountQueryKey, accountQueryPrefix } from '../../src/lib/query-keys';
import { BookingLinkSheet } from '../../src/components/BookingLinkSheet';
import { useAuth } from '../../src/providers/AuthProvider';
import { useGuides } from '../../src/features/guides/GuideProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const congratulationsImage = require('../../assets/Felicidadez.png') as number;

export default function CongratulationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const { enableFirstStepsInvitation } = useGuides();
  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
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
      enableFirstStepsInvitation();
      queryClient.setQueryData<OnboardingAccountDetailsResponse>(
        accountQueryKey(user?.id, 'onboarding-account-details'),
        (profile) =>
          profile
            ? {
                ...profile,
                onboardingCompletedAt: result.onboardingCompletedAt,
              }
            : profile,
      );
      await queryClient.invalidateQueries({
        queryKey: accountQueryPrefix('current-organization'),
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
          <Ionicons
            color={appTheme.colors.text}
            name="arrow-forward"
            size={21}
          />
        </Pressable>

        <View style={styles.linkBox}>
          <Ionicons
            color={appTheme.colors.text}
            name="link-outline"
            size={22}
          />
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
          foregroundColor={appTheme.colors.accentDark}
          icon="share-social-outline"
          label="Compartir enlace"
          onPress={() => void shareBookingUrl()}
          style={styles.shareButton}
          variant="outline"
        />
        <NavaButton
          foregroundColor={appTheme.colors.accentDark}
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
          variant="outline"
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
    color: appTheme.colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 500,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: appTheme.colors.surfaceElevated,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  helpLabel: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  helpRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 26,
    minHeight: 62,
    paddingHorizontal: 17,
    width: '100%',
  },
  homeButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 0,
    height: 58,
    minWidth: 0,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  illustration: {
    aspectRatio: 1.45,
    marginBottom: 4,
    maxHeight: 320,
    width: '108%',
  },
  linkBox: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    minHeight: 74,
    paddingHorizontal: 15,
    width: '100%',
  },
  linkValue: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  openLabel: { color: appTheme.colors.text, fontSize: 14, fontWeight: '900' },
  screen: appStyles.screen,
  shareButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 0,
    height: 58,
    minWidth: 0,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 4,
    textAlign: 'center',
  },
});
