import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  AppointmentsResponse,
  CashRegisterSummaryResponse,
  CurrentCashRegisterResponse,
  CurrentOrganizationResponse,
  GoogleMapsLocationCandidate,
  InventoryResponse,
  OnboardingAccountDetailsResponse,
  SubscriptionResponse,
} from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';

import {
  appStyles,
  appTheme,
  BottomNavigation,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { BookingLinkSheet } from '../../src/components/BookingLinkSheet';
import { BusinessLocationSheet } from '../../src/components/BusinessLocationSheet';
import { useAuth } from '../../src/providers/AuthProvider';

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_NOTICE_TRIAL_DAYS = 3;
const SUBSCRIPTION_NOTICE_ACTIVE_DAYS = 7;
const DASHBOARD_BANNER_DELAY_MS = 10_000;
const LOCATION_BANNER_DELAY_MS = 500;
const WELCOME_SURVEY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const WELCOME_SURVEY_RESPONSE_KEY = 'barber-saas.welcome-survey-response';
const QUICK_ACTIONS_STORAGE_KEY = 'barber-saas.dashboard-quick-actions';
const WELCOME_SURVEY_OPTIONS = [
  'Publicidad',
  'Redes sociales de Nava (Facebook o Instagram)',
  'Buscador',
  'Recomendaci\u00f3n de una academia, clase u otro negocio',
  'Evento o feria',
] as const;

type WelcomeSurveyOption = (typeof WELCOME_SURVEY_OPTIONS)[number];
type ExtraQuickActionId =
  | 'agenda'
  | 'booking-settings'
  | 'cash-register'
  | 'clients'
  | 'collaborators'
  | 'notifications'
  | 'reviews-management';

const EXTRA_QUICK_ACTIONS: ReadonlyArray<{
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly id: ExtraQuickActionId;
  readonly label: string;
  readonly route: string;
}> = [
  { icon: 'calendar-outline', id: 'agenda', label: 'Agenda', route: '/agenda' },
  {
    icon: 'receipt-outline',
    id: 'cash-register',
    label: 'Caja',
    route: '/cash-register',
  },
  {
    icon: 'people-outline',
    id: 'clients',
    label: 'Clientes',
    route: '/clients',
  },
  {
    icon: 'people-circle-outline',
    id: 'collaborators',
    label: 'Colaboradores',
    route: '/team-management',
  },
  {
    icon: 'options-outline',
    id: 'booking-settings',
    label: 'Reservas',
    route: '/booking-settings',
  },
  {
    icon: 'notifications-outline',
    id: 'notifications',
    label: 'Avisos',
    route: '/notifications',
  },
  {
    icon: 'star-outline',
    id: 'reviews-management',
    label: 'Reseñas',
    route: '/reviews-management',
  },
];

function welcomeSurveyStorageKey(userId: string) {
  return `${WELCOME_SURVEY_RESPONSE_KEY}.${userId}`;
}

function quickActionsStorageKey(userId: string) {
  return `${QUICK_ACTIONS_STORAGE_KEY}.${userId}`;
}

async function getExtraQuickActionIds(userId: string) {
  const key = quickActionsStorageKey(userId);
  const value =
    Platform.OS === 'web'
      ? globalThis.localStorage.getItem(key)
      : await SecureStore.getItemAsync(key);
  if (!value) return [] as ExtraQuickActionId[];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ExtraQuickActionId =>
      EXTRA_QUICK_ACTIONS.some((action) => action.id === item),
    );
  } catch {
    return [];
  }
}

async function storeExtraQuickActionIds(
  userId: string,
  actionIds: readonly ExtraQuickActionId[],
) {
  const key = quickActionsStorageKey(userId);
  const value = JSON.stringify(actionIds);
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getWelcomeSurveyResponse(
  userId: string,
): Promise<string | null> {
  const key = welcomeSurveyStorageKey(userId);
  if (Platform.OS === 'web') return globalThis.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function storeWelcomeSurveyResponse(
  userId: string,
  selectedOptions: readonly WelcomeSurveyOption[],
) {
  const key = welcomeSurveyStorageKey(userId);
  const value = JSON.stringify({
    selectedOptions,
    submittedAt: new Date().toISOString(),
  });

  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function markWelcomeSurveyDismissed(
  userId: string,
  sessionExpiresAt: string | null,
) {
  const key = welcomeSurveyStorageKey(userId);
  const value = JSON.stringify({
    dismissedAt: new Date().toISOString(),
    sessionExpiresAt,
  });

  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

function shouldShowWelcomeSurvey(
  storedResponse: string | null,
  sessionExpiresAt: string | null,
) {
  if (storedResponse === null) return true;

  try {
    const response = JSON.parse(storedResponse) as {
      readonly dismissedAt?: unknown;
      readonly sessionExpiresAt?: unknown;
      readonly submittedAt?: unknown;
    };

    if (typeof response.dismissedAt === 'string') {
      return response.sessionExpiresAt !== sessionExpiresAt;
    }

    const interactedAt = response.submittedAt ?? response.dismissedAt;

    if (typeof interactedAt !== 'string') return true;
    const interactedAtMs = Date.parse(interactedAt);
    if (Number.isNaN(interactedAtMs)) return true;

    return Date.now() - interactedAtMs >= WELCOME_SURVEY_INTERVAL_MS;
  } catch {
    return true;
  }
}

async function syncPushToken() {
  if (Platform.OS === 'web') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as
    string | undefined;
  if (!projectId) return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await requireApiClient().request('/v1/push-tokens', {
    body: { platform: Platform.OS, token },
    method: 'PUT',
  });
}
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '\u00a1Buenos d\u00edas! Bienvenido';
  if (hour < 19) return '\u00a1Buenas tardes! Bienvenido';
  return '\u00a1Buenas noches! Bienvenido';
}

type DashboardProgressProps = {
  readonly caption: string;
  readonly value: number;
};

type SubscriptionProgress = {
  readonly caption: string;
  readonly daysRemaining: number | null;
  readonly phase: 'active' | 'expired' | 'grace' | 'trial' | 'unknown';
  readonly expiryLabel: string;
  readonly planLabel: string | null;
  readonly percentage: number;
  readonly title: string;
};

function dateTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function expiryDateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function subscriptionProgress(
  subscription: SubscriptionResponse | undefined,
  now: number,
  hasError = false,
): SubscriptionProgress {
  if (!subscription) {
    return {
      caption: 'de tiempo transcurrido',
      daysRemaining: null,
      expiryLabel: hasError
        ? 'No pudimos consultar la vigencia'
        : 'Consultando la vigencia de tu plan',
      planLabel: null,
      percentage: 0,
      phase: 'unknown',
      title: 'Tu suscripción',
    };
  }

  const current = subscription.current;
  const planName =
    subscription.plans.find(({ code }) => code === current.planCode)?.name ??
    'Nava';
  const periodStart = dateTimestamp(current.currentPeriodStart);
  if (current.status === 'free') {
    return {
      caption: 'del limite mensual',
      daysRemaining: null,
      expiryLabel: `${subscription.usage.rolling30DayBookings} reservas en los ultimos 30 dias`,
      planLabel: null,
      percentage:
        subscription.usage.bookingLimit === null
          ? 0
          : Math.min(
              100,
              Math.round(
                (subscription.usage.rolling30DayBookings /
                  subscription.usage.bookingLimit) *
                  100,
              ),
            ),
      phase: 'active',
      title: planName,
    };
  }

  const periodEnd = dateTimestamp(current.currentPeriodEnd);
  const trialEnd = dateTimestamp(current.trialEndsAt);
  const graceEnd = dateTimestamp(current.graceEndsAt);

  let phase: 'active' | 'expired' | 'grace' | 'trial';
  let startsAt: number | null;
  let endsAt: number | null;

  if (current.status === 'cancelled' || current.status === 'suspended') {
    phase = 'expired';
    startsAt = null;
    endsAt = graceEnd ?? trialEnd ?? periodEnd;
  } else if (
    (current.status === 'trial' && trialEnd !== null && now >= trialEnd) ||
    current.status === 'past_due'
  ) {
    if (graceEnd !== null && now < graceEnd) {
      phase = 'grace';
      startsAt = trialEnd ?? periodEnd;
      endsAt = graceEnd;
    } else {
      phase = 'expired';
      startsAt = null;
      endsAt = graceEnd ?? trialEnd ?? periodEnd;
    }
  } else if (current.status === 'trial') {
    phase = 'trial';
    startsAt = periodStart;
    endsAt = trialEnd ?? periodEnd;
  } else {
    phase = 'active';
    startsAt = periodStart;
    endsAt = periodEnd;
  }

  if (
    phase === 'expired' ||
    startsAt === null ||
    endsAt === null ||
    endsAt <= now
  ) {
    return {
      caption: 'de tiempo transcurrido',
      daysRemaining: null,
      expiryLabel: endsAt
        ? `Venció el ${expiryDateLabel(endsAt)}`
        : 'La suscripción no está activa',
      planLabel: null,
      percentage: 100,
      phase,
      title: 'Suscripción vencida',
    };
  }

  const duration = Math.max(DAY_MS, endsAt - startsAt);
  const elapsed = Math.max(0, Math.min(duration, now - startsAt));
  const remaining = duration - elapsed;
  const daysRemaining = Math.ceil(remaining / DAY_MS);
  const totalDays = Math.max(1, Math.ceil(duration / DAY_MS));
  const currentDay = Math.min(
    totalDays,
    Math.max(1, Math.floor((now - startsAt) / DAY_MS) + 1),
  );
  const percentage = Math.max(1, Math.round((elapsed / duration) * 100));

  return {
    caption:
      phase === 'trial'
        ? 'de prueba transcurrida'
        : phase === 'grace'
          ? 'de gracia transcurrida'
          : 'de tiempo transcurrido',
    expiryLabel:
      daysRemaining === 0
        ? `Venció el ${expiryDateLabel(endsAt)}`
        : phase === 'trial'
          ? `Día ${currentDay} de ${totalDays} restantes`
          : `Día ${currentDay} de ${totalDays}`,
    daysRemaining,
    planLabel: phase === 'trial' || phase === 'active' ? planName : null,
    percentage,
    phase,
    title:
      phase === 'trial'
        ? 'Prueba gratuita'
        : phase === 'grace'
          ? 'Período de gracia'
          : 'Suscripción',
  };
}

type SubscriptionNotice = {
  readonly copy: string;
  readonly title: string;
};

function subscriptionNotice(
  progress: SubscriptionProgress,
  subscription: SubscriptionResponse | undefined,
): SubscriptionNotice | null {
  if (subscription?.current.planCode === 'free') {
    const usage = subscription.usage;
    const limit = usage.bookingLimit;
    if (limit !== null) {
      const used = usage.rolling30DayBookings;
      const baseLimit = limit - (usage.graceUsed ? usage.graceBookings : 0);
      if (used >= limit)
        return {
          copy: 'Las nuevas reservas estan pausadas. Tu historial y tus datos siguen disponibles.',
          title: 'Limite de reservas alcanzado',
        };
      if (usage.graceAvailable && used >= baseLimit)
        return {
          copy: `Llegaste a ${baseLimit} reservas. Activa tu cortesia en Suscripcion o compara los planes sin limite.`,
          title: 'Tienes +5 reservas de cortesia',
        };
      if (usage.graceUsed && used >= baseLimit)
        return {
          copy: `Te quedan ${limit - used} reservas de cortesia en esta ventana de 30 dias.`,
          title: 'Cortesia activa',
        };
      if (used >= 36)
        return {
          copy: `Te quedan ${baseLimit - used} reservas antes del limite de Nava Free.`,
          title: 'Estas cerca del limite',
        };
      if (used >= 30)
        return {
          copy: `Ya utilizaste ${used} de ${baseLimit} reservas en los ultimos 30 dias.`,
          title: '75% del limite utilizado',
        };
      if (used >= 20)
        return {
          copy: `Ya gestionaste ${used} reservas con Nava en los ultimos 30 dias.`,
          title: 'Tu negocio esta creciendo',
        };
    }
  }
  if (progress.daysRemaining === null) return null;

  if (
    progress.phase === 'trial' &&
    progress.daysRemaining <= SUBSCRIPTION_NOTICE_TRIAL_DAYS
  ) {
    return {
      copy: `Tu prueba termina en ${progress.daysRemaining} ${progress.daysRemaining === 1 ? 'dia' : 'dias'}. Revisa Nava Esencial o Local para continuar sin limites.`,
      title: 'Tu prueba esta por terminar',
    };
  }

  if (
    (progress.phase === 'active' || progress.phase === 'grace') &&
    progress.daysRemaining <= SUBSCRIPTION_NOTICE_ACTIVE_DAYS
  ) {
    return {
      copy: `Tu suscripcion vence en ${progress.daysRemaining} ${progress.daysRemaining === 1 ? 'dia' : 'dias'}. Revisa Nava Esencial o Local para continuar.`,
      title: 'Actualiza tu plan para continuar',
    };
  }

  return null;
}
type DashboardOperation = {
  readonly actionLabel: string;
  readonly description: string;
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly id: 'appointment' | 'cash-register' | 'inventory';
  readonly priority: number;
  readonly route: '/agenda' | '/cash-register' | '/inventory';
  readonly title: string;
};

function dateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function appointmentStatusLabel(status: AppointmentRecord['status']): string {
  if (status === 'awaiting_confirmation') return 'Por confirmar';
  if (status === 'checked_in') return 'Cliente en el local';
  if (status === 'confirmed') return 'Confirmada';
  if (status === 'in_progress') return 'En curso';
  if (status === 'pending_verification') return 'Verificación pendiente';
  if (status === 'scheduled') return 'Agendada';
  if (status === 'waiting') return 'En espera';
  return 'Próxima cita';
}

function formatOperationMoney(value: number, currencyCode: string): string {
  return new Intl.NumberFormat('es-EC', {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(value / 100);
}

function timeInTimeZone(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

function dashboardOperations({
  appointments,
  cashSession,
  cashSummary,
  currencyCode,
  inventory,
  now,
  timeZone,
}: {
  readonly appointments: readonly AppointmentRecord[] | undefined;
  readonly cashSession: CurrentCashRegisterResponse['session'] | undefined;
  readonly cashSummary: CashRegisterSummaryResponse | undefined;
  readonly currencyCode: string;
  readonly inventory: InventoryResponse | undefined;
  readonly now: number;
  readonly timeZone: string;
}): DashboardOperation[] {
  const operations: DashboardOperation[] = [];
  const nextAppointment = (appointments ?? [])
    .filter((appointment) => {
      const endsAt = Date.parse(appointment.endsAt);
      return (
        !['cancelled', 'completed', 'expired', 'no_show'].includes(
          appointment.status,
        ) &&
        Number.isFinite(endsAt) &&
        endsAt > now
      );
    })
    .sort(
      (first, second) =>
        Date.parse(first.startsAt) - Date.parse(second.startsAt),
    )[0];

  if (nextAppointment) {
    const isInProgress = Date.parse(nextAppointment.startsAt) <= now;
    const serviceNames = nextAppointment.services
      .map((service) => service.serviceName)
      .join(', ');
    operations.push({
      actionLabel: 'Abrir agenda',
      description: `${serviceNames || 'Sin servicio'} · ${appointmentStatusLabel(nextAppointment.status)}`,
      icon: 'calendar-outline',
      id: 'appointment',
      priority:
        isInProgress ||
        ['awaiting_confirmation', 'pending_verification'].includes(
          nextAppointment.status,
        )
          ? 0
          : 1,
      route: '/agenda',
      title: isInProgress
        ? `Cita en curso · ${nextAppointment.clientName}`
        : `${timeInTimeZone(nextAppointment.startsAt, timeZone)} · ${nextAppointment.clientName}`,
    });
  }

  if (cashSession) {
    const totals = cashSummary?.totals;
    operations.push({
      actionLabel: 'Ver caja',
      description: `Ventas de hoy: ${formatOperationMoney(totals?.sales ?? 0, currencyCode)}`,
      icon: 'receipt-outline',
      id: 'cash-register',
      priority: 2,
      route: '/cash-register',
      title: `Caja abierta · ${formatOperationMoney(
        totals?.expectedCash ?? cashSession.openingAmountCents,
        currencyCode,
      )}`,
    });
  }

  const lowStockProducts = inventory?.summary.lowStockProducts ?? 0;
  if (lowStockProducts > 0) {
    operations.push({
      actionLabel: 'Ver inventario',
      description: 'Revisa existencias antes de tu próxima venta.',
      icon: 'warning-outline',
      id: 'inventory',
      priority: 3,
      route: '/inventory',
      title: `${lowStockProducts} ${
        lowStockProducts === 1 ? 'producto llegó' : 'productos llegaron'
      } al mínimo`,
    });
  }

  return operations
    .sort((first, second) => first.priority - second.priority)
    .slice(0, 2);
}

const PRIMARY_WAVE_PATH = 'M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0 Z';
const SECONDARY_WAVE_PATH =
  'M0 10 Q25 20 50 10 T100 10 T150 10 T200 10 V20 H0 Z';

function TankGradient() {
  return (
    <Svg
      height="100%"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      width="100%"
    >
      <Defs>
        <SvgLinearGradient id="dashboard-tank-fill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.72" stopColor="#FAF9F6" />
          <Stop offset="1" stopColor="#F8F0DD" />
        </SvgLinearGradient>
      </Defs>
      <Rect height="100" width="100" fill="url(#dashboard-tank-fill)" />
    </Svg>
  );
}

function LiquidGradient() {
  return (
    <Svg
      height="100%"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      width="100%"
    >
      <Defs>
        <SvgLinearGradient
          id="dashboard-liquid-fill"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <Stop offset="0" stopColor="#EBD8AA" />
          <Stop offset="0.42" stopColor="#EBD8AA" />
          <Stop offset="0.72" stopColor="#E1C47E" />
          <Stop offset="1" stopColor="#E1B85B" stopOpacity={0.84} />
        </SvgLinearGradient>
      </Defs>
      <Rect height="100" width="100" fill="url(#dashboard-liquid-fill)" />
    </Svg>
  );
}

function LiquidWaveSurface({
  copy,
  secondary = false,
}: {
  readonly copy: 1 | 2;
  readonly secondary?: boolean;
}) {
  const path = secondary ? SECONDARY_WAVE_PATH : PRIMARY_WAVE_PATH;
  const fillId = `dashboard-${secondary ? 'secondary' : 'primary'}-wave-${copy}`;

  return (
    <Svg
      height="20"
      preserveAspectRatio="none"
      viewBox="0 0 200 20"
      width="100%"
    >
      <Defs>
        <SvgLinearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <Stop
            offset="0"
            stopColor={secondary ? '#C79532' : '#FAF9F6'}
            stopOpacity={secondary ? 0.72 : 1}
          />
          <Stop
            offset={secondary ? '0.52' : '0.5'}
            stopColor={secondary ? '#E1B85B' : '#F8F0DD'}
            stopOpacity={secondary ? 0.42 : 1}
          />
          <Stop
            offset="1"
            stopColor="#EBD8AA"
            stopOpacity={secondary ? 0 : 1}
          />
        </SvgLinearGradient>
      </Defs>
      <Path d={path} fill={`url(#${fillId})`} />
    </Svg>
  );
}

function DashboardProgress({ caption, value }: DashboardProgressProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const [progress] = useState(() => new Animated.Value(0));
  const [firstWave] = useState(() => new Animated.Value(0));
  const [secondWave] = useState(() => new Animated.Value(0));
  const [displayValue, setDisplayValue] = useState(0);
  const [tankWidth, setTankWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      if (isMounted) setReduceMotion(isEnabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;

    const listenerId = progress.addListener(({ value: animatedValue }) => {
      setDisplayValue(Math.round(animatedValue));
    });

    progress.stopAnimation();
    progress.setValue(0);

    const animation = Animated.timing(progress, {
      duration: reduceMotion ? 0 : 780,
      easing: Easing.out(Easing.cubic),
      toValue: normalizedValue,
      useNativeDriver: false,
    });

    animation.start();
    return () => {
      animation.stop();
      progress.removeListener(listenerId);
    };
  }, [normalizedValue, progress, reduceMotion]);

  useEffect(() => {
    if (reduceMotion === null || tankWidth === 0) return;

    firstWave.stopAnimation();
    secondWave.stopAnimation();
    firstWave.setValue(0);
    secondWave.setValue(0);

    if (reduceMotion) return;

    let isActive = true;

    const startWaveCycle = (
      animatedValue: Animated.Value,
      duration: number,
    ) => {
      if (!isActive) return;

      animatedValue.setValue(0);
      Animated.timing(animatedValue, {
        duration,
        easing: Easing.linear,
        isInteraction: false,
        toValue: 1,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) startWaveCycle(animatedValue, duration);
      });
    };

    startWaveCycle(firstWave, 4_000);
    startWaveCycle(secondWave, 6_000);

    return () => {
      isActive = false;
      firstWave.stopAnimation();
      secondWave.stopAnimation();
    };
  }, [firstWave, reduceMotion, secondWave, tankWidth]);

  const fillHeight = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  const firstWaveTranslateX = firstWave.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -tankWidth],
  });
  const secondWaveTranslateX = secondWave.interpolate({
    inputRange: [0, 1],
    outputRange: [-tankWidth, 0],
  });
  return (
    <View
      accessibilityLabel={`${normalizedValue}% ${caption}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: normalizedValue }}
      onLayout={(event) => setTankWidth(event.nativeEvent.layout.width)}
      pointerEvents="none"
      style={dashboardProgressStyles.tank}
    >
      <TankGradient />
      <View style={dashboardProgressStyles.ambientGlow} />

      <Animated.View
        style={[dashboardProgressStyles.liquid, { height: fillHeight }]}
      >
        <LiquidGradient />

        <Animated.View
          style={[
            dashboardProgressStyles.waveTrack,
            dashboardProgressStyles.primaryWave,
            {
              transform: [{ translateX: firstWaveTranslateX }],
              width: tankWidth * 2,
            },
          ]}
        >
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={1} />
          </View>
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={2} />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            dashboardProgressStyles.waveTrack,
            dashboardProgressStyles.secondaryWave,
            {
              transform: [{ translateX: secondWaveTranslateX }],
              width: tankWidth * 2,
            },
          ]}
        >
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={1} secondary />
          </View>
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={2} secondary />
          </View>
        </Animated.View>
      </Animated.View>

      <View style={dashboardProgressStyles.label}>
        <Text style={dashboardProgressStyles.percentage}>{displayValue}%</Text>
        <Text style={dashboardProgressStyles.caption}>{caption}</Text>
      </View>
    </View>
  );
}

const dashboardProgressStyles = StyleSheet.create({
  ambientGlow: {
    backgroundColor: 'rgba(225, 184, 91, 0.1)',
    borderRadius: 180,
    bottom: '-32%',
    height: '68%',
    left: '12%',
    position: 'absolute',
    right: '-14%',
  },
  caption: {
    color: '#555555',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  label: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    borderRadius: 20,
    bottom: 18,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    position: 'absolute',
    right: 18,
    shadowColor: '#B47D17',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 5,
  },
  liquid: {
    backgroundColor: '#EBD8AA',
    bottom: 0,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
  },
  percentage: {
    color: '#956816',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  primaryWave: {
    opacity: 0.9,
    top: -18,
    zIndex: 3,
  },
  secondaryWave: {
    opacity: 0.68,
    top: -14,
    zIndex: 2,
  },
  tank: {
    backgroundColor: '#FFFFFF',
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  waveTrack: {
    flexDirection: 'row',
    height: 20,
    left: 0,
    position: 'absolute',
  },
});

function QuickAction({
  icon,
  label,
  onPress,
}: {
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly onPress: () => void;
}) {
  const shimmerTranslateX = useRef(new Animated.Value(-82)).current;

  useEffect(() => {
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerTranslateX, {
          duration: 860,
          easing: Easing.out(Easing.cubic),
          toValue: 82,
          useNativeDriver: true,
        }),
        Animated.delay(1650),
        Animated.timing(shimmerTranslateX, {
          duration: 0,
          toValue: -82,
          useNativeDriver: true,
        }),
      ]),
    );

    shimmerAnimation.start();
    return () => shimmerAnimation.stop();
  }, [shimmerTranslateX]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.quickAction}
    >
      <View style={styles.quickIcon}>
        <Ionicons color="#B47D17" name={icon} size={30} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.quickIconShimmer,
            {
              transform: [
                { translateX: shimmerTranslateX },
                { rotate: '22deg' },
              ],
            },
          ]}
        />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function DashboardOperationCard({
  operation,
  onPress,
}: {
  readonly operation: DashboardOperation;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={`Abre ${operation.actionLabel.toLocaleLowerCase('es-EC')}`}
      accessibilityLabel={operation.title}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.operationCard,
        operation.id === 'inventory' && styles.operationCardAlert,
      ]}
    >
      <View
        style={[
          styles.operationIcon,
          operation.id === 'inventory' && styles.operationIconAlert,
        ]}
      >
        <Ionicons
          color={operation.id === 'inventory' ? '#A86612' : '#B47D17'}
          name={operation.icon}
          size={22}
        />
      </View>
      <View style={styles.operationCopy}>
        <Text numberOfLines={1} style={styles.operationTitle}>
          {operation.title}
        </Text>
        <Text numberOfLines={1} style={styles.operationDescription}>
          {operation.description}
        </Text>
        <View style={styles.operationActionRow}>
          <Text style={styles.operationAction}>{operation.actionLabel}</Text>
          <Ionicons color="#B47D17" name="arrow-forward" size={15} />
        </View>
      </View>
    </Pressable>
  );
}

function ExtraQuickActionsSheet({
  selectedIds,
  onClose,
  onSelect,
  visible,
}: {
  readonly selectedIds: readonly ExtraQuickActionId[];
  readonly onClose: () => void;
  readonly onSelect: (id: ExtraQuickActionId) => void;
  readonly visible: boolean;
}) {
  const layout = useNativeLayoutMetrics(0.72);
  const availableActions = EXTRA_QUICK_ACTIONS.filter(
    (action) => !selectedIds.includes(action.id),
  );

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.quickActionsPickerOverlay}>
        <Pressable
          accessibilityLabel="Cerrar accesos rápidos"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.quickActionsPickerBackdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.quickActionsPicker,
            {
              maxHeight: layout.sheetMaxHeight,
              paddingBottom: layout.bottomInset + 8,
            },
          ]}
        >
          <View style={styles.quickActionsPickerHandle} />
          <Text
            accessibilityRole="header"
            style={styles.quickActionsPickerTitle}
          >
            Agrega un acceso rápido
          </Text>
          <Text style={styles.quickActionsPickerCopy}>
            Elige una herramienta para tenerla siempre a la vista.
          </Text>
          <ScrollView
            contentContainerStyle={styles.quickActionsPickerList}
            showsVerticalScrollIndicator={false}
          >
            {availableActions.map((action) => (
              <Pressable
                accessibilityRole="button"
                key={action.id}
                onPress={() => onSelect(action.id)}
                style={styles.quickActionsPickerOption}
              >
                <View style={styles.quickActionsPickerIcon}>
                  <Ionicons color="#B47D17" name={action.icon} size={21} />
                </View>
                <Text style={styles.quickActionsPickerLabel}>
                  {action.label}
                </Text>
                <Ionicons color="#69717d" name="add" size={23} />
              </Pressable>
            ))}
            {!availableActions.length ? (
              <Text style={styles.quickActionsPickerEmpty}>
                Ya agregaste todos los accesos disponibles.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OpenButtonFlare() {
  const translateX = useRef(new Animated.Value(-25)).current;

  useEffect(() => {
    let isActive = true;

    const move = (toValue: number): void => {
      Animated.timing(translateX, {
        duration: 6_500,
        easing: Easing.inOut(Easing.sin),
        isInteraction: false,
        toValue,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && isActive) move(toValue > 0 ? -25 : 25);
      });
    };

    move(25);
    return () => {
      isActive = false;
      translateX.stopAnimation();
    };
  }, [translateX]);

  const opacity = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [-25, 0, 25],
    outputRange: [0.7, 1, 0.7],
  });
  const scale = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [-25, 0, 25],
    outputRange: [0.86, 1.22, 0.86],
  });

  return (
    <View pointerEvents="none" style={styles.openButtonBottomGlow}>
      <Animated.View
        style={[
          styles.openButtonFlare,
          { opacity, transform: [{ translateX }, { scale }] },
        ]}
      />
    </View>
  );
}

function NotificationPermissionSheet({
  onAccept,
  onClose,
  visible,
}: {
  readonly onAccept: () => void;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(48)).current;

  useEffect(() => {
    if (!visible) return;

    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(48);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, sheetTranslateY, visible]);

  const dismissWithAnimation = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 160,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 180,
        easing: Easing.in(Easing.cubic),
        toValue: 520,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sheetTranslateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          dismissWithAnimation();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  if (!visible) return null;

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={dismissWithAnimation}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.permissionOverlay}>
        <Animated.View
          pointerEvents="none"
          style={[styles.permissionBackdrop, { opacity: backdropOpacity }]}
        />
        <Pressable
          accessibilityLabel="Cerrar notificaciones"
          accessibilityRole="button"
          onPress={dismissWithAnimation}
          style={styles.permissionBackdrop}
        />
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.permissionSheet,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={styles.permissionHandle} />
          <Text accessibilityRole="header" style={styles.permissionTitle}>
            Activar notificaciones
          </Text>
          <Text style={styles.permissionDescription}>
            Activa el permiso para recibir notificaciones importantes de tus
            reservas y novedades sobre tu negocio.
          </Text>
          <View style={styles.permissionActions}>
            <Pressable
              accessibilityLabel={
                'Ahora no, activar notificaciones m\u00e1s tarde'
              }
              accessibilityRole="button"
              onPress={dismissWithAnimation}
              style={styles.permissionSecondaryButton}
            >
              <Text style={styles.permissionSecondaryLabel}>Ahora no</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onAccept}
              style={styles.permissionPrimaryButton}
            >
              <Text style={styles.permissionPrimaryLabel}>Aceptar</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function WelcomeSurveySheet({
  onComplete,
  onDismiss,
  onSubmit,
  visible,
}: {
  readonly onComplete: () => void;
  readonly onDismiss: () => void;
  readonly onSubmit: (
    selectedOptions: readonly WelcomeSurveyOption[],
  ) => Promise<void>;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [selectedOptions, setSelectedOptions] = useState<WelcomeSurveyOption[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const dismissWithAnimation = () => {
    Animated.timing(sheetTranslateY, {
      duration: 180,
      easing: Easing.in(Easing.cubic),
      toValue: 520,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sheetTranslateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          dismissWithAnimation();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  if (!visible) return null;

  const toggleOption = (option: WelcomeSurveyOption) => {
    setError(null);
    setSelectedOptions((current) =>
      current.includes(option)
        ? current.filter((currentOption) => currentOption !== option)
        : [...current, option],
    );
  };

  const submit = async () => {
    if (selectedOptions.length === 0) {
      setError('Selecciona al menos una opci\u00f3n');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(selectedOptions);
      setIsSubmitted(true);
      closeTimer.current = setTimeout(onComplete, 900);
    } catch {
      setError('No pudimos guardar tu respuesta. Int\u00e9ntalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={dismissWithAnimation}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.welcomeSurveyOverlay}>
        <Pressable
          accessibilityLabel="Cerrar encuesta"
          accessibilityRole="button"
          onPress={dismissWithAnimation}
          style={styles.welcomeSurveyBackdrop}
        />
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.welcomeSurveySheet,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={styles.welcomeSurveyHandle} />
          <View style={styles.welcomeSurveyHeading}>
            <View style={styles.welcomeSurveyHand}>
              <Ionicons color="#101c2d" name="hand-left-outline" size={24} />
            </View>
            <Text accessibilityRole="header" style={styles.welcomeSurveyTitle}>
              Bienvenidos
            </Text>
          </View>
          <Text style={styles.welcomeSurveyIntro}>
            {
              '\u00bfPodr\u00edas dedicar 5 segundos a responder esta \u00fanica pregunta?'
            }
          </Text>
          <Text style={styles.welcomeSurveyQuestion}>
            {'Por favor, dinos: \u00bfd\u00f3nde conociste nuestro servicio?'}
          </Text>

          <View style={styles.welcomeSurveyOptions}>
            {WELCOME_SURVEY_OPTIONS.map((option) => {
              const isSelected = selectedOptions.includes(option);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  disabled={isSubmitted}
                  key={option}
                  onPress={() => toggleOption(option)}
                  style={[
                    styles.welcomeSurveyOption,
                    isSelected && styles.welcomeSurveyOptionSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.welcomeSurveyCheckbox,
                      isSelected && styles.welcomeSurveyCheckboxSelected,
                    ]}
                  >
                    {isSelected ? (
                      <Ionicons color="#ffffff" name="checkmark" size={17} />
                    ) : null}
                  </View>
                  <Text style={styles.welcomeSurveyOptionLabel}>{option}</Text>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Text style={styles.welcomeSurveyError}>{error}</Text>
          ) : null}
          {isSubmitted ? (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.welcomeSurveySuccess}
            >
              Respuesta guardada
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || isSubmitted}
            onPress={() => void submit()}
            style={[
              styles.welcomeSurveySubmit,
              (isSubmitting || isSubmitted) &&
                styles.welcomeSurveySubmitDisabled,
            ]}
          >
            <Text style={styles.welcomeSurveySubmitLabel}>
              Guardar respuesta
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function LegacyLocationBannerSheet({
  initialAddress,
  onComplete,
  onDismiss,
  onSubmit,
  visible,
}: {
  readonly initialAddress: string;
  readonly onComplete: () => void;
  readonly onDismiss: () => void;
  readonly onSubmit: (address: string) => Promise<void>;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState(initialAddress);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [markerPosition, setMarkerPosition] = useState({ left: 146, top: 54 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setAddress(initialAddress);
    setError(null);
    setIsSubmitted(false);
    sheetTranslateY.setValue(0);
  }, [initialAddress, sheetTranslateY, visible]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const dismissWithAnimation = () => {
    Animated.timing(sheetTranslateY, {
      duration: 180,
      easing: Easing.in(Easing.cubic),
      toValue: 520,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sheetTranslateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          dismissWithAnimation();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const submit = async () => {
    if (!address.trim()) {
      setError('Ingresa la direcci\u00f3n de tu negocio');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(address.trim());
      setIsSubmitted(true);
      closeTimer.current = setTimeout(onComplete, 900);
    } catch {
      setError(
        'No pudimos guardar la ubicaci\u00f3n. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={dismissWithAnimation}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.locationOverlay}>
        <Pressable
          accessibilityLabel="Cerrar ubicaci\u00f3n"
          accessibilityRole="button"
          onPress={dismissWithAnimation}
          style={styles.locationBackdrop}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
          style={styles.locationKeyboardArea}
        >
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.locationSheet,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
          <View style={styles.locationHandle} />
          <Text accessibilityRole="header" style={styles.locationTitle}>
            {'Ubicaci\u00f3n del negocio'}
          </Text>
          <Text style={styles.locationDescription}>
            {
              'Una direcci\u00f3n precisa ayuda a que m\u00e1s clientes encuentren tu negocio y reserven contigo.'
            }
          </Text>

          <View style={styles.locationInputWrap}>
            <Text style={styles.locationInputLabel}>{'Direcci\u00f3n'}</Text>
            <Ionicons color="#555a63" name="location-outline" size={21} />
            <TextInput
              accessibilityLabel="Direcci\u00f3n del negocio"
              editable={!isSubmitted}
              onChangeText={(value) => {
                setAddress(value);
                setError(null);
              }}
              placeholder="Ej. Av. Naciones Unidas y Av. Shyris"
              placeholderTextColor="#8e939b"
              style={styles.locationInput}
              value={address}
            />
          </View>

          <Pressable
            accessibilityHint="Toca para ajustar el marcador"
            accessibilityLabel="Mapa de ubicaci\u00f3n"
            accessibilityRole="button"
            disabled={isSubmitted}
            onPress={({ nativeEvent }) =>
              setMarkerPosition({
                left: Math.max(12, Math.min(nativeEvent.locationX - 15, 278)),
                top: Math.max(12, Math.min(nativeEvent.locationY - 34, 94)),
              })
            }
            style={styles.locationMap}
          >
            <View style={[styles.locationRoad, styles.locationRoadOne]} />
            <View style={[styles.locationRoad, styles.locationRoadTwo]} />
            <View style={styles.locationBuildingOne} />
            <View style={styles.locationBuildingTwo} />
            <View style={styles.locationBuildingThree} />
            <View style={styles.locationBuildingFour} />
            <View
              style={[
                styles.locationMarker,
                { left: markerPosition.left, top: markerPosition.top },
              ]}
            >
              <Ionicons color="#ffffff" name="location" size={19} />
            </View>
          </Pressable>
          <Text style={styles.locationMapHint}>
            Toca el mapa para ajustar el marcador
          </Text>

          {error ? <Text style={styles.locationError}>{error}</Text> : null}
          {isSubmitted ? (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.locationSuccess}
            >
              {'Ubicaci\u00f3n guardada'}
            </Text>
          ) : null}
          <View style={styles.locationActions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || isSubmitted}
              onPress={dismissWithAnimation}
              style={styles.locationSecondaryButton}
            >
              <Text style={styles.locationSecondaryLabel}>Ahora no</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || isSubmitted}
              onPress={() => void submit()}
              style={[
                styles.locationPrimaryButton,
                (isSubmitting || isSubmitted) && styles.locationButtonDisabled,
              ]}
            >
              <Text style={styles.locationPrimaryLabel}>
                {'Guardar ubicaci\u00f3n'}
              </Text>
            </Pressable>
          </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const layout = useNativeLayoutMetrics();
  const { session, showNotificationsAfterSignIn, user } = useAuth();
  const canPromptForNotifications = Boolean(
    session && user && showNotificationsAfterSignIn,
  );
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });
  const organizationQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentOrganizationResponse>(
        '/v1/organizations/current',
      ),
    queryKey: ['current-organization'],
  });
  const subscriptionQuery = useQuery({
    enabled: Boolean(session && user),
    queryFn: () =>
      requireApiClient().request<SubscriptionResponse>('/v1/subscription'),
    queryKey: ['subscription', user?.id],
    refetchInterval: 60_000,
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const operationTimeZone =
    organizationQuery.data?.location?.timezone ??
    organizationQuery.data?.organization.defaultTimezone ??
    'America/Guayaquil';
  const operationLocationId = organizationQuery.data?.location?.id;
  const operationDate = dateInTimeZone(operationTimeZone);
  const appointmentsQuery = useQuery({
    enabled: Boolean(session && operationLocationId),
    queryFn: () =>
      requireApiClient().request<AppointmentsResponse>(
        `/v1/appointments?date=${operationDate}&locationId=${encodeURIComponent(operationLocationId ?? '')}`,
      ),
    queryKey: [
      'agenda-appointments',
      'dashboard',
      operationLocationId,
      operationDate,
    ],
  });
  const cashRegisterQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentCashRegisterResponse>(
        '/v1/cash-register/current',
      ),
    queryKey: ['cash-register-current'],
  });
  const cashSummaryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CashRegisterSummaryResponse>(
        '/v1/cash-register/summary',
      ),
    queryKey: ['cash-register-summary'],
  });
  const inventoryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<InventoryResponse>('/v1/inventory'),
    queryKey: ['inventory'],
  });

  const businessName = accountQuery.data?.businessName ?? 'Tu negocio';
  const [progressClock, setProgressClock] = useState(() => Date.now());
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
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
  const bookingUrl = /^https?:\/\/\S+$/i.test(rawBookingUrl)
    ? rawBookingUrl
    : '';
  const shouldShowWelcome =
    accountQuery.isSuccess && !accountQuery.data?.onboardingCompletedAt;
  const extraQuickActions = EXTRA_QUICK_ACTIONS.filter((action) =>
    extraQuickActionIds.includes(action.id),
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
          organizationQuery.data?.organization.currencyCode ??
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
      organizationQuery.data?.organization.currencyCode,
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

    // A pending business location is required for the booking experience, so
    // show that prompt before optional notification permissions.
    if (needsLocationBanner === null || needsLocationBanner) {
      if (needsLocationBanner) setNotificationFlowState('completed');
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

    // The notification prompt is intentionally only offered after a manual
    // sign-in. A restored session must still complete this stage; otherwise it
    // blocks the Welcome and business-location flows forever.
    if (!canPromptForNotifications) {
      setNotificationFlowState('completed');
      return () => {
        isMounted = false;
      };
    }

    const checkNotificationPermission = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (isMounted) {
          const shouldRequestPermission =
            status !== Notifications.PermissionStatus.GRANTED &&
            canPromptForNotifications;

          if (shouldRequestPermission) {
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
  }, [canPromptForNotifications, isDashboardFocused, needsLocationBanner]);

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
    isNotificationSheetOpen,
    isWelcomeSurveyOpen,
    needsLocationBanner,
  ]);

  const completeNotificationFlow = () => {
    setIsNotificationSheetOpen(false);
    setNotificationFlowState('completed');
  };

  const requestNotificationPermission = async () => {
    try {
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
    if (!user || extraQuickActionIds.includes(id)) return;
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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/business-summary')}
              style={styles.summaryButton}
            >
              <Text style={styles.summaryLabel}>Resumen</Text>
              <Ionicons color="#B47D17" name="bar-chart-outline" size={22} />
            </Pressable>
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
            label="Inventario"
            onPress={() => router.push('/inventory')}
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
                  label={action.label}
                  onPress={() => router.push(action.route as never)}
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
            <View style={styles.subscriptionNoticeTopRow}>
              <View style={styles.subscriptionNoticeCopyColumn}>
                <Text style={styles.cardTitle}>{planRenewalNotice.title}</Text>
                <Text style={styles.cardCopy}>{planRenewalNotice.copy}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/subscription')}
                  style={styles.subscriptionUpgradeButton}
                >
                  <Text style={styles.subscriptionUpgradeLabel}>
                    Ver planes
                  </Text>
                  <Ionicons
                    color={appTheme.colors.white}
                    name="arrow-forward"
                    size={18}
                  />
                </Pressable>
              </View>
              <View style={styles.subscriptionNoticeImageColumn}>
                <Image
                  accessibilityLabel="Corona dorada de suscripcion"
                  resizeMode="contain"
                  source={require('../../assets/suscripcion.png')}
                  style={styles.subscriptionCrown}
                />
              </View>
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
        onClose={() => setIsQuickActionsPickerOpen(false)}
        onSelect={addExtraQuickAction}
        selectedIds={extraQuickActionIds}
        visible={isQuickActionsPickerOpen}
      />
      <NotificationPermissionSheet
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
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  addQuickAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(199, 149, 50, 0.28)',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 14,
    ...goldButtonShadow,
  },
  addQuickActionIcon: {
    alignItems: 'center',
    backgroundColor: '#B47D17',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  addQuickActionLabel: {
    color: '#B47D17',
    fontSize: 13,
    fontWeight: '800',
  },
  addQuickActionRow: { alignItems: 'center', marginTop: 14 },
  businessName: {
    color: '#111111',
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -1.2,
    marginTop: 2,
  },
  cardCopy: { color: '#000000', fontSize: 15, lineHeight: 22, marginTop: 12 },
  cardHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#1C1C1C',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },

  content: { paddingBottom: 126, paddingHorizontal: 24, paddingTop: 17 },
  greeting: { color: '#555555', fontSize: 17, lineHeight: 24 },
  linkBox: {
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
    borderRadius: 17,
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    minHeight: 72,
    padding: 11,
  },
  linkCopy: { flex: 1 },
  linkLabel: { color: '#000000', fontSize: 12, marginBottom: 5 },
  linkValue: {
    color: '#1C1C1C',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  locationActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  locationBackdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  locationBuildingFour: {
    backgroundColor: '#cfd1d4',
    borderRadius: 5,
    bottom: 12,
    height: 29,
    position: 'absolute',
    right: 18,
    width: 51,
  },
  locationBuildingOne: {
    backgroundColor: '#d6d8dc',
    borderRadius: 5,
    height: 42,
    left: 23,
    position: 'absolute',
    top: 17,
    width: 62,
  },
  locationBuildingThree: {
    backgroundColor: '#c7cacf',
    borderRadius: 5,
    height: 44,
    left: 28,
    position: 'absolute',
    top: 87,
    width: 74,
  },
  locationBuildingTwo: {
    backgroundColor: '#c2c5ca',
    borderRadius: 5,
    height: 35,
    position: 'absolute',
    right: 27,
    top: 26,
    width: 76,
  },
  locationButtonDisabled: { opacity: 0.65 },
  locationDescription: {
    color: '#555a63',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  locationError: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 13,
    textAlign: 'center',
  },
  locationHandle: {
    alignSelf: 'center',
    backgroundColor: '#a4a7ad',
    borderRadius: 4,
    height: 5,
    marginBottom: 22,
    width: 46,
  },
  locationInput: {
    color: '#101c2d',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
    paddingBottom: 8,
    paddingTop: 8,
  },
  locationInputLabel: {
    backgroundColor: '#f4f4f3',
    color: '#555a63',
    fontSize: 12,
    left: 13,
    paddingHorizontal: 4,
    position: 'absolute',
    top: -8,
    zIndex: 1,
  },
  locationInputWrap: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    marginTop: 24,
    minHeight: 58,
    paddingHorizontal: 15,
  },
  locationMap: {
    backgroundColor: '#e9eaec',
    borderRadius: 20,
    height: 145,
    marginTop: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  locationMapHint: {
    color: '#555a63',
    fontSize: 13,
    marginTop: 9,
    textAlign: 'center',
  },
  locationMarker: {
    alignItems: 'center',
    backgroundColor: '#1c1f24',
    borderRadius: 18,
    elevation: 4,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#B47D17',
    shadowOpacity: 0.24,
    shadowRadius: 5,
    width: 36,
  },
  locationOverlay: { flex: 1, justifyContent: 'flex-end' },
  locationKeyboardArea: { flex: 1, justifyContent: 'flex-end' },
  locationPrimaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 28,
    borderWidth: 0,
    flex: 1.25,
    justifyContent: 'center',
    minHeight: 56,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  locationPrimaryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  locationRoad: {
    backgroundColor: '#f9f9f8',
    position: 'absolute',
  },
  locationRoadOne: {
    height: 21,
    left: -8,
    right: -8,
    top: 67,
    transform: [{ rotate: '-9deg' }],
  },
  locationRoadTwo: {
    bottom: -12,
    top: -12,
    transform: [{ rotate: '27deg' }],
    width: 19,
    left: '52%',
  },
  locationSecondaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 28,
    borderWidth: 0,
    flex: 0.75,
    justifyContent: 'center',
    minHeight: 56,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  locationSecondaryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  locationSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    elevation: 14,
    paddingHorizontal: 24,
    paddingTop: 14,
    shadowColor: '#B47D17',
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  locationSuccess: {
    color: '#277a48',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 13,
    textAlign: 'center',
  },
  locationTitle: {
    color: '#101c2d',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  permissionActions: { flexDirection: 'row', gap: 12, marginTop: 30 },
  permissionBackdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  permissionDescription: {
    color: '#555a63',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 13,
    textAlign: 'center',
  },
  permissionHandle: {
    alignSelf: 'center',
    backgroundColor: '#a4a7ad',
    borderRadius: 4,
    height: 5,
    marginBottom: 24,
    width: 46,
  },
  permissionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  permissionPrimaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 28,
    borderWidth: 0,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  permissionPrimaryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '900',
  },
  permissionSecondaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 28,
    borderWidth: 0,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  permissionSecondaryLabel: {
    color: '#B47D17',
    fontSize: 16,
    fontWeight: '900',
  },
  permissionSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  permissionTitle: {
    color: '#101c2d',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: '#C79532',
    borderBottomColor: 'rgba(255, 244, 214, 0.42)',
    borderBottomWidth: 1,
    borderLeftColor: 'rgba(255, 244, 214, 0.42)',
    borderLeftWidth: 1,
    borderRadius: 15,
    borderRightColor: 'rgba(255, 244, 214, 0.42)',
    borderRightWidth: 1,
    borderTopColor: 'rgba(255, 244, 214, 0.42)',
    borderTopWidth: 1,
    elevation: 4,
    ...Platform.select({
      web: {
        experimental_backgroundImage:
          'linear-gradient(135deg, #C79532 0%, #E1B85B 50%, #B47D17 100%)',
      },
    }),
    justifyContent: 'center',
    minHeight: 51,
    overflow: 'visible',
    paddingHorizontal: 19,
    shadowColor: '#B47D17',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
  },
  openButtonFlare: {
    backgroundColor: '#FFFDF2',
    borderRadius: 3,
    bottom: -1,
    ...Platform.select({
      android: { elevation: 2 },
      default: {
        shadowColor: '#FFE7A3',
        shadowOpacity: 0.64,
        shadowRadius: 8,
      },
      web: {
        boxShadow:
          '0 0 3px 1px rgba(255, 255, 255, 0.96), 0 0 8px 4px rgba(255, 231, 163, 0.64), 0 2px 14px 7px rgba(225, 184, 91, 0.28)',
      },
    }),
    height: 3,
    position: 'absolute',
    width: 6,
    zIndex: 3,
  },
  openButtonBottomGlow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    bottom: 1,
    ...Platform.select({
      android: { elevation: 1 },
      default: {
        shadowColor: '#FFF6DA',
        shadowOpacity: 0.2,
        shadowRadius: 5,
      },
      web: { boxShadow: '0 -1px 5px 1px rgba(255, 246, 218, 0.2)' },
    }),
    height: 1,
    left: 10,
    position: 'absolute',
    right: 10,
    zIndex: 2,
  },
  openButtonInnerBorder: {
    borderColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 13,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    position: 'absolute',
    right: 1,
    top: 1,
    zIndex: 1,
  },
  openLabel: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  qrBadge: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    elevation: 4,
    height: 58,
    justifyContent: 'center',
    shadowColor: '#B47D17',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 9,
    width: 58,
  },
  qrSparkle: {
    backgroundColor: '#E1B85B',
    borderRadius: 5,
    height: 7,
    position: 'absolute',
    right: 1,
    top: 8,
    width: 7,
  },
  quickAction: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 22,
  },
  operationAction: { color: '#9A6A17', fontSize: 12, fontWeight: '900' },
  operationActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 7,
  },
  operationCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(199, 149, 50, 0.16)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 96,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  operationCardAlert: {
    backgroundColor: '#FFF9EE',
    borderColor: 'rgba(204, 142, 35, 0.28)',
  },
  operationCopy: { flex: 1, minWidth: 0 },
  operationDescription: { color: '#69717D', fontSize: 13, marginTop: 3 },
  operationIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(235, 216, 170, 0.42)',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  operationIconAlert: { backgroundColor: 'rgba(244, 194, 97, 0.25)' },
  operationTitle: { color: '#1C1C1C', fontSize: 15, fontWeight: '900' },
  operationsCaption: { color: '#69717D', fontSize: 13, marginTop: 3 },
  operationsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  operationsList: { gap: 10, marginTop: 13 },
  operationsSection: { marginTop: 28 },
  operationsTitle: { color: '#1C1C1C', fontSize: 21, fontWeight: '900' },
  extraQuickActionRemove: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: '#E6C1BE',
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 3,
    top: -3,
    width: 28,
    zIndex: 2,
  },
  extraQuickActionSlot: { position: 'relative', width: '25%' },
  extraQuickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    rowGap: 14,
  },
  quickActionsPicker: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderRadius: 28,
    marginHorizontal: 24,
    paddingBottom: 20,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  quickActionsPickerBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  quickActionsPickerCopy: {
    color: '#555A63',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  quickActionsPickerEmpty: {
    color: '#555A63',
    fontSize: 14,
    paddingVertical: 18,
    textAlign: 'center',
  },
  quickActionsPickerHandle: {
    alignSelf: 'center',
    backgroundColor: '#C8C9CB',
    borderRadius: 4,
    height: 5,
    width: 42,
  },
  quickActionsPickerIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(235, 216, 170, 0.34)',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  quickActionsPickerLabel: {
    color: '#1C1C1C',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  quickActionsPickerList: { marginTop: 17 },
  quickActionsPickerOption: {
    alignItems: 'center',
    borderTopColor: 'rgba(228, 225, 218, 0.8)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
  },
  quickActionsPickerOverlay: {
    backgroundColor: 'rgba(16, 28, 45, 0.38)',
    flex: 1,
    justifyContent: 'center',
  },
  quickActionsPickerTitle: {
    color: '#1C1C1C',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 15,
    textAlign: 'center',
  },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 3,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#B47D17',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    width: 54,
  },
  quickIconShimmer: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    bottom: -20,
    left: 21,
    position: 'absolute',
    shadowColor: '#B47D17',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    top: -20,
    width: 13,
  },
  quickLabel: {
    color: '#1C1C1C',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  subscriptionNoticeCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.accentLight,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    marginTop: 24,
    overflow: 'hidden',
    padding: 22,
    ...goldButtonShadow,
  },
  subscriptionNoticeCopyColumn: {
    flex: 1.18,
    paddingVertical: 8,
  },
  subscriptionNoticeImageColumn: {
    alignItems: 'center',
    flex: 0.82,
    justifyContent: 'center',
  },
  subscriptionNoticeTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  subscriptionCrown: {
    height: 154,
    width: '145%',
  },
  subscriptionUpgradeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 46,
    paddingHorizontal: 16,
    ...goldButtonShadow,
  },
  subscriptionUpgradeLabel: {
    color: appTheme.colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    elevation: 3,
    marginTop: 24,
    padding: 22,
    shadowColor: '#B47D17',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  reservationChair: {
    height: 220,
    width: '128%',
  },
  reservationCopyColumn: {
    flex: 1,
    paddingVertical: 8,
  },
  reservationLinkBox: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
    minHeight: 0,
    padding: 10,
  },
  reservationImageColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  reservationOpenButton: {
    alignSelf: 'stretch',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  reservationTopRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  salesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    minHeight: 202,
    marginTop: 48,
    overflow: 'hidden',
    padding: 21,
    position: 'relative',
    elevation: 4,
    shadowColor: '#B47D17',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },
  salesHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1,
  },
  salesMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    position: 'relative',
    zIndex: 1,
  },
  salesMetaText: { color: '#000000', fontSize: 15 },
  salesPlanLabel: {
    color: '#555555',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
  salesTitle: { color: '#1C1C1C', fontSize: 18, fontWeight: '600' },
  salesTitleColumn: { flex: 1, minWidth: 0, paddingRight: 12 },
  screen: appStyles.screen,
  summaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 22,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 15,
    shadowColor: '#B47D17',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  summaryLabel: { color: '#B47D17', fontSize: 16, fontWeight: '800' },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  topCopy: { flex: 1, minWidth: 0, paddingRight: 64 },
  welcome: { alignItems: 'center', marginTop: 52 },
  welcomeCopy: {
    color: '#555a63',
    fontSize: 19,
    marginTop: 10,
    textAlign: 'center',
  },
  welcomeTitle: {
    color: '#101c2d',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  welcomeSurveyBackdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  welcomeSurveyCheckbox: {
    alignItems: 'center',
    borderRadius: 9,
    height: 24,
    justifyContent: 'center',
    marginRight: 13,
    width: 24,
  },
  welcomeSurveyCheckboxSelected: {
    backgroundColor: '#1c1f24',
  },
  welcomeSurveyError: {
    color: '#b42318',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
  welcomeSurveyHand: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  welcomeSurveyHandle: {
    alignSelf: 'center',
    backgroundColor: '#a4a7ad',
    borderRadius: 4,
    height: 5,
    marginBottom: 22,
    width: 46,
  },
  welcomeSurveyHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
  },
  welcomeSurveyIntro: {
    color: '#555a63',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 16,
  },
  welcomeSurveyOption: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    minHeight: 53,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  welcomeSurveyOptionLabel: {
    color: '#101c2d',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  welcomeSurveyOptionSelected: {
    backgroundColor: '#e8e9eb',
  },
  welcomeSurveyOptions: { gap: 9, marginTop: 18 },
  welcomeSurveyOverlay: { flex: 1, justifyContent: 'flex-end' },
  welcomeSurveyQuestion: {
    color: '#101c2d',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 22,
  },
  welcomeSurveySheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    elevation: 14,
    paddingHorizontal: 24,
    paddingTop: 14,
    shadowColor: '#B47D17',
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  welcomeSurveySubmit: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 28,
    borderWidth: 0,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 56,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  welcomeSurveySubmitDisabled: { opacity: 0.65 },
  welcomeSurveySubmitLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '900',
  },
  welcomeSurveySuccess: {
    color: '#277a48',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  welcomeSurveyTitle: {
    color: '#101c2d',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
});
