import { EXTRA_QUICK_ACTIONS } from './dashboard-model';

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
