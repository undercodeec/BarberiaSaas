type NotificationData = {
  readonly appointmentStartsAt?: unknown;
  readonly locationId?: unknown;
  readonly route?: unknown;
  readonly type?: unknown;
};

export type NotificationRole = 'barber' | 'manager' | 'owner' | 'receptionist';

const APPOINTMENT_NOTIFICATION_TYPES = new Set([
  'appointment_cancelled',
  'appointment_created',
  'appointment_reminder',
  'appointment_rescheduled',
  'cancelled',
  'created',
  'rescheduled',
  'schedule_updated',
]);
const PAYMENT_CONFIRMATION_TYPES = new Set(['payment_confirmation_required']);
const REVIEW_TYPES = new Set(['review_negative']);
const CASH_TYPES = new Set([
  'cash_income_recorded',
  'cash_register_closed',
  'cash_register_variance',
]);
const COMMISSION_TYPES = new Set(['commission_earned']);
const INVENTORY_TYPES = new Set(['low_stock']);
const TEAM_TYPES = new Set(['team_member_accepted', 'team_member_updated']);
const SUBSCRIPTION_TYPES = new Set(['subscription_renewal']);
const AGENDA_ROLES = new Set<NotificationRole>([
  'barber',
  'manager',
  'owner',
  'receptionist',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function notificationDestination(
  data: NotificationData | undefined,
  role: NotificationRole | undefined,
) {
  if (
    (role === 'owner' || role === 'manager') &&
    typeof data?.type === 'string' &&
    PAYMENT_CONFIRMATION_TYPES.has(data.type)
  )
    return '/payment-confirmations';
  if (
    (role === 'owner' || role === 'manager') &&
    typeof data?.type === 'string' &&
    REVIEW_TYPES.has(data.type)
  )
    return '/reviews-management';
  if (
    (role === 'owner' || role === 'manager') &&
    typeof data?.type === 'string' &&
    CASH_TYPES.has(data.type)
  )
    return '/cash-register';
  if (
    role === 'barber' &&
    typeof data?.type === 'string' &&
    COMMISSION_TYPES.has(data.type)
  )
    return '/wallet?tab=commissions';
  if (
    (role === 'owner' || role === 'manager') &&
    typeof data?.type === 'string' &&
    INVENTORY_TYPES.has(data.type)
  )
    return '/inventory';
  if (
    typeof data?.type === 'string' &&
    TEAM_TYPES.has(data.type) &&
    (role === 'owner' ||
      role === 'manager' ||
      data.type === 'team_member_updated')
  )
    return '/team-management';
  if (
    role === 'owner' &&
    typeof data?.type === 'string' &&
    SUBSCRIPTION_TYPES.has(data.type)
  )
    return '/subscription';
  if (
    !role ||
    !AGENDA_ROLES.has(role) ||
    typeof data?.type !== 'string' ||
    !APPOINTMENT_NOTIFICATION_TYPES.has(data.type)
  )
    return null;

  const query = new URLSearchParams();
  const startsAt = data?.appointmentStartsAt;
  if (
    typeof startsAt === 'string' &&
    startsAt.length <= 64 &&
    !Number.isNaN(Date.parse(startsAt))
  )
    query.set('date', startsAt);

  if (
    typeof data?.locationId === 'string' &&
    UUID_PATTERN.test(data.locationId)
  )
    query.set('locationId', data.locationId);

  const search = query.toString();
  return search ? `/agenda?${search}` : '/agenda';
}

interface NotificationResponseData {
  readonly data: NotificationData | undefined;
  readonly id: string;
}

export function createNotificationResponseConsumer(input: {
  readonly clearLastResponse: () => Promise<void>;
  readonly navigate: (destination: string) => void;
  readonly role: NotificationRole | undefined;
}) {
  const consumedIds = new Set<string>();

  return async (response: NotificationResponseData) => {
    if (consumedIds.has(response.id)) return false;
    consumedIds.add(response.id);

    const destination = notificationDestination(response.data, input.role);
    await input.clearLastResponse().catch(() => undefined);
    if (!destination) return false;

    input.navigate(destination);
    return true;
  };
}
