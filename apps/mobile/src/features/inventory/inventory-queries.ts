import type {
  ApiClient,
  InventoryProductsPageResponse,
  InventorySummaryResponse,
  StockMovementsPageResponse,
} from '@barber-saas/api-client';

import { tenantQueryKey, type TenantQueryScope } from '../../lib/query-keys';

export interface InventoryProductsFilters {
  readonly isActive?: boolean;
  readonly locationId: string;
  readonly lowStock?: boolean;
  readonly search?: string;
}

export interface InventoryMovementsFilters {
  readonly locationId: string;
  readonly productId?: string;
}

interface InfiniteQueryContext {
  readonly pageParam: string | null;
  readonly signal: AbortSignal;
}

function appendProductsQuery(filters: InventoryProductsFilters, cursor: string | null) {
  const query = new URLSearchParams({ locationId: filters.locationId, limit: '50' });
  if (filters.isActive !== undefined) query.set('isActive', String(filters.isActive));
  if (filters.lowStock) query.set('lowStock', 'true');
  if (filters.search) query.set('search', filters.search);
  if (cursor) query.set('cursor', cursor);
  return `/v2/inventory/products?${query.toString()}`;
}

export function inventoryQueryState(input: {
  readonly session: boolean;
  readonly tab: 'movements' | 'orders' | 'products';
}) {
  return {
    movementsEnabled: input.session && input.tab === 'movements',
    productsEnabled: input.session && input.tab === 'products',
  };
}

export function inventoryProductsQueryOptions(
  api: Pick<ApiClient, 'request'>,
  scope: TenantQueryScope,
  filters: InventoryProductsFilters,
) {
  return {
    getNextPageParam: (page: InventoryProductsPageResponse) => page.nextCursor,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: InfiniteQueryContext) =>
      api.request<InventoryProductsPageResponse>(
        appendProductsQuery(filters, pageParam),
        { signal },
      ),
    queryKey: tenantQueryKey(scope, 'inventory-products', filters),
    staleTime: 30_000,
  } as const;
}

export function inventoryMovementsQueryOptions(
  api: Pick<ApiClient, 'request'>,
  scope: TenantQueryScope,
  filters: InventoryMovementsFilters,
) {
  return {
    getNextPageParam: (page: StockMovementsPageResponse) => page.nextCursor,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: InfiniteQueryContext) => {
      const query = new URLSearchParams({ locationId: filters.locationId, limit: '50' });
      if (filters.productId) query.set('productId', filters.productId);
      if (pageParam) query.set('cursor', pageParam);
      return api.request<StockMovementsPageResponse>(
        `/v2/inventory/movements?${query.toString()}`,
        { signal },
      );
    },
    queryKey: tenantQueryKey(scope, 'inventory-movements', filters),
    staleTime: 30_000,
  } as const;
}

export function inventorySummaryQueryOptions(
  api: Pick<ApiClient, 'request'>,
  scope: TenantQueryScope,
  locationId: string,
) {
  return {
    queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
      api.request<InventorySummaryResponse>(
        `/v2/inventory/summary?locationId=${encodeURIComponent(locationId)}`,
        { signal },
      ),
    queryKey: tenantQueryKey(scope, 'inventory-summary', locationId),
    staleTime: 30_000,
  } as const;
}
