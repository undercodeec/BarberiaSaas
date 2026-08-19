type NotificationData = {
  readonly appointmentStartsAt?: unknown;
  readonly route?: unknown;
  readonly type?: unknown;
};

export type NotificationRole =
  | 'barber'
  | 'manager'
  | 'owner'
  | 'receptionist';

const APPOINTMENT_NOTIFICATION_TYPES = new Set([
  'appointment_cancelled',
  'appointment_created',
  'appointment_rescheduled',
  'cancelled',
  'created',
  'rescheduled',
]);
const AGENDA_ROLES = new Set<NotificationRole>([
  'barber',
  'manager',
  'owner',
  'receptionist',
]);

export function notificationDestination(
  data: NotificationData | undefined,
  role: NotificationRole | undefined,
) {
  if (
    !role ||
    !AGENDA_ROLES.has(role) ||
    typeof data?.type !== 'string' ||
    !APPOINTMENT_NOTIFICATION_TYPES.has(data.type)
  )
    return null;

  const startsAt = data?.appointmentStartsAt;
  if (
    typeof startsAt === 'string' &&
    startsAt.length <= 64 &&
    !Number.isNaN(Date.parse(startsAt))
  )
    return `/agenda?date=${encodeURIComponent(startsAt)}`;
  return '/agenda';
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
