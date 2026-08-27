import {
  effectiveLocationLimit,
  effectiveProfessionalLimit,
  hasLockedSubscriptionFeature,
  minimumPlanForFeatures,
} from './subscription-entitlements';

describe('entitlements de suscripción en Mobile', () => {
  it('no bloquea mientras la suscripción todavía no tiene respuesta', () => {
    expect(hasLockedSubscriptionFeature(undefined, ['inventory'])).toBe(false);
  });

  it('bloquea únicamente capacidades rechazadas explícitamente', () => {
    expect(
      hasLockedSubscriptionFeature(
        {
          commissions: true,
          fullReports: true,
          inventory: false,
          multiLocation: true,
          publicBooking: true,
          reports: true,
          team: true,
          wallet: true,
        },
        ['inventory'],
      ),
    ).toBe(true);
  });

  it('identifica el plan mínimo para inventario y reportes completos', () => {
    expect(minimumPlanForFeatures(['inventory'])).toBe('Nava Esencial');
    expect(minimumPlanForFeatures(['fullReports'])).toBe('Nava Esencial');
    expect(minimumPlanForFeatures(['team', 'commissions'])).toBe('Nava Local');
  });

  it('tolera la respuesta anterior de la API sin límites efectivos', () => {
    const subscription = {
      current: { planCode: 'local' },
      plans: [{ code: 'local', limits: { locations: 3 } }],
    } as const;

    expect(effectiveLocationLimit(subscription)).toBe(3);
  });

  it('prioriza el límite efectivo global de profesionales sobre el plan', () => {
    const subscription = {
      current: { limits: { teamMembers: 12 }, planCode: 'local' },
      plans: [{ code: 'local', limits: { teamMembers: 40 } }],
    } as const;

    expect(effectiveProfessionalLimit(subscription)).toBe(12);
  });

  it('recupera el límite global de profesionales del plan para respuestas antiguas', () => {
    const subscription = {
      current: { planCode: 'multi' },
      plans: [{ code: 'multi', limits: { teamMembers: 40 } }],
    } as const;

    expect(effectiveProfessionalLimit(subscription)).toBe(40);
  });
});
