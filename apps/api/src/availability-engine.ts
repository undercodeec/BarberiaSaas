export interface AvailabilityRange {
  readonly endsAt: Date;
  readonly startsAt: Date;
}

export interface AvailabilityWindow {
  readonly endMinute: number;
  readonly startMinute: number;
}

export interface AvailabilitySlot {
  readonly endsAt: string;
  readonly startsAt: string;
}

export interface BuildAvailabilityInput {
  readonly date: string;
  readonly durationMinutes: number;
  readonly excludePast?: boolean;
  readonly now?: Date;
  readonly occupied: readonly AvailabilityRange[];
  readonly respectWindowEnd?: boolean;
  readonly stepMinutes: number;
  readonly timeZone: string;
  readonly toUtc: (date: string, minuteOfDay: number, timeZone: string) => Date;
  readonly windows: readonly AvailabilityWindow[];
}

export interface AvailabilityResult {
  readonly slots: readonly AvailabilitySlot[];
  readonly unavailableSlots: readonly AvailabilitySlot[];
}

export function mergeRanges(
  ranges: readonly AvailabilityRange[],
): readonly AvailabilityRange[] {
  const ordered = ranges
    .filter(({ endsAt, startsAt }) => endsAt > startsAt)
    .toSorted(
      (left, right) =>
        left.startsAt.getTime() - right.startsAt.getTime() ||
        left.endsAt.getTime() - right.endsAt.getTime(),
    );
  const merged: AvailabilityRange[] = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (!previous || range.startsAt > previous.endsAt) {
      merged.push({ ...range });
      continue;
    }
    if (range.endsAt > previous.endsAt) {
      merged[merged.length - 1] = { ...previous, endsAt: range.endsAt };
    }
  }
  return merged;
}

export function buildAvailability(
  input: BuildAvailabilityInput,
): AvailabilityResult {
  if (input.durationMinutes <= 0 || input.stepMinutes <= 0)
    throw new Error('La duración y el intervalo deben ser positivos.');
  const slots: AvailabilitySlot[] = [];
  const unavailableSlots: AvailabilitySlot[] = [];
  const occupied = mergeRanges(input.occupied);
  const windows = input.windows.toSorted(
    (left, right) => left.startMinute - right.startMinute,
  );
  let occupiedIndex = 0;
  for (const window of windows) {
    const windowEndsAt = input.respectWindowEnd
      ? input.toUtc(input.date, window.endMinute, input.timeZone)
      : null;
    for (
      let minute = window.startMinute;
      minute + input.durationMinutes <= window.endMinute;
      minute += input.stepMinutes
    ) {
      const startsAt = input.toUtc(input.date, minute, input.timeZone);
      const endsAt = new Date(
        startsAt.getTime() + input.durationMinutes * 60_000,
      );
      const slot = {
        endsAt: endsAt.toISOString(),
        startsAt: startsAt.toISOString(),
      };
      while (
        occupiedIndex < occupied.length &&
        occupied[occupiedIndex]!.endsAt <= startsAt
      ) {
        occupiedIndex += 1;
      }
      const conflict = occupied[occupiedIndex];
      const isOccupied = Boolean(conflict && conflict.startsAt < endsAt);
      const isPast =
        input.excludePast === true && startsAt <= (input.now ?? new Date());
      const exceedsWindow = windowEndsAt !== null && endsAt > windowEndsAt;
      if (isOccupied || isPast || exceedsWindow) unavailableSlots.push(slot);
      else slots.push(slot);
    }
  }
  return { slots, unavailableSlots };
}
