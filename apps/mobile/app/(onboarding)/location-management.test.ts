import type { ManagedLocation } from '@barber-saas/api-client';

import { partitionManagedLocations } from '../../src/lib/managed-locations';

const location = (id: string, isActive: boolean): ManagedLocation => ({
  addressLine: null,
  city: 'Quito',
  countryCode: 'EC',
  currencyCode: 'USD',
  formattedAddress: null,
  googlePlaceId: null,
  id,
  isActive,
  latitude: null,
  longitude: null,
  name: `Sucursal ${id}`,
  phone: '0999999999',
  slug: `sucursal-${id}`,
  timezone: 'America/Guayaquil',
});

describe('partitionManagedLocations', () => {
  it('separa sucursales activas de las archivadas para no presentarlas como operativas', () => {
    expect(
      partitionManagedLocations([
        location('centro', true),
        location('norte', false),
      ]),
    ).toEqual({
      active: [location('centro', true)],
      archived: [location('norte', false)],
    });
  });
});
