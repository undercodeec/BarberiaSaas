import { describe, expect, it } from 'vitest';

import { resolvePlatformLoginCredentials } from './platform-login-credentials';

const configuredEmails = new Set(['bootstrap@nava.ec']);
const bootstrapPasswordHash = 'bootstrap-hash';

describe('resolvePlatformLoginCredentials', () => {
  it('uses bootstrap only when the configured user has no persisted operator', () => {
    expect(
      resolvePlatformLoginCredentials({
        bootstrapPasswordHash,
        configuredEmails,
        user: { email: 'bootstrap@nava.ec', platformOperator: null },
      }),
    ).toEqual({ passwordHash: bootstrapPasswordHash, source: 'bootstrap' });
  });

  it('uses a persisted operator administrative hash instead of bootstrap', () => {
    expect(
      resolvePlatformLoginCredentials({
        bootstrapPasswordHash,
        configuredEmails,
        user: {
          email: 'bootstrap@nava.ec',
          platformOperator: {
            adminPasswordHash: 'operator-hash',
            isActive: true,
          },
        },
      }),
    ).toEqual({ passwordHash: 'operator-hash', source: 'operator' });
  });

  it('makes an active persisted operator without an administrative hash explicit', () => {
    expect(
      resolvePlatformLoginCredentials({
        bootstrapPasswordHash,
        configuredEmails,
        user: {
          email: 'bootstrap@nava.ec',
          platformOperator: { adminPasswordHash: null, isActive: true },
        },
      }),
    ).toEqual({ source: 'operator_password_not_configured' });
  });

  it('does not authorize an inactive persisted operator with bootstrap', () => {
    expect(
      resolvePlatformLoginCredentials({
        bootstrapPasswordHash,
        configuredEmails,
        user: {
          email: 'bootstrap@nava.ec',
          platformOperator: { adminPasswordHash: null, isActive: false },
        },
      }),
    ).toEqual({ source: 'unauthorized' });
  });
});
