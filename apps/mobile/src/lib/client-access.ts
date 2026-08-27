import type { CurrentOrganizationResponse } from '@barber-saas/api-client';

export type OrganizationRole =
  CurrentOrganizationResponse['membership']['role'];

export interface ClientAccess {
  readonly canCommunicate: boolean;
  readonly canExport: boolean;
  readonly canManage: boolean;
  readonly canManageLabels: boolean;
  readonly canReadNotes: boolean;
  readonly canWriteNotes: boolean;
}

export function clientAccessForRole(
  role: OrganizationRole | null | undefined,
): ClientAccess {
  const canManage = role === 'owner' || role === 'manager';
  const isBarber = role === 'barber';
  return {
    canCommunicate: canManage,
    canExport: role === 'owner',
    canManage,
    canManageLabels: canManage,
    canReadNotes: canManage || isBarber,
    canWriteNotes: canManage || isBarber,
  };
}
