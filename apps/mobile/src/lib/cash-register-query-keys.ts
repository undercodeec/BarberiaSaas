import type { QueryKey } from '@tanstack/react-query';

import { tenantQueryKey, type TenantQueryScope } from './query-keys';

export function cashRegisterQueryKey(
  scope: TenantQueryScope,
  resource: string,
  locationId: string,
): QueryKey {
  return tenantQueryKey(scope, resource, locationId);
}

export function cashRegisterQueryOptions(
  scope: TenantQueryScope,
  resource: string,
  locationId: string,
) {
  return {
    queryKey: cashRegisterQueryKey(scope, resource, locationId),
    staleTime: 0,
  } as const;
}
