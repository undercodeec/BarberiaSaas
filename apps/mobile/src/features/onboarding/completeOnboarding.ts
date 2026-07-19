import type { CompleteOnboardingInput } from '@barber-saas/validation';

import { requireApiClient } from '../../lib/api';

export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<void> {
  await requireApiClient().request('/v1/onboarding', {
    body: input,
    method: 'POST',
  });
}
