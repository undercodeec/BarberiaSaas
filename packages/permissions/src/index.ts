export const permissionDecision = {
  allow: 'allow',
  deny: 'deny',
} as const;

export type PermissionDecision =
  (typeof permissionDecision)[keyof typeof permissionDecision];
