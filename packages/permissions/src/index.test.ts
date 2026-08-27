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

  it('protege los datos personales de clientes por rol', () => {
    expect(hasPermission('owner', 'client.contact.read_full')).toBe(true);
    expect(hasPermission('owner', 'client.export')).toBe(true);
    expect(hasPermission('manager', 'client.contact.read_full')).toBe(true);
    expect(hasPermission('manager', 'client.export')).toBe(false);
    expect(hasPermission('receptionist', 'client.contact.read_masked')).toBe(
      true,
    );
    expect(hasPermission('receptionist', 'client.update')).toBe(false);
    expect(hasPermission('barber', 'client.contact.read_masked')).toBe(true);
    expect(hasPermission('barber', 'client.note.create')).toBe(true);
    expect(hasPermission('barber', 'client.contact.read_full')).toBe(false);
  });
});
