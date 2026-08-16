type NotificationData = {
  readonly appointmentStartsAt?: unknown;
  readonly route?: unknown;
};

export function notificationDestination(data: NotificationData | undefined) {
  const route = typeof data?.route === 'string' ? data.route : '/agenda';
  const startsAt = data?.appointmentStartsAt;
  if (
    route === '/agenda' &&
    typeof startsAt === 'string' &&
    !Number.isNaN(Date.parse(startsAt))
  )
    return `/agenda?date=${encodeURIComponent(startsAt)}`;
  return route;
}
