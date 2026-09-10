import type { CurrentOrganizationResponse } from '@barber-saas/api-client';

type OrganizationRole = CurrentOrganizationResponse['membership']['role'];

export interface WalletAccess {
  readonly canReadCash: boolean;
  readonly historySource: 'cash' | 'commissions';
  readonly summarySource: 'cash' | 'commissions';
}

export function walletAccessForRole(
  role: OrganizationRole | null | undefined,
): WalletAccess {
  const canReadCash = role === 'owner' || role === 'manager';
  return {
    canReadCash,
    historySource: canReadCash ? 'cash' : 'commissions',
    summarySource: canReadCash ? 'cash' : 'commissions',
  };
}
