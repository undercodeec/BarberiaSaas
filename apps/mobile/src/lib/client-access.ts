import type { CurrentOrganizationResponse } from '@barber-saas/api-client';

export type OrganizationRole =
  CurrentOrganizationResponse['membership']['role'];

export interface ClientAccess {
  readonly canCommunicate: boolean;
  readonly canEnterWalkInContact: boolean;
  readonly canExport: boolean;
  readonly canManage: boolean;
  readonly canManageLabels: boolean;
  readonly canReadNotes: boolean;
  readonly canViewPhone: boolean;
  readonly canWriteNotes: boolean;
}

export function clientAccessForRole(
  role: OrganizationRole | null | undefined,
): ClientAccess {
  const canManage = role === 'owner' || role === 'manager';
  const isBarber = role === 'barber';
  return {
    canCommunicate: canManage,
    canEnterWalkInContact:
      role !== null && role !== undefined && !isBarber,
    canExport: role === 'owner',
    canManage,
    canManageLabels: canManage,
    canReadNotes: canManage || isBarber,
    canViewPhone: role !== null && role !== undefined && !isBarber,
    canWriteNotes: canManage || isBarber,
  };
}
