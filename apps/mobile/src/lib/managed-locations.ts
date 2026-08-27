import type { ManagedLocation } from '@barber-saas/api-client';

export function partitionManagedLocations(
  locations: readonly ManagedLocation[],
) {
  return {
    active: locations.filter((location) => location.isActive),
    archived: locations.filter((location) => !location.isActive),
  };
}
