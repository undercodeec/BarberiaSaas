import { describe, expect, it } from 'vitest';

import {
  buildAvailability,
  mergeRanges,
  type AvailabilityRange,
} from './availability-engine';

function utc(_date: string, minute: number): Date {
  return new Date(Date.UTC(2026, 8, 4, 0, minute));
}

function range(startMinute: number, endMinute: number): AvailabilityRange {
  return {
    endsAt: utc('2026-09-04', endMinute),
    startsAt: utc('2026-09-04', startMinute),
  };
}

describe('availability-engine', () => {
  it('fusiona rangos superpuestos y adyacentes', () => {
    expect(
      mergeRanges([range(540, 570), range(560, 600), range(600, 615)]),
    ).toEqual([range(540, 615)]);
  });

  it('mantiene disponible una cita que toca exactamente el límite anterior', () => {
    const result = buildAvailability({
      date: '2026-09-04',
      durationMinutes: 30,
      occupied: [range(540, 570)],
      stepMinutes: 30,
      timeZone: 'UTC',
      toUtc: utc,
      windows: [{ endMinute: 630, startMinute: 540 }],
    });
    expect(result.slots.map(({ startsAt }) => startsAt)).toContain(
      utc('2026-09-04', 570).toISOString(),
    );
  });

  it('respeta múltiples ventanas, el cierre y las franjas pasadas', () => {
    const result = buildAvailability({
      date: '2026-09-04',
      durationMinutes: 30,
      excludePast: true,
      now: utc('2026-09-04', 610),
      occupied: [],
      stepMinutes: 30,
      timeZone: 'UTC',
      toUtc: utc,
      windows: [
        { endMinute: 600, startMinute: 540 },
        { endMinute: 690, startMinute: 630 },
      ],
    });
    expect(result.slots.map(({ startsAt }) => startsAt)).toEqual([
      utc('2026-09-04', 630).toISOString(),
      utc('2026-09-04', 660).toISOString(),
    ]);
    expect(result.unavailableSlots).toHaveLength(2);
  });

  it('puede respetar el cierre real de una ventana en un cambio horario', () => {
    const dstConverter = (_date: string, minute: number) =>
      new Date(Date.UTC(2026, 2, 29, 0, minute < 120 ? minute : minute - 60));
    const result = buildAvailability({
      date: '2026-03-29',
      durationMinutes: 60,
      occupied: [],
      respectWindowEnd: true,
      stepMinutes: 30,
      timeZone: 'Europe/Madrid',
      toUtc: dstConverter,
      windows: [{ endMinute: 180, startMinute: 90 }],
    });
    expect(result.slots).toHaveLength(1);
    expect(result.unavailableSlots).toHaveLength(1);
  });
});
