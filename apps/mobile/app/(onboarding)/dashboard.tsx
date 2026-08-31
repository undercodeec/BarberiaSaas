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
  WelcomeSurveyResponseResult,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
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
import {
  businessCategoryIcon,
  businessCategoryImage,
  businessCategoryImageAccessibilityLabel,
} from '../../src/lib/business-category';
import { BookingLinkSheet } from '../../src/components/BookingLinkSheet';
import { BusinessCategoryPromptSheet } from '../../src/components/BusinessCategoryPromptSheet';
import { BusinessLocationSheet } from '../../src/components/BusinessLocationSheet';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { useAuth } from '../../src/providers/AuthProvider';
import { accountQueryKey } from '../../src/lib/query-keys';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';
import { FirstStepsCard } from '../../src/features/guides/FirstStepsCard';
import { GuideAnchor } from '../../src/features/guides/GuideAnchor';
import { useGuides } from '../../src/features/guides/GuideProvider';

import {
  DASHBOARD_BANNER_DELAY_MS,
  getBusinessCategoryPromptDismissedAt,
  LOCATION_BANNER_DELAY_MS,
  type WelcomeSurveyOption,
  type ExtraQuickActionId,
  EXTRA_QUICK_ACTIONS,
  getExtraQuickActionIds,
  storeExtraQuickActionIds,
  shouldShowWelcomeSurvey,
  getSubscriptionCelebrationState,
  storeSubscriptionCelebrationState,
  shouldCelebrateSubscriptionActivation,
  shouldShowBusinessCategoryPrompt,
  storeBusinessCategoryPromptDismissedAt,
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
  SubscriptionActivationCelebration,
  WelcomeSurveySheet,
} from '../../src/features/screens/dashboard-components';

export default function DashboardScreen() {
  const router = useRouter();
  const { guide, replay } = useLocalSearchParams<{
    guide?: string;
    replay?: string;
  }>();
  const layout = useNativeLayoutMetrics();
  const { session, user } = useAuth();
  const tenant = useTenantScope();
  const { completeGuide, dismissFirstSteps, firstStepsVisible, startGuide } =
    useGuides();
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
    enabled: Boolean(session && canAccessFinancialReports),
    queryFn: () =>
      requireApiClient().request<CurrentCashRegisterResponse>(
        '/v1/cash-register/current',
      ),
    queryKey: tenant.key('cash-register-current'),
  });
  const cashSummaryQuery = useQuery({
    enabled: Boolean(session && canAccessFinancialReports),
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
  const businessCategory = accountQuery.data?.businessCategory ?? 'BARBERSHOP';
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
  const [needsBusinessCategoryPrompt, setNeedsBusinessCategoryPrompt] =
    useState(false);
  const [isBusinessCategoryPromptOpen, setIsBusinessCategoryPromptOpen] =
    useState(false);
  const [isDashboardFocused, setIsDashboardFocused] = useState(false);
  const [extraQuickActionIds, setExtraQuickActionIds] = useState<
    ExtraQuickActionId[]
  >([]);
  const [isQuickActionsPickerOpen, setIsQuickActionsPickerOpen] =
    useState(false);
  const [
    isSubscriptionCelebrationVisible,
    setIsSubscriptionCelebrationVisible,
  ] = useState(false);
  const [subscriptionCelebrationPlanName, setSubscriptionCelebrationPlanName] =
    useState('Nava Premium');
  const subscriptionCelebrationStateRef = useRef<{
    readonly state: {
      readonly planCode: SubscriptionResponse['current']['planCode'];
      readonly status: SubscriptionResponse['current']['status'];
    } | null;
    readonly userId: string;
  } | null>(null);
  const subscriptionCelebrationQueueRef = useRef(Promise.resolve());
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
  const currentSubscriptionPlanCode = subscriptionQuery.data?.current.planCode;
  const currentSubscriptionStatus = subscriptionQuery.data?.current.status;
  const currentSubscriptionPlanName =
    subscriptionQuery.data?.plans.find(
      ({ code }) => code === currentSubscriptionPlanCode,
    )?.name ?? 'Nava Premium';
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

  const showSubscriptionCelebration = useCallback((planName: string) => {
    setSubscriptionCelebrationPlanName(planName);
    setIsSubscriptionCelebrationVisible(true);
  }, []);
  const finishSubscriptionCelebration = useCallback(() => {
    setIsSubscriptionCelebrationVisible(false);
  }, []);

  useEffect(() => {
    if (!user || !currentSubscriptionPlanCode || !currentSubscriptionStatus)
      return;

    let isMounted = true;
    const nextState = {
      planCode: currentSubscriptionPlanCode,
      status: currentSubscriptionStatus,
    };
    const userId = user.id;
    const planName = currentSubscriptionPlanName;

    subscriptionCelebrationQueueRef.current =
      subscriptionCelebrationQueueRef.current.then(async () => {
        const inMemoryState = subscriptionCelebrationStateRef.current;
        let previousState =
          inMemoryState?.userId === userId ? inMemoryState.state : null;

        if (previousState === null) {
          try {
            previousState = await getSubscriptionCelebrationState(userId);
          } catch {
            // Si el almacenamiento no está disponible, la sesión actual sigue funcionando.
          }
        }

        const shouldCelebrate = shouldCelebrateSubscriptionActivation(
          previousState,
          nextState,
        );
        subscriptionCelebrationStateRef.current = { state: nextState, userId };

        try {
          await storeSubscriptionCelebrationState(userId, nextState);
        } catch {
          // El efecto no depende de que el almacenamiento persista en este dispositivo.
        }

        if (isMounted && shouldCelebrate) showSubscriptionCelebration(planName);
      });

    return () => {
      isMounted = false;
    };
  }, [
    currentSubscriptionPlanName,
    currentSubscriptionPlanCode,
    currentSubscriptionStatus,
    showSubscriptionCelebration,
    user,
  ]);

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
        const response =
          await requireApiClient().request<WelcomeSurveyResponseResult>(
            '/v1/welcome-survey-response',
          );
        if (isMounted) {
          setNeedsWelcomeSurvey(shouldShowWelcomeSurvey(response));
        }
      } catch {
        if (isMounted) setNeedsWelcomeSurvey(false);
      }
    };

    if (session && user) void checkWelcomeSurvey();

    return () => {
      isMounted = false;
    };
  }, [session, user]);

  useEffect(() => {
    let isMounted = true;
    setNeedsBusinessCategoryPrompt(false);
    setIsBusinessCategoryPromptOpen(false);

    if (!session || !user || !accountQuery.isSuccess) {
      return () => {
        isMounted = false;
      };
    }
    const account = accountQuery.data;
    const requiresSelection =
      account.accountType !== null &&
      account.businessCategoryConfirmedAt === null;
    if (!requiresSelection) {
      return () => {
        isMounted = false;
      };
    }

    void getBusinessCategoryPromptDismissedAt(user.id)
      .then((dismissedAt) => {
        if (isMounted)
          setNeedsBusinessCategoryPrompt(
            shouldShowBusinessCategoryPrompt(dismissedAt),
          );
      })
      .catch(() => {
        if (isMounted) setNeedsBusinessCategoryPrompt(true);
      });

    return () => {
      isMounted = false;
    };
  }, [accountQuery.data, accountQuery.isSuccess, session, user]);

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
    if (
      guide !== 'share-booking-link' ||
      isNotificationSheetOpen ||
      isWelcomeSurveyOpen ||
      isBusinessCategoryPromptOpen ||
      notificationFlowState !== 'completed'
    )
      return;
    startGuide('share-booking-link', { force: replay === '1' });
  }, [
    guide,
    isBusinessCategoryPromptOpen,
    isNotificationSheetOpen,
    isWelcomeSurveyOpen,
    notificationFlowState,
    replay,
    startGuide,
  ]);

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
    await requireApiClient().request<WelcomeSurveyResponseResult>(
      '/v1/welcome-survey-response',
      { body: { selectedOptions }, method: 'POST' },
    );
    setNeedsWelcomeSurvey(false);
  };

  const dismissWelcomeSurvey = () => {
    setIsWelcomeSurveyOpen(false);
    setNeedsWelcomeSurvey(false);
  };

  const dismissLocationBanner = () => {
    setIsLocationBannerOpen(false);
    setNeedsLocationBanner(false);
  };

  const dismissBusinessCategoryPrompt = () => {
    setIsBusinessCategoryPromptOpen(false);
    setNeedsBusinessCategoryPrompt(false);
    if (user) void storeBusinessCategoryPromptDismissedAt(user.id);
  };

  const saveBusinessCategory = async (
    category: OnboardingAccountDetailsResponse['businessCategory'],
  ) => {
    await requireApiClient().request('/v1/onboarding/business-category', {
      body: { businessCategory: category },
      method: 'PATCH',
    });
    setIsBusinessCategoryPromptOpen(false);
    setNeedsBusinessCategoryPrompt(false);
    await Promise.all([accountQuery.refetch(), organizationQuery.refetch()]);
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
          { paddingBottom: layout.bottomNavigationContentPadding },
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

        {needsBusinessCategoryPrompt ? (
          <View style={styles.businessCategoryPrompt}>
            <View style={styles.businessCategoryPromptIcon}>
              <Ionicons
                color={appTheme.colors.accentDark}
                name="color-palette-outline"
                size={22}
              />
            </View>
            <View style={styles.businessCategoryPromptCopy}>
              <Text style={styles.businessCategoryPromptTitle}>
                Personaliza tu experiencia
              </Text>
              <Text style={styles.businessCategoryPromptText}>
                Selecciona el tipo de negocio que atiendes. Podrás cambiarlo
                cuando quieras.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsBusinessCategoryPromptOpen(true)}
                style={styles.businessCategoryPromptButton}
              >
                <Text style={styles.businessCategoryPromptButtonLabel}>
                  Elegir categoría
                </Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityLabel="Recordar después la categoría del negocio"
              accessibilityRole="button"
              hitSlop={8}
              onPress={dismissBusinessCategoryPrompt}
              style={styles.businessCategoryPromptDismiss}
            >
              <Ionicons
                color={appTheme.colors.textMuted}
                name="close"
                size={18}
              />
            </Pressable>
          </View>
        ) : null}

        {firstStepsVisible && !needsBusinessCategoryPrompt ? (
          <FirstStepsCard
            onDismiss={dismissFirstSteps}
            onStartBooking={() =>
              router.push({
                params: { guide: 'first-booking' },
                pathname: '/agenda',
              })
            }
            onStartShareLink={() => startGuide('share-booking-link')}
          />
        ) : null}

        <View style={styles.quickActions}>
          <QuickAction
            icon="add-circle-outline"
            label="Nueva cita"
            onPress={() => router.push('/new-booking')}
          />
          <QuickAction
            icon={businessCategoryIcon(businessCategory)}
            label="Servicios"
            onPress={() => router.push('/service-management')}
          />
          <QuickAction
            icon="cube-outline"
            label={inventoryEnabled ? 'Inventario' : 'Inventario (Esencial)'}
            locked={!inventoryEnabled}
            lockedPlan="Nava Esencial"
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
                <GuideAnchor id="dashboard-booking-link">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      completeGuide('share-booking-link');
                      setIsBookingSheetOpen(true);
                    }}
                    style={[styles.openButton, styles.reservationOpenButton]}
                  >
                    <View
                      pointerEvents="none"
                      style={styles.openButtonInnerBorder}
                    />
                    <Text style={styles.openLabel}>Abrir</Text>
                    <OpenButtonFlare />
                  </Pressable>
                </GuideAnchor>
              </View>
            </View>
            <View style={styles.reservationImageColumn}>
              <Image
                accessibilityLabel={businessCategoryImageAccessibilityLabel(
                  businessCategory,
                )}
                resizeMode="contain"
                source={businessCategoryImage(businessCategory, 'dashboard')}
                style={styles.reservationChair}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <BottomNavigation active="dashboard" />
      <SubscriptionActivationCelebration
        onComplete={finishSubscriptionCelebration}
        planName={subscriptionCelebrationPlanName}
        visible={isSubscriptionCelebrationVisible}
      />
      <BookingLinkSheet
        onClose={() => setIsBookingSheetOpen(false)}
        url={bookingUrl}
        visible={isBookingSheetOpen}
      />
      <BusinessCategoryPromptSheet
        initialCategory={businessCategory}
        onDismiss={dismissBusinessCategoryPrompt}
        onSubmit={saveBusinessCategory}
        visible={isBusinessCategoryPromptOpen}
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
