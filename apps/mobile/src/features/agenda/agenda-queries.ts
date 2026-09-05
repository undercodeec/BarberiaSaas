import type {
  ApiClient,
  AppointmentCalendarSummaryResponse,
  AppointmentsPageResponse,
  AvailabilityResponse,
} from '@barber-saas/api-client';

import { tenantQueryKey, type TenantQueryScope } from '../../lib/query-keys';

export interface AgendaPageFilters {
  readonly activeAfter?: string;
  readonly from: string;
  readonly limit?: number;
  readonly locationIds: readonly string[];
  readonly membershipId?: string;
  readonly to: string;
}

export interface AgendaPageQueryContext {
  readonly pageParam: string | null;
  readonly signal: AbortSignal;
}

export interface AvailabilityFilters {
  readonly date: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly serviceIds: readonly string[];
}

function agendaPath(filters: AgendaPageFilters, cursor: string | null): string {
  const query = new URLSearchParams({
    from: filters.from,
    limit: String(filters.limit ?? 50),
    locationIds: filters.locationIds.join(','),
    to: filters.to,
  });
  if (filters.activeAfter) query.set('activeAfter', filters.activeAfter);
  if (filters.membershipId) query.set('membershipId', filters.membershipId);
  if (cursor) query.set('cursor', cursor);
  return `/v2/appointments?${query.toString()}`;
}

export function agendaPageQueryOptions(
  api: Pick<ApiClient, 'request'>,
  scope: TenantQueryScope,
  filters: AgendaPageFilters,
) {
  return {
    getNextPageParam: (page: AppointmentsPageResponse) => page.nextCursor,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: AgendaPageQueryContext) =>
      api.request<AppointmentsPageResponse>(agendaPath(filters, pageParam), {
        signal,
      }),
    queryKey: tenantQueryKey(scope, 'agenda-appointments', filters),
    staleTime: 30_000,
  } as const;
}

export function calendarSummaryQueryOptions(
  api: Pick<ApiClient, 'request'>,
  scope: TenantQueryScope,
  filters: Omit<AgendaPageFilters, 'activeAfter' | 'limit' | 'membershipId'>,
  enabled: boolean,
) {
  const query = new URLSearchParams({
    from: filters.from,
    locationIds: filters.locationIds.join(','),
    to: filters.to,
  });
  return {
    enabled,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
      api.request<AppointmentCalendarSummaryResponse>(
        `/v2/appointments/calendar-summary?${query.toString()}`,
        { signal },
      ),
    queryKey: tenantQueryKey(scope, 'agenda-calendar-summary', filters),
    staleTime: 30_000,
  } as const;
}

export function availabilityQueryOptions(
  api: Pick<ApiClient, 'request'>,
  scope: TenantQueryScope,
  filters: AvailabilityFilters,
) {
  const query = new URLSearchParams({
    date: filters.date,
    locationId: filters.locationId,
    membershipId: filters.membershipId,
    serviceIds: filters.serviceIds.join(','),
  });
  return {
    queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
      api.request<AvailabilityResponse>(
        `/v2/availability?${query.toString()}`,
        {
          signal,
        },
      ),
    queryKey: tenantQueryKey(scope, 'agenda-availability', filters),
    staleTime: 15_000,
  } as const;
}
