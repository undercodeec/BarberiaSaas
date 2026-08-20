export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function mondayOfWeek(date: Date): Date {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function sameDate(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function calendarDateForTimeZone(
  timeZone: string,
  dateValue = new Date(),
): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(dateValue);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(value('year'), value('month') - 1, value('day'), 12);
}

export function daysInMonth(date: Date): Date[] {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const numberOfDays = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  return Array.from({ length: numberOfDays }, (_, index) =>
    addDays(firstDay, index),
  );
}

export function calendarGrid(date: Date): ReadonlyArray<Date | null> {
  const monthDays = daysInMonth(date);
  const firstWeekday = monthDays[0]?.getDay() ?? 1;
  const leadingDays = firstWeekday === 0 ? 6 : firstWeekday - 1;
  return [...Array<Date | null>(leadingDays).fill(null), ...monthDays];
}

export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  return (
    String(hours).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
  );
}

export function minuteAtTimeZone(value: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
}

export type PayphoneManualConfirmationResponse = {
  readonly activeConfiguration: boolean;
  readonly appointment: {
    readonly clientName: string;
    readonly startsAt: string;
    readonly totalCents: number;
  };
  readonly eligible: boolean;
  readonly paymentStatus: 'paid' | 'pending';
  readonly attempt: {
    readonly confirmedAt: string | null;
    readonly confirmedByName: string | null;
    readonly currencyCode: string;
    readonly expiresAt: string;
    readonly note: string | null;
    readonly reference: string | null;
    readonly status: 'confirmed_manually' | 'expired' | 'pending_verification';
    readonly transactionReference: string;
  } | null;
};
export type AgendaStatusFilter =
  | 'active'
  | 'all'
  | 'completed'
  | 'confirmed'
  | 'in_progress'
  | 'no_show'
  | 'paid'
  | 'scheduled'
  | 'waiting';

export function timelineMinutes(
  schedules: ReadonlyArray<{
    readonly endMinute: number;
    readonly startMinute: number;
  }>,
): number[] {
  const times = new Set<number>();
  for (const schedule of schedules) {
    for (
      let minute = schedule.startMinute;
      minute < schedule.endMinute;
      minute += 60
    )
      times.add(minute);
    times.add(schedule.endMinute);
  }
  return [...times].sort((first, second) => first - second);
}
