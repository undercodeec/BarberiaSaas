import { describe, expect, it } from 'vitest';

import { hasPermission } from './index';

describe('hasPermission', () => {
  it('permite al owner administrar membresías', () => {
    expect(hasPermission('owner', 'membership.manage')).toBe(true);
  });

  it('impide al manager administrar membresías', () => {
    expect(hasPermission('manager', 'membership.manage')).toBe(false);
  });

  it('limita al barbero a lectura en Fase 1', () => {
    expect(hasPermission('barber', 'organization.read')).toBe(true);
    expect(hasPermission('barber', 'location.update')).toBe(false);
  });
});
