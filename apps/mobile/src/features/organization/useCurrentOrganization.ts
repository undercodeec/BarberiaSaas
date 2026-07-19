import type { CurrentOrganizationResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';

import { requireApiClient } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';

export function useCurrentOrganization() {
  const { user } = useAuth();
  return useQuery({
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await requireApiClient().request<
        CurrentOrganizationResponse | { organization: null }
      >('/v1/organizations/current');
      return response.organization ? response : null;
    },
    queryKey: ['current-organization', user?.id],
  });
}
