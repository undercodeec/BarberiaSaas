export const SESSION_ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1_000;

export function shouldTouchSession(lastActiveAt: Date, now: Date): boolean {
  return (
    now.getTime() - lastActiveAt.getTime() >= SESSION_ACTIVITY_TOUCH_INTERVAL_MS
  );
}
