export type AgendaView = 'day' | 'month' | 'week';

function atLocalNoon(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

function addDays(value: Date, days: number): Date {
  const result = atLocalNoon(value);
  result.setDate(result.getDate() + days);
  return result;
}

function mondayOfWeek(value: Date): Date {
  const day = value.getDay();
  return addDays(value, day === 0 ? -6 : 1 - day);
}

export function localCalendarDate(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function agendaRange(
  view: AgendaView,
  selectedDay: Date,
): { readonly from: string; readonly to: string } {
  const day = atLocalNoon(selectedDay);
  if (view === 'day') {
    const value = localCalendarDate(day);
    return { from: value, to: value };
  }

  if (view === 'week') {
    const from = mondayOfWeek(day);
    return {
      from: localCalendarDate(from),
      to: localCalendarDate(addDays(from, 6)),
    };
  }

  return {
    from: localCalendarDate(new Date(day.getFullYear(), day.getMonth(), 1, 12)),
    to: localCalendarDate(
      new Date(day.getFullYear(), day.getMonth() + 1, 0, 12),
    ),
  };
}
