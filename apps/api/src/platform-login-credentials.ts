export interface PlatformLoginOperator {
  readonly adminPasswordHash: string | null;
  readonly isActive: boolean;
}

export interface PlatformLoginUser {
  readonly email: string;
  readonly platformOperator: PlatformLoginOperator | null;
}

export type PlatformLoginCredentials =
  | { readonly passwordHash: string; readonly source: 'bootstrap' | 'operator' }
  | { readonly source: 'operator_password_not_configured' | 'unauthorized' };

export function resolvePlatformLoginCredentials({
  bootstrapPasswordHash,
  configuredEmails,
  user,
}: {
  readonly bootstrapPasswordHash: string | undefined;
  readonly configuredEmails: ReadonlySet<string>;
  readonly user: PlatformLoginUser | null;
}): PlatformLoginCredentials {
  if (!user) return { source: 'unauthorized' };

  const operator = user.platformOperator;
  if (!operator) {
    if (!configuredEmails.has(user.email) || !bootstrapPasswordHash)
      return { source: 'unauthorized' };
    return { passwordHash: bootstrapPasswordHash, source: 'bootstrap' };
  }

  if (!operator.isActive) return { source: 'unauthorized' };
  if (!operator.adminPasswordHash)
    return { source: 'operator_password_not_configured' };
  return { passwordHash: operator.adminPasswordHash, source: 'operator' };
}
