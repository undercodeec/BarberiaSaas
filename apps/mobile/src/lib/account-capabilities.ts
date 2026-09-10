import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';

type AccountType = OnboardingAccountDetailsResponse['accountType'];

/**
 * Demo entitlements can temporarily unlock every plan feature. Account mode is
 * a separate product boundary: a professional always operates one location
 * and without a team, regardless of those temporary entitlements.
 */
export function canManageBusinessOnlyFeature(accountType: AccountType) {
  return accountType === 'business';
}
