import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';

import { requireApiClient } from '../../src/lib/api';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { accountQueryKey } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';

const setupRoutes = new Set([
  'account-setup',
  'organization',
  'services',
  'congratulations',
]);

export default function OnboardingLayout() {
  const { session, user } = useAuth();
  const segments = useSegments();
  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const organizationQuery = useCurrentOrganization();
  const routeName = segments.at(-1);
  const financialRoutes = new Set([
    'cash-register',
    'cash-register-detail',
    'cash-register-history',
    'financial-records',
    'payment-confirmations',
  ]);
  const canAccessCash =
    organizationQuery.data?.membership.role === 'owner' ||
    organizationQuery.data?.membership.role === 'manager';

  if (
    organizationQuery.isFetched &&
    routeName &&
    financialRoutes.has(routeName) &&
    !canAccessCash
  ) {
    return <Redirect href={'/dashboard' as never} />;
  }

  if (
    profileQuery.data?.onboardingCompletedAt &&
    routeName &&
    setupRoutes.has(routeName)
  ) {
    return <Redirect href={'/dashboard' as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
