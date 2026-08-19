import type { QueryKey } from '@tanstack/react-query';

export interface TenantQueryScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly userId: string;
}

export function accountQueryKey(
  userId: string | undefined,
  resource: string,
  ...details: readonly unknown[]
): QueryKey {
  return ['account', resource, userId ?? 'anonymous', ...details];
}

export function accountQueryPrefix(resource: string): QueryKey {
  return ['account', resource];
}

export function tenantQueryKey(
  scope: TenantQueryScope,
  resource: string,
  ...details: readonly unknown[]
): QueryKey {
  return [
    'tenant',
    resource,
    scope.userId,
    scope.organizationId,
    scope.locationId,
    ...details,
  ];
}

export function tenantQueryPrefix(resource: string): QueryKey {
  return ['tenant', resource];
}

export function belongsToTenantScope(
  key: QueryKey,
  scope: TenantQueryScope,
): boolean {
  return (
    key[0] === 'tenant' &&
    key[2] === scope.userId &&
    key[3] === scope.organizationId &&
    key[4] === scope.locationId
  );
}

export function isForeignTenantQuery(
  key: QueryKey,
  scope: TenantQueryScope,
): boolean {
  return key[0] === 'tenant' && !belongsToTenantScope(key, scope);
}
