import type { ApiClient, ClientPageResponse } from '@barber-saas/api-client';

import { tenantQueryKey, type TenantQueryScope } from '../../lib/query-keys';

export interface ClientPageFilters {
  readonly labelId?: string;
  readonly search?: string;
}

export interface ClientPageQueryContext {
  readonly pageParam: string | null;
  readonly signal: AbortSignal;
}

function clientPagePath(
  filters: ClientPageFilters,
  cursor: string | null,
): string {
  const query = new URLSearchParams({ limit: '50' });
  if (filters.search) query.set('search', filters.search);
  if (filters.labelId) query.set('labelId', filters.labelId);
  if (cursor) query.set('cursor', cursor);
  return `/v2/clients?${query.toString()}`;
}

export function clientPageQueryOptions(
  api: Pick<ApiClient, 'request'>,
  scope: TenantQueryScope,
  filters: ClientPageFilters = {},
) {
  return {
    getNextPageParam: (page: ClientPageResponse) => page.nextCursor,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: ClientPageQueryContext) =>
      api.request<ClientPageResponse>(clientPagePath(filters, pageParam), {
        signal,
      }),
    queryKey: tenantQueryKey(scope, 'clients-v2', filters),
    staleTime: 60_000,
  } as const;
}

export function flattenClientPages(
  data: { readonly pages: readonly ClientPageResponse[] } | undefined,
): readonly ClientPageResponse['items'][number][] {
  return data?.pages.flatMap(({ items }) => items) ?? [];
}

export function chunkContacts<T>(
  contacts: readonly T[],
  size = 100,
): readonly T[][] {
  if (!Number.isInteger(size) || size < 1)
    throw new Error('El tamaño del lote debe ser un entero positivo.');
  const chunks: T[][] = [];
  for (let index = 0; index < contacts.length; index += size) {
    chunks.push([...contacts.slice(index, index + size)]);
  }
  return chunks;
}
