/* eslint-disable react-hooks/set-state-in-effect -- Effects coordinate persisted prompts, permissions, focus, and modal state with external APIs. */
import { styles } from '../../src/features/screens/dashboard.styles';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentsResponse,
  CashRegisterSummaryResponse,
  CurrentCashRegisterResponse,
  GoogleMapsLocationCandidate,
  InventoryResponse,
  OnboardingAccountDetailsResponse,
  SubscriptionResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';

import {
  appTheme,
  BottomNavigation,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { BookingLinkSheet } from '../../src/components/BookingLinkSheet';
import { BusinessLocationSheet } from '../../src/components/BusinessLocationSheet';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { useAuth } from '../../src/providers/AuthProvider';
import { accountQueryKey } from '../../src/lib/query-keys';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

import {
  DASHBOARD_BANNER_DELAY_MS,
  LOCATION_BANNER_DELAY_MS,
  type WelcomeSurveyOption,
  type ExtraQuickActionId,
  EXTRA_QUICK_ACTIONS,
  getExtraQuickActionIds,
  storeExtraQuickActionIds,
  getWelcomeSurveyResponse,
  storeWelcomeSurveyResponse,
  markWelcomeSurveyDismissed,
  shouldShowWelcomeSurvey,
  syncPushToken,
  greeting,
  subscriptionProgress,
  subscriptionNotice,
  dateInTimeZone,
  dashboardOperations,
} from '../../src/features/screens/dashboard-model';
import {
  DashboardProgress,
  QuickAction,
  DashboardOperationCard,
  ExtraQuickActionsSheet,
  OpenButtonFlare,
  NotificationPermissionSheet,
  WelcomeSurveySheet,
} from '../../src/features/screens/dashboard-components';

export default function DashboardScreen() {
  const router = useRouter();
  const layout = useNativeLayoutMetrics();
  const { session, user } = useAuth();
  const tenant = useTenantScope();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
  });
  const organizationQuery = useCurrentOrganization();
  const canAccessFinancialReports =
    organizationQuery.data?.membership.role === 'owner' ||
    organizationQuery.data?.membership.role === 'manager';
  const subscriptionQuery = useQuery({
    enabled: Boolean(session && user),
    queryFn: () =>
      requireApiClient().request<SubscriptionResponse>('/v1/subscription'),
    queryKey: accountQueryKey(user?.id, 'subscription'),
    refetchInterval: 60_000,
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const inventoryEnabled =
    subscriptionQuery.data?.current.featureFlags.inventory ?? true;
  const teamEnabled = subscriptionQuery.data?.current.featureFlags.team ?? true;
  const operationTimeZone =
    organizationQuery.data?.location?.timezone ??
    organizationQuery.data?.organization?.defaultTimezone ??
    'America/Guayaquil';
  const operationLocationId = organizationQuery.data?.location?.id;
  const operationDate = dateInTimeZone(operationTimeZone);
  const appointmentsQuery = useQuery({
    enabled: Boolean(session && operationLocationId),
    queryFn: () =>
      requireApiClient().request<AppointmentsResponse>(
        `/v1/appointments?date=${operationDate}&locationId=${encodeURIComponent(operationLocationId ?? '')}`,
      ),
    queryKey: tenant.key('agenda-appointments', 'dashboard', operationDate),
  });
  const cashRegisterQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentCashRegisterResponse>(
        '/v1/cash-register/current',
      ),
    queryKey: tenant.key('cash-register-current'),
  });
  const cashSummaryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CashRegisterSummaryResponse>(
        '/v1/cash-register/summary',
      ),
    queryKey: tenant.key('cash-register-summary'),
  });
  const inventoryQuery = useQuery({
    enabled: Boolean(session && inventoryEnabled),
    queryFn: () =>
      requireApiClient().request<InventoryResponse>('/v1/inventory'),
    queryKey: tenant.key('inventory'),
  });

  const businessName = accountQuery.data?.businessName ?? 'Tu negocio';
  const [progressClock, setProgressClock] = useState(() => Date.now());
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
  const [
    notificationPermissionCanAskAgain,
    setNotificationPermissionCanAskAgain,
  ] = useState(true);
  const notificationPromptHandledForUserRef = useRef<string | null>(null);
  const [notificationFlowState, setNotificationFlowState] = useState<
    'checking' | 'visible' | 'completed'
  >('checking');
  const [needsWelcomeSurvey, setNeedsWelcomeSurvey] = useState<boolean | null>(
    null,
  );
  const [isWelcomeSurveyOpen, setIsWelcomeSurveyOpen] = useState(false);
  const [needsLocationBanner, setNeedsLocationBanner] = useState<
    boolean | null
  >(null);
  const [isLocationBannerOpen, setIsLocationBannerOpen] = useState(false);
  const [isDashboardFocused, setIsDashboardFocused] = useState(false);
  const [extraQuickActionIds, setExtraQuickActionIds] = useState<
    ExtraQuickActionId[]
  >([]);
  const [isQuickActionsPickerOpen, setIsQuickActionsPickerOpen] =
    useState(false);
  const rawBookingUrl = accountQuery.data?.bookingUrl?.trim() ?? '';
  const isSolo = accountQuery.data?.accountType === 'professional';
  const bookingUrl = /^https?:\/\/\S+$/i.test(rawBookingUrl)
    ? rawBookingUrl
    : '';
  const shouldShowWelcome =
    accountQuery.isSuccess && !accountQuery.data?.onboardingCompletedAt;
  const extraQuickActions = EXTRA_QUICK_ACTIONS.filter(
    (action) =>
      extraQuickActionIds.includes(action.id) &&
      (!isSolo || action.id !== 'collaborators'),
  );
  const planProgress = subscriptionProgress(
    subscriptionQuery.data,
    progressClock,
    subscriptionQuery.isError,
  );
  const planRenewalNotice = subscriptionNotice(
    planProgress,
    subscriptionQuery.data,
  );
  const operations = useMemo(
    () =>
      dashboardOperations({
        appointments: appointmentsQuery.data?.appointments,
        cashSession: cashRegisterQuery.data?.session,
        cashSummary: cashSummaryQuery.data,
        currencyCode:
          organizationQuery.data?.location?.currencyCode ??
          organizationQuery.data?.organization?.currencyCode ??
          'USD',
        inventory: inventoryQuery.data,
        now: progressClock,
        timeZone: operationTimeZone,
      }),
    [
      appointmentsQuery.data?.appointments,
      cashRegisterQuery.data?.session,
      cashSummaryQuery.data,
      inventoryQuery.data,
      operationTimeZone,
      organizationQuery.data?.location?.currencyCode,
      organizationQuery.data?.organization?.currencyCode,
      progressClock,
    ],
  );

  useEffect(() => {
    const timer = setInterval(() => setProgressClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsDashboardFocused(true);
      return () => setIsDashboardFocused(false);
    }, []),
  );

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      void Promise.resolve().then(() => {
        if (isMounted) setExtraQuickActionIds([]);
      });
      return () => {
        isMounted = false;
      };
    }

    void getExtraQuickActionIds(user.id).then((actionIds) => {
      if (isMounted) setExtraQuickActionIds(actionIds);
    });

    return () => {
      isMounted = false;
    };
  }, [user]);
  useEffect(() => {
    let isMounted = true;
    let notificationPromptTimer: ReturnType<typeof setTimeout> | null = null;
    setNotificationFlowState('checking');
    setIsNotificationSheetOpen(false);

    if (!isDashboardFocused) {
      return () => {
        isMounted = false;
      };
    }

    // Expo Web can report the browser permission as undetermined after a
    // refresh or sign-out. Push registration is native-only, so do not start
    // the permission flow in the web build.
    if (Platform.OS === 'web') {
      setNotificationFlowState('completed');
      return () => {
        isMounted = false;
      };
    }

    if (!session || !user) {
      setNotificationFlowState('completed');
      return () => {
        isMounted = false;
      };
    }

    if (notificationPromptHandledForUserRef.current === user.id) {
      setNotificationFlowState('completed');
      return () => {
        isMounted = false;
      };
    }

    const checkNotificationPermission = async () => {
      try {
        const { canAskAgain, status } =
          await Notifications.getPermissionsAsync();
        if (isMounted) {
          const shouldRequestPermission =
            status !== Notifications.PermissionStatus.GRANTED;

          if (shouldRequestPermission) {
            setNotificationPermissionCanAskAgain(canAskAgain);
            notificationPromptTimer = setTimeout(() => {
              if (!isMounted) return;
              setIsNotificationSheetOpen(true);
              setNotificationFlowState('visible');
            }, DASHBOARD_BANNER_DELAY_MS);
            return;
          }

          setIsNotificationSheetOpen(false);
          setNotificationFlowState('completed');
          if (status === Notifications.PermissionStatus.GRANTED)
            void syncPushToken();
        }
      } catch {
        // Some development environments do not expose native notifications.
        if (isMounted) setNotificationFlowState('completed');
      }
    };

    void checkNotificationPermission();

    return () => {
      isMounted = false;
      if (notificationPromptTimer) clearTimeout(notificationPromptTimer);
    };
  }, [isDashboardFocused, session, user]);

  useEffect(() => {
    let isMounted = true;
    setNeedsWelcomeSurvey(null);
    setIsWelcomeSurveyOpen(false);

    const checkWelcomeSurvey = async () => {
      if (!user) return;
      try {
        const response = await getWelcomeSurveyResponse(user.id);
        if (isMounted) {
          setNeedsWelcomeSurvey(
            shouldShowWelcomeSurvey(response, session?.expiresAt ?? null),
          );
        }
      } catch {
        if (isMounted) setNeedsWelcomeSurvey(true);
      }
    };

    if (session && user) void checkWelcomeSurvey();

    return () => {
      isMounted = false;
    };
  }, [session, user]);

  useEffect(() => {
    if (
      notificationFlowState === 'completed' &&
      needsWelcomeSurvey &&
      !needsLocationBanner
    ) {
      setIsWelcomeSurveyOpen(true);
    }
  }, [needsLocationBanner, needsWelcomeSurvey, notificationFlowState]);

  useEffect(() => {
    setNeedsLocationBanner(null);
    setIsLocationBannerOpen(false);

    if (!session || !user || !accountQuery.isSuccess) return;
    const location = accountQuery.data?.businessLocation;
    const hasCompleteLocation =
      Boolean(location?.formattedAddress?.trim()) &&
      typeof location?.latitude === 'number' &&
      Number.isFinite(location.latitude) &&
      typeof location.longitude === 'number' &&
      Number.isFinite(location.longitude);
    setNeedsLocationBanner(!hasCompleteLocation);
  }, [
    accountQuery.data?.businessLocation,
    accountQuery.isSuccess,
    session,
    user,
  ]);

  useEffect(() => {
    let locationBannerTimer: ReturnType<typeof setTimeout> | null = null;

    if (
      isDashboardFocused &&
      notificationFlowState === 'completed' &&
      !isNotificationSheetOpen &&
      !isWelcomeSurveyOpen &&
      needsLocationBanner
    ) {
      locationBannerTimer = setTimeout(
        () => setIsLocationBannerOpen(true),
        LOCATION_BANNER_DELAY_MS,
      );
    }

    return () => {
      if (locationBannerTimer) clearTimeout(locationBannerTimer);
    };
  }, [
    isDashboardFocused,
    notificationFlowState,
    isNotificationSheetOpen,
    isWelcomeSurveyOpen,
    needsLocationBanner,
  ]);

  const completeNotificationFlow = () => {
    notificationPromptHandledForUserRef.current = user?.id ?? null;
    setIsNotificationSheetOpen(false);
    setNotificationFlowState('completed');
  };

  const requestNotificationPermission = async () => {
    try {
      if (!notificationPermissionCanAskAgain) {
        await Linking.openSettings();
        return;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === Notifications.PermissionStatus.GRANTED)
        await syncPushToken();
    } catch {
      // The permission prompt is only shown once during each app session.
    } finally {
      completeNotificationFlow();
    }
  };

  const saveWelcomeSurveyResponse = async (
    selectedOptions: readonly WelcomeSurveyOption[],
  ) => {
    if (!user) return;
    await storeWelcomeSurveyResponse(user.id, selectedOptions);
    setNeedsWelcomeSurvey(false);
  };

  const dismissWelcomeSurvey = () => {
    setIsWelcomeSurveyOpen(false);
    setNeedsWelcomeSurvey(false);
    if (user) {
      void markWelcomeSurveyDismissed(user.id, session?.expiresAt ?? null);
    }
  };

  const dismissLocationBanner = () => {
    setIsLocationBannerOpen(false);
    setNeedsLocationBanner(false);
  };

  const addExtraQuickAction = (id: ExtraQuickActionId) => {
    if (
      !user ||
      extraQuickActionIds.includes(id) ||
      (isSolo && id === 'collaborators')
    )
      return;
    const nextIds = [...extraQuickActionIds, id];
    setExtraQuickActionIds(nextIds);
    setIsQuickActionsPickerOpen(false);
    void storeExtraQuickActionIds(user.id, nextIds);
  };
  const removeExtraQuickAction = (id: ExtraQuickActionId) => {
    if (!user) return;
    const nextIds = extraQuickActionIds.filter((actionId) => actionId !== id);
    setExtraQuickActionIds(nextIds);
    void storeExtraQuickActionIds(user.id, nextIds);
  };

  const saveLocation = async (location: GoogleMapsLocationCandidate) => {
    const account = accountQuery.data;
    if (!user || !account) {
      throw new Error(
        'No encontramos la informaci\u00f3n necesaria del negocio.',
      );
    }

    await requireApiClient().request('/v1/business-location', {
      body: {
        addressLine: location.formattedAddress.slice(0, 240),
        city: location.city,
        countryCode: location.countryCode,
        formattedAddress: location.formattedAddress,
        googlePlaceId: location.placeId || null,
        latitude: location.latitude,
        longitude: location.longitude,
      },
      method: 'PUT',
    });
    await accountQuery.refetch();
    setNeedsLocationBanner(false);
  };

  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <SafeAreaView edges={['left', 'right', 'top']} style={styles.screen}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomInset + 84 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View style={styles.topCopy}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text accessibilityRole="header" style={styles.businessName}>
              {businessName}
            </Text>
          </View>
        </View>

        <View style={styles.salesCard}>
          <View style={styles.salesHeader}>
            <View style={styles.salesTitleColumn}>
              <Text numberOfLines={1} style={styles.salesTitle}>
                {planProgress.title}
              </Text>
              {planProgress.planLabel ? (
                <Text numberOfLines={1} style={styles.salesPlanLabel}>
                  {planProgress.planLabel}
                </Text>
              ) : null}
            </View>
            {canAccessFinancialReports ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/business-summary')}
                style={styles.summaryButton}
              >
                <Text style={styles.summaryLabel}>Resumen</Text>
                <Ionicons color="#B47D17" name="bar-chart-outline" size={22} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.salesMeta}>
            <Text style={styles.salesMetaText}>{planProgress.expiryLabel}</Text>
          </View>
          <DashboardProgress
            caption={planProgress.caption}
            value={planProgress.percentage}
          />
        </View>

        <View style={styles.quickActions}>
          <QuickAction
            icon="add-circle-outline"
            label="Nueva cita"
            onPress={() => router.push('/new-booking')}
          />
          <QuickAction
            icon="cut-outline"
            label="Servicios"
            onPress={() => router.push('/service-management')}
          />
          <QuickAction
            icon="cube-outline"
            label={inventoryEnabled ? 'Inventario' : 'Inventario (Local)'}
            locked={!inventoryEnabled}
            onPress={() =>
              router.push(inventoryEnabled ? '/inventory' : '/subscription')
            }
          />
          <QuickAction
            icon="wallet-outline"
            label="Nava Wallet"
            onPress={() => router.push('/wallet')}
          />
        </View>
        {extraQuickActions.length ? (
          <View style={styles.extraQuickActions}>
            {extraQuickActions.map((action) => (
              <View key={action.id} style={styles.extraQuickActionSlot}>
                <QuickAction
                  icon={action.icon}
                  label={
                    action.id === 'collaborators' && !teamEnabled
                      ? 'Colaboradores (Local)'
                      : action.label
                  }
                  locked={action.id === 'collaborators' && !teamEnabled}
                  onPress={() =>
                    router.push(
                      action.id === 'collaborators' && !teamEnabled
                        ? '/subscription'
                        : (action.route as never),
                    )
                  }
                />
                <Pressable
                  accessibilityLabel={`Quitar acceso rápido ${action.label}`}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => removeExtraQuickAction(action.id)}
                  style={styles.extraQuickActionRemove}
                >
                  <Ionicons color="#9C3D36" name="remove" size={19} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.addQuickActionRow}>
          <Pressable
            accessibilityLabel="Agregar acceso rápido"
            accessibilityRole="button"
            onPress={() => setIsQuickActionsPickerOpen(true)}
            style={styles.addQuickAction}
          >
            <View style={styles.addQuickActionIcon}>
              <Ionicons color="#FFFFFF" name="add" size={17} />
            </View>
            <Text style={styles.addQuickActionLabel}>Agregar acceso</Text>
          </Pressable>
        </View>

        {operations.length ? (
          <View style={styles.operationsSection}>
            <View style={styles.operationsHeader}>
              <View>
                <Text style={styles.operationsTitle}>En marcha</Text>
                <Text style={styles.operationsCaption}>
                  Lo importante para tu negocio ahora
                </Text>
              </View>
              <Ionicons color="#B47D17" name="flash-outline" size={23} />
            </View>
            <View style={styles.operationsList}>
              {operations.map((operation) => (
                <DashboardOperationCard
                  key={operation.id}
                  onPress={() => router.push(operation.route)}
                  operation={operation}
                />
              ))}
            </View>
          </View>
        ) : null}

        {shouldShowWelcome ? (
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>
              {'\u00a1Bienvenido a Nava!'}
            </Text>
            <Text style={styles.welcomeCopy}>
              {
                'Termina de configurar tu cuenta para comenzar a administrar tu negocio. Este mensaje desaparecer\u00e1 al finalizar la configuraci\u00f3n.'
              }
            </Text>
          </View>
        ) : null}

        {planRenewalNotice ? (
          <View style={styles.subscriptionNoticeCard}>
            <View style={styles.subscriptionNoticeImageColumn}>
              <Image
                accessibilityLabel="Corona dorada de suscripcion"
                resizeMode="contain"
                // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
                source={require('../../assets/suscripcion.png')}
                style={styles.subscriptionCrown}
              />
            </View>
            <View style={styles.subscriptionNoticeCopyColumn}>
              <Text style={styles.cardTitle}>{planRenewalNotice.title}</Text>
              <Text style={styles.cardCopy}>{planRenewalNotice.copy}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/subscription')}
                style={styles.subscriptionUpgradeButton}
              >
                <Text style={styles.subscriptionUpgradeLabel}>Ver planes</Text>
                <Ionicons
                  color={appTheme.colors.white}
                  name="arrow-forward"
                  size={18}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={styles.reservationCard}>
          <View style={styles.reservationTopRow}>
            <View style={styles.reservationCopyColumn}>
              <Text style={styles.cardTitle}>Recibe reservas</Text>
              <Text style={styles.cardCopy}>
                Comparte el enlace de reservas de tu negocio en tus redes
                sociales y aumenta tus citas.
              </Text>
              <View style={[styles.linkBox, styles.reservationLinkBox]}>
                <View style={styles.linkCopy}>
                  <Text style={styles.linkLabel}>Enlace de tu negocio</Text>
                  <Text
                    ellipsizeMode="middle"
                    numberOfLines={1}
                    style={styles.linkValue}
                  >
                    {bookingUrl || 'Preparando tu enlace de reservas'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsBookingSheetOpen(true)}
                  style={[styles.openButton, styles.reservationOpenButton]}
                >
                  <View
                    pointerEvents="none"
                    style={styles.openButtonInnerBorder}
                  />
                  <Text style={styles.openLabel}>Abrir</Text>
                  <OpenButtonFlare />
                </Pressable>
              </View>
            </View>
            <View style={styles.reservationImageColumn}>
              <Image
                accessibilityLabel="Silla de barbería"
                resizeMode="contain"
                // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
                source={require('../../assets/silla.png')}
                style={styles.reservationChair}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <BottomNavigation active="dashboard" />
      <BookingLinkSheet
        onClose={() => setIsBookingSheetOpen(false)}
        url={bookingUrl}
        visible={isBookingSheetOpen}
      />
      <ExtraQuickActionsSheet
        isSolo={isSolo}
        onClose={() => setIsQuickActionsPickerOpen(false)}
        onSelect={addExtraQuickAction}
        selectedIds={extraQuickActionIds}
        visible={isQuickActionsPickerOpen}
      />
      <NotificationPermissionSheet
        canAskAgain={notificationPermissionCanAskAgain}
        onAccept={() => void requestNotificationPermission()}
        onClose={completeNotificationFlow}
        visible={isNotificationSheetOpen}
      />
      <WelcomeSurveySheet
        key={`welcome-survey-${user?.id ?? 'anonymous'}`}
        onComplete={() => setIsWelcomeSurveyOpen(false)}
        onDismiss={dismissWelcomeSurvey}
        onSubmit={saveWelcomeSurveyResponse}
        visible={isWelcomeSurveyOpen}
      />
      {isLocationBannerOpen ? (
        <BusinessLocationSheet
          countryCode={accountQuery.data?.countryCode ?? 'EC'}
          initialLocation={accountQuery.data?.businessLocation ?? null}
          onComplete={() => setIsLocationBannerOpen(false)}
          onDismiss={dismissLocationBanner}
          onSubmit={saveLocation}
          requestPermissionOnOpen
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}
