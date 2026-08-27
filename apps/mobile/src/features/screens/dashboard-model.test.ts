import {
  EXTRA_QUICK_ACTIONS,
  shouldCelebrateSubscriptionActivation,
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
