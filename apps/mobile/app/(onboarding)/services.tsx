import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { NavaButton } from '../../src/components/NavaButton';
import {
  type ServiceDraft,
  ServiceFormSheet,
} from '../../src/components/ServiceFormSheet';
import { useAuth } from '../../src/providers/AuthProvider';
import { requireApiClient } from '../../src/lib/api';
import { accountQueryKey, accountQueryPrefix } from '../../src/lib/query-keys';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const servicesImage = require('../../assets/imagenServicios.png') as number;

interface StoredService extends ServiceDraft {
  readonly id: string;
}

export default function ServicesOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 850;
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [editingService, setEditingService] = useState<StoredService | null>(
    null,
  );
  const [requestError, setRequestError] = useState<string | null>(null);
  const servicesQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<{
        readonly services: readonly StoredService[];
      }>('/v1/onboarding/services'),
    queryKey: accountQueryKey(user?.id, 'onboarding-services'),
  });
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
  });
  const services = servicesQuery.data?.services ?? [];
  const isSolo = accountQuery.data?.accountType === 'professional';

  if (!session) return <Redirect href="/(auth)/login" />;

  const saveService = async (service: ServiceDraft) => {
    setRequestError(null);
    if (editingService)
      await requireApiClient().request(
        `/v1/onboarding/services/${editingService.id}`,
        { body: service, method: 'PATCH' },
      );
    else
      await requireApiClient().request('/v1/onboarding/services', {
        body: service,
        method: 'POST',
      });
    await queryClient.invalidateQueries({
      queryKey: accountQueryPrefix('onboarding-services'),
    });
    setEditingService(null);
    setServiceSheetOpen(false);
  };
  const deleteService = async (service: StoredService) => {
    setRequestError(null);
    await requireApiClient().request<void>(
      `/v1/onboarding/services/${service.id}`,
      { method: 'DELETE' },
    );
    await queryClient.invalidateQueries({
      queryKey: accountQueryPrefix('onboarding-services'),
    });
    setEditingService(null);
    setServiceSheetOpen(false);
  };

  return (
    <SafeAreaView edges={['left', 'right', 'top']} style={styles.screen}>
      <StatusBar style="dark" />

      <View pointerEvents="none" style={styles.background}>
        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          compact ? styles.contentCompact : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Regresar"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/(onboarding)/account-setup')
          }
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={23}
          />
          <Text style={styles.backLabel}>Regresar</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Configura tu cuenta</Text>

          <View
            accessibilityLabel="Paso 1 de 3"
            accessibilityRole="progressbar"
            style={styles.progress}
          >
            <View style={styles.activeStep} />
            <View style={styles.step} />
            <View style={styles.step} />
          </View>
        </View>

        <View style={styles.main}>
          <Image
            accessibilityLabel="Cliente de barbería rodeado de herramientas profesionales"
            resizeMode="contain"
            source={servicesImage}
            style={[
              styles.illustration,
              compact ? styles.illustrationCompact : null,
              {
                height: Math.min(Math.max(height * 0.32, 210), 320),
                maxWidth: Math.min(width - 12, 620),
              },
            ]}
          />

          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>
              {isSolo
                ? 'Crea tus servicios'
                : 'Crea los servicios de tu negocio'}
            </Text>
            <Text style={styles.description}>
              {isSolo
                ? 'Configura lo que ofrecerás, indicando duración y precio para que tus clientes puedan reservar.'
                : 'Configura los servicios que ofrecerá tu equipo, indicando duración y precio para que tus clientes puedan reservarlos.'}
            </Text>
          </View>

          <NavaButton
            compact={width < 390}
            foregroundColor={appTheme.colors.accentDark}
            icon="cut-outline"
            label={
              services.length > 0 ? 'Añadir otro servicio' : 'Añadir servicio'
            }
            onPress={() => {
              setEditingService(null);
              setServiceSheetOpen(true);
            }}
            style={styles.actionButton}
            variant="outline"
          />
          {requestError || servicesQuery.error ? (
            <Text accessibilityRole="alert" style={styles.requestError}>
              {requestError ??
                (servicesQuery.error instanceof Error
                  ? servicesQuery.error.message
                  : 'No fue posible cargar los servicios.')}
            </Text>
          ) : null}
          {servicesQuery.isPending ? (
            <Text style={styles.savedLabel}>Cargando servicios…</Text>
          ) : null}
          {services.map((service) => (
            <View key={service.id} style={styles.serviceRow}>
              <View
                style={[
                  styles.serviceColor,
                  { backgroundColor: service.agendaColor },
                ]}
              />
              <View style={styles.serviceCopy}>
                <Text numberOfLines={1} style={styles.serviceName}>
                  {service.name}
                </Text>
                <Text numberOfLines={1} style={styles.serviceMeta}>
                  {service.durationMinutes} min ·{' '}
                  {service.priceType === 'free'
                    ? 'Gratis'
                    : `$${service.price.toFixed(2)}`}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Editar ${service.name}`}
                onPress={() => {
                  setEditingService(service);
                  setServiceSheetOpen(true);
                }}
                style={styles.editButton}
              >
                <Ionicons color="#101c2d" name="pencil-outline" size={20} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Eliminar ${service.name}`}
                onPress={() =>
                  Alert.alert(
                    'Eliminar servicio',
                    `¿Quieres eliminar ${service.name}? Esta acción no se puede deshacer.`,
                    [
                      { style: 'cancel', text: 'Cancelar' },
                      {
                        onPress: () => void deleteService(service),
                        style: 'destructive',
                        text: 'Eliminar',
                      },
                    ],
                  )
                }
                style={styles.deleteIconButton}
              >
                <Ionicons color="#bd2d2d" name="trash-outline" size={20} />
              </Pressable>
            </View>
          ))}
          {services.length > 0 ? (
            <Text style={styles.savedLabel}>
              {services.length}{' '}
              {services.length === 1
                ? 'servicio añadido'
                : 'servicios añadidos'}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <NavaButton
          disabled={services.length === 0}
          foregroundColor={appTheme.colors.accentDark}
          icon="arrow-forward-outline"
          label="Siguiente"
          onPress={() => router.push('/(onboarding)/congratulations')}
          style={styles.nextButton}
          variant="outline"
        />
      </View>

      <ServiceFormSheet
        key={
          editingService?.id ??
          (serviceSheetOpen ? 'new-service' : 'closed-service')
        }
        initialValue={editingService}
        onClose={() => setServiceSheetOpen(false)}
        onSave={saveService}
        visible={serviceSheetOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activeStep: {
    backgroundColor: appTheme.colors.accent,
    borderRadius: 6,
    height: 10,
    width: 31,
  },
  actionButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 'auto',
    flexGrow: 0,
    height: 56,
    marginTop: 14,
    transform: [{ translateY: -3 }],
    width: '100%',
    ...goldButtonShadow,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  backLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '800',
  },
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  bottomGlow: {
    backgroundColor: appTheme.colors.accentSubtle,
    borderRadius: 260,
    bottom: -220,
    height: 430,
    left: -220,
    position: 'absolute',
    width: 430,
  },
  completedStep: {
    backgroundColor: appTheme.colors.accentLight,
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 640,
    paddingBottom: 10,
    paddingHorizontal: 24,
    paddingTop: 18,
    width: '100%',
  },
  contentCompact: {
    paddingBottom: 12,
    paddingTop: 10,
  },
  copy: {
    alignItems: 'center',
    marginTop: 4,
  },
  description: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 7,
    maxWidth: 490,
    textAlign: 'center',
  },
  eyebrow: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  footer: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    flexShrink: 0,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  illustration: {
    height: 320,
    width: '108%',
  },
  illustrationCompact: {
    height: 250,
  },
  main: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  nextButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 'auto',
    flexGrow: 0,
    height: 56,
    transform: [{ translateY: -3 }],
    width: '100%',
    ...goldButtonShadow,
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  savedLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  deleteIconButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  requestError: {
    color: '#bd283c',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  serviceColor: { borderRadius: 999, height: 14, width: 14 },
  serviceCopy: { flex: 1, gap: 2 },
  serviceMeta: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  serviceName: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  serviceRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  screen: appStyles.screen,
  step: {
    backgroundColor: appTheme.colors.border,
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 32,
    maxWidth: 470,
    textAlign: 'center',
  },
  topGlow: {
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 260,
    height: 420,
    position: 'absolute',
    right: -230,
    top: -180,
    width: 420,
  },
});
