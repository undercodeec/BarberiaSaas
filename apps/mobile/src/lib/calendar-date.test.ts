import { settlementPeriodForTimeZone } from './calendar-date';

describe('settlementPeriodForTimeZone', () => {
  it('mantiene agosto en Ecuador cuando UTC ya esta en septiembre', () => {
    expect(
      settlementPeriodForTimeZone(
        'America/Guayaquil',
        new Date('2026-09-01T02:30:00.000Z'),
      ),
    ).toEqual({ periodEnd: '2026-08-31', periodStart: '2026-08-01' });
  });

  it('respeta el cambio de anio civil de la zona del negocio', () => {
    expect(
      settlementPeriodForTimeZone(
        'Pacific/Auckland',
        new Date('2026-12-31T11:30:00.000Z'),
      ),
    ).toEqual({ periodEnd: '2027-01-01', periodStart: '2027-01-01' });
  });

  it('usa la fecha civil correcta durante el cambio a horario de verano', () => {
    expect(
      settlementPeriodForTimeZone(
        'America/New_York',
        new Date('2026-03-08T04:30:00.000Z'),
      ),
    ).toEqual({ periodEnd: '2026-03-07', periodStart: '2026-03-01' });
    expect(
      settlementPeriodForTimeZone(
        'America/New_York',
        new Date('2026-03-08T07:30:00.000Z'),
      ),
    ).toEqual({ periodEnd: '2026-03-08', periodStart: '2026-03-01' });
  });
});
