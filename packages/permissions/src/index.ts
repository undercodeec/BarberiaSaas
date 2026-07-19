export const membershipRoles = [
  'owner',
  'manager',
  'receptionist',
  'barber',
] as const;
export type MembershipRole = (typeof membershipRoles)[number];

export const organizationPermissions = [
  'organization.read',
  'organization.update',
  'location.read',
  'location.update',
  'membership.read',
  'membership.manage',
] as const;
export type OrganizationPermission = (typeof organizationPermissions)[number];

const permissionsByRole = {
  owner: organizationPermissions,
  manager: [
    'organization.read',
    'organization.update',
    'location.read',
    'location.update',
    'membership.read',
  ],
  receptionist: ['organization.read', 'location.read'],
  barber: ['organization.read', 'location.read'],
} as const satisfies Record<MembershipRole, readonly OrganizationPermission[]>;

export function hasPermission(
  role: MembershipRole,
  permission: OrganizationPermission,
): boolean {
  return (
    permissionsByRole[role] as readonly OrganizationPermission[]
  ).includes(permission);
}
