import { clientAccessForRole } from './client-access';

describe('clientAccessForRole', () => {
  it('deniega datos de contacto manuales hasta conocer el rol', () => {
    expect(clientAccessForRole(undefined).canEnterWalkInContact).toBe(false);
    expect(clientAccessForRole(null).canEnterWalkInContact).toBe(false);
  });

  it('permite gestión completa al owner y al manager', () => {
    expect(clientAccessForRole('owner')).toMatchObject({
      canCommunicate: true,
      canExport: true,
      canManage: true,
    });
    expect(clientAccessForRole('manager')).toMatchObject({
      canCommunicate: true,
      canExport: false,
      canManage: true,
    });
  });

  it('limita recepción a lectura sin contacto completo ni notas', () => {
    expect(clientAccessForRole('receptionist')).toEqual({
      canCommunicate: false,
      canEnterWalkInContact: true,
      canExport: false,
      canManage: false,
      canManageLabels: false,
      canReadNotes: false,
      canWriteNotes: false,
    });
  });

  it('permite al barbero trabajar únicamente con sus notas', () => {
    expect(clientAccessForRole('barber')).toEqual({
      canCommunicate: false,
      canEnterWalkInContact: false,
      canExport: false,
      canManage: false,
      canManageLabels: false,
      canReadNotes: true,
      canWriteNotes: true,
    });
  });
});
