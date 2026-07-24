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
    expect(hasPermission('barber', 'service.read')).toBe(true);
    expect(hasPermission('barber', 'service.manage')).toBe(false);
    expect(hasPermission('barber', 'schedule.read')).toBe(true);
    expect(hasPermission('barber', 'schedule.manage')).toBe(false);
  });

  it('permite al manager configurar servicios y horarios', () => {
    expect(hasPermission('manager', 'service.manage')).toBe(true);
    expect(hasPermission('manager', 'schedule.manage')).toBe(true);
  });

  it('permite operar agenda según el alcance de cada rol', () => {
    expect(hasPermission('receptionist', 'appointment.manage')).toBe(true);
    expect(hasPermission('barber', 'appointment.read')).toBe(true);
    expect(hasPermission('barber', 'membership.read')).toBe(false);
  });
});
