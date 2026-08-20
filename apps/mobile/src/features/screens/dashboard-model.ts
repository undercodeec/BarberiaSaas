import type Ionicons from '@expo/vector-icons/Ionicons';
import type {
  AppointmentRecord,
  CashRegisterSummaryResponse,
  CurrentCashRegisterResponse,
  InventoryResponse,
  SubscriptionResponse,
} from '@barber-saas/api-client';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { requireApiClient } from '../../lib/api';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SUBSCRIPTION_NOTICE_TRIAL_DAYS = 3;
export const SUBSCRIPTION_NOTICE_ACTIVE_DAYS = 7;
export const DASHBOARD_BANNER_DELAY_MS = 10_000;
export const LOCATION_BANNER_DELAY_MS = 500;
export const WELCOME_SURVEY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const WELCOME_SURVEY_RESPONSE_KEY = 'barber-saas.welcome-survey-response';
export const QUICK_ACTIONS_STORAGE_KEY = 'barber-saas.dashboard-quick-actions';
export const WELCOME_SURVEY_OPTIONS = [
  'Publicidad',
  'Redes sociales de Nava (Facebook o Instagram)',
  'Buscador',
  'Recomendaci\u00f3n de una academia, clase u otro negocio',
  'Evento o feria',
] as const;

export type WelcomeSurveyOption = (typeof WELCOME_SURVEY_OPTIONS)[number];
export type ExtraQuickActionId =
  | 'agenda'
  | 'booking-settings'
  | 'cash-register'
  | 'clients'
  | 'collaborators'
  | 'notifications'
  | 'reviews-management';

export const EXTRA_QUICK_ACTIONS: ReadonlyArray<{
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

export function welcomeSurveyStorageKey(userId: string) {
  return `${WELCOME_SURVEY_RESPONSE_KEY}.${userId}`;
}

export function quickActionsStorageKey(userId: string) {
  return `${QUICK_ACTIONS_STORAGE_KEY}.${userId}`;
}

export async function getExtraQuickActionIds(userId: string) {
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

export async function storeExtraQuickActionIds(
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

export async function getWelcomeSurveyResponse(
  userId: string,
): Promise<string | null> {
  const key = welcomeSurveyStorageKey(userId);
  if (Platform.OS === 'web') return globalThis.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function storeWelcomeSurveyResponse(
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

export async function markWelcomeSurveyDismissed(
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

export function shouldShowWelcomeSurvey(
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

export async function syncPushToken() {
  if (Platform.OS === 'web') return;
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
}
export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '\u00a1Buenos d\u00edas! Bienvenido';
  if (hour < 19) return '\u00a1Buenas tardes! Bienvenido';
  return '\u00a1Buenas noches! Bienvenido';
}

export type DashboardProgressProps = {
  readonly caption: string;
  readonly value: number;
};

export type SubscriptionProgress = {
  readonly caption: string;
  readonly daysRemaining: number | null;
  readonly phase: 'active' | 'expired' | 'grace' | 'trial' | 'unknown';
  readonly expiryLabel: string;
  readonly planLabel: string | null;
  readonly percentage: number;
  readonly title: string;
};

export function dateTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function expiryDateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function subscriptionProgress(
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

export type SubscriptionNotice = {
  readonly copy: string;
  readonly title: string;
};

export function subscriptionNotice(
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
export type DashboardOperation = {
  readonly actionLabel: string;
  readonly description: string;
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly id: 'appointment' | 'cash-register' | 'inventory';
  readonly priority: number;
  readonly route: '/agenda' | '/cash-register' | '/inventory';
  readonly title: string;
};

export function dateInTimeZone(timeZone: string): string {
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

export function appointmentStatusLabel(status: AppointmentRecord['status']): string {
  if (status === 'awaiting_confirmation') return 'Por confirmar';
  if (status === 'checked_in') return 'Cliente en el local';
  if (status === 'confirmed') return 'Confirmada';
  if (status === 'in_progress') return 'En curso';
  if (status === 'pending_verification') return 'Verificación pendiente';
  if (status === 'scheduled') return 'Agendada';
  if (status === 'waiting') return 'En espera';
  return 'Próxima cita';
}

export function formatOperationMoney(value: number, currencyCode: string): string {
  return new Intl.NumberFormat('es-EC', {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(value / 100);
}

export function timeInTimeZone(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

export function dashboardOperations({
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
