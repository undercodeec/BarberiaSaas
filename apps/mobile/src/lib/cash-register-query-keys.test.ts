import {
  cashRegisterQueryKey,
  cashRegisterQueryOptions,
} from './cash-register-query-keys';

const scope = {
  locationId: 'location-default',
  organizationId: 'organization-a',
  role: 'owner',
  userId: 'user-a',
};

describe('claves de consulta de caja', () => {
  it('separa los datos de caja de la sucursal seleccionada', () => {
    expect(
      cashRegisterQueryKey(scope, 'cash-register-summary', 'location-b'),
    ).toEqual([
      'tenant',
      'cash-register-summary',
      'user-a',
      'organization-a',
      'location-default',
      'owner',
      'location-b',
    ]);
  });

  it('vuelve a consultar la caja al retornar a una sucursal', () => {
    expect(
      cashRegisterQueryOptions(scope, 'cash-register-current', 'location-a'),
    ).toEqual({
      queryKey: [
        'tenant',
        'cash-register-current',
        'user-a',
        'organization-a',
        'location-default',
        'owner',
        'location-a',
      ],
      staleTime: 0,
    });
  });
});
