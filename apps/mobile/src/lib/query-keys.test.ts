import {
  accountQueryKey,
  accountQueryPrefix,
  belongsToTenantScope,
  isForeignTenantQuery,
  tenantQueryKey,
  tenantQueryPrefix,
} from './query-keys';

const scope = {
  locationId: 'location-a',
  organizationId: 'organization-a',
  role: 'owner',
  userId: 'user-a',
};

describe('factoría de query keys', () => {
  it('incluye usuario, organización y sucursal en datos tenant-scoped', () => {
    expect(tenantQueryKey(scope, 'clients', 'search')).toEqual([
      'tenant',
      'clients',
      'user-a',
      'organization-a',
      'location-a',
      'owner',
      'search',
    ]);
    expect(tenantQueryPrefix('clients')).toEqual(['tenant', 'clients']);
  });

  it('diferencia claves de cuenta y detecta solo el tenant activo', () => {
    expect(accountQueryKey('user-a', 'profile')).toEqual([
      'account',
      'profile',
      'user-a',
    ]);
    expect(accountQueryPrefix('profile')).toEqual(['account', 'profile']);
    expect(belongsToTenantScope(tenantQueryKey(scope, 'team'), scope)).toBe(
      true,
    );
    expect(
      belongsToTenantScope(tenantQueryKey(scope, 'team'), {
        ...scope,
        organizationId: 'organization-b',
      }),
    ).toBe(false);
    expect(
      isForeignTenantQuery(tenantQueryKey(scope, 'team'), {
        ...scope,
        organizationId: 'organization-b',
      }),
    ).toBe(true);
    expect(
      isForeignTenantQuery(tenantQueryKey(scope, 'clients'), {
        ...scope,
        role: 'barber',
      }),
    ).toBe(true);
    expect(
      isForeignTenantQuery(accountQueryKey('user-a', 'profile'), scope),
    ).toBe(false);
  });
});
