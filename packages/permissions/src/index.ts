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
  'service.read',
  'service.manage',
  'schedule.read',
  'schedule.manage',
  'appointment.read',
  'appointment.manage',
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
    'service.read',
    'service.manage',
    'schedule.read',
    'schedule.manage',
    'appointment.read',
    'appointment.manage',
  ],
  receptionist: [
    'organization.read',
    'location.read',
    'membership.read',
    'service.read',
    'schedule.read',
    'appointment.read',
    'appointment.manage',
  ],
  barber: [
    'organization.read',
    'location.read',
    'service.read',
    'schedule.read',
    'appointment.read',
    'appointment.manage',
  ],
} as const satisfies Record<MembershipRole, readonly OrganizationPermission[]>;

export function hasPermission(
  role: MembershipRole,
  permission: OrganizationPermission,
): boolean {
  return (
    permissionsByRole[role] as readonly OrganizationPermission[]
  ).includes(permission);
}
