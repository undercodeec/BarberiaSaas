import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import { useCurrentOrganization } from '../features/organization/useCurrentOrganization';
import {
  isForeignTenantQuery,
  tenantQueryKey,
  type TenantQueryScope,
} from '../lib/query-keys';
import { useAuth } from './AuthProvider';

interface TenantScopeContextValue {
  readonly isResolved: boolean;
  readonly key: (
    resource: string,
    ...details: readonly unknown[]
  ) => readonly unknown[];
  readonly scope: TenantQueryScope;
}

const TenantScopeContext = createContext<TenantScopeContextValue | null>(null);

export function TenantScopeProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const organizationQuery = useCurrentOrganization();
  const isResolved = !user || organizationQuery.isFetched;
  const scope = useMemo<TenantQueryScope>(
    () => ({
      locationId: isResolved
        ? (organizationQuery.data?.location?.id ?? 'all')
        : 'resolving',
      organizationId: isResolved
        ? (organizationQuery.data?.organization.id ?? 'none')
        : 'resolving',
      role: isResolved
        ? (organizationQuery.data?.membership.role ?? 'none')
        : 'resolving',
      userId: user?.id ?? 'anonymous',
    }),
    [
      isResolved,
      organizationQuery.data?.location?.id,
      organizationQuery.data?.organization.id,
      organizationQuery.data?.membership.role,
      user?.id,
    ],
  );

  useEffect(() => {
    queryClient.removeQueries({
      predicate: (query) => isForeignTenantQuery(query.queryKey, scope),
    });
  }, [queryClient, scope]);

  const value = useMemo<TenantScopeContextValue>(
    () => ({
      isResolved,
      key: (resource, ...details) =>
        tenantQueryKey(scope, resource, ...details),
      scope,
    }),
    [isResolved, scope],
  );

  return (
    <TenantScopeContext.Provider value={value}>
      {children}
    </TenantScopeContext.Provider>
  );
}

export function useTenantScope() {
  const context = useContext(TenantScopeContext);
  if (!context) {
    throw new Error(
      'useTenantScope debe utilizarse dentro de TenantScopeProvider.',
    );
  }
  return context;
}
