import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';

import { requireApiClient } from '../../src/lib/api';
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
    queryKey: ['onboarding-account-details', user?.id],
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const routeName = segments.at(-1);

  if (
    profileQuery.data?.onboardingCompletedAt &&
    routeName &&
    setupRoutes.has(routeName)
  ) {
    return <Redirect href={'/dashboard' as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
