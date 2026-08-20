import { agendaRange, localCalendarDate } from './agenda-range';

describe('agenda range queries', () => {
  it('uses one civil date for the day view', () => {
    expect(agendaRange('day', new Date(2026, 7, 19, 23, 30))).toEqual({
      from: '2026-08-19',
      to: '2026-08-19',
    });
  });

  it('covers Monday through Sunday with one weekly range', () => {
    expect(agendaRange('week', new Date(2026, 7, 19, 12))).toEqual({
      from: '2026-08-17',
      to: '2026-08-23',
    });
    expect(agendaRange('week', new Date(2026, 7, 23, 12))).toEqual({
      from: '2026-08-17',
      to: '2026-08-23',
    });
  });

  it('covers short, leap-year and year-boundary months', () => {
    expect(agendaRange('month', new Date(2028, 1, 15, 12))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(agendaRange('month', new Date(2026, 11, 31, 12))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('serializes the local calendar date instead of shifting through UTC', () => {
    expect(localCalendarDate(new Date(2026, 7, 19, 23, 59))).toBe('2026-08-19');
  });
});
