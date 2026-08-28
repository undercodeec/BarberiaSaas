import {
  EXTRA_QUICK_ACTIONS,
  shouldCelebrateSubscriptionActivation,
  shouldShowWelcomeSurvey,
} from './dashboard-model';

describe('accesos rápidos del dashboard', () => {
  it('ofrece Sucursales y abre su administración', () => {
    expect(EXTRA_QUICK_ACTIONS).toContainEqual({
      icon: 'business-outline',
      id: 'locations',
      label: 'Sucursales',
      route: '/location-management',
    });
  });
});

describe('celebración de suscripción', () => {
  it('celebra cuando un plan de pago pasa a estar activo', () => {
    expect(
      shouldCelebrateSubscriptionActivation(
        { planCode: 'free', status: 'free' },
        { planCode: 'essential', status: 'active' },
      ),
    ).toBe(true);
  });

  it('no celebra al hidratar por primera vez una suscripción ya activa', () => {
    expect(
      shouldCelebrateSubscriptionActivation(null, {
        planCode: 'local',
        status: 'active',
      }),
    ).toBe(false);
  });

  it('no vuelve a celebrar una renovación del mismo plan activo', () => {
    expect(
      shouldCelebrateSubscriptionActivation(
        { planCode: 'essential', status: 'active' },
        { planCode: 'essential', status: 'active' },
      ),
    ).toBe(false);
  });
});

describe('encuesta de bienvenida', () => {
  it('solo se muestra cuando la API confirma que no existe respuesta', () => {
    expect(shouldShowWelcomeSurvey({ response: null })).toBe(true);
    expect(
      shouldShowWelcomeSurvey({
        response: {
          selectedOptions: ['Buscador'],
          submittedAt: '2026-08-28T00:00:00.000Z',
        },
      }),
    ).toBe(false);
  });
});
