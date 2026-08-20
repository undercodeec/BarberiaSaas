export type PermissionAccess = 'blocked' | 'denied' | 'granted';

export type NativePermissionResult = {
  readonly canAskAgain?: boolean;
  readonly granted?: boolean;
  readonly status?: string;
};

export function classifyPermission(
  permission: NativePermissionResult,
): PermissionAccess {
  if (permission.granted === true || permission.status === 'granted') {
    return 'granted';
  }
  return permission.canAskAgain === false ? 'blocked' : 'denied';
}

export async function ensurePermissionAccess(
  getCurrent: () => Promise<NativePermissionResult>,
  request: () => Promise<NativePermissionResult>,
): Promise<PermissionAccess> {
  const current = await getCurrent();
  if (classifyPermission(current) === 'granted') return 'granted';
  return classifyPermission(await request());
}
