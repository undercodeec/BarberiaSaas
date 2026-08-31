jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';

import {
  createEmptyGuideStore,
  getGuideStore,
  saveGuideStore,
} from './guide-storage';

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

describe('guide storage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('usa un estado vacío para usuarios existentes sin progreso local', async () => {
    getItemAsync.mockResolvedValue(null);

    await expect(getGuideStore('user-1')).resolves.toEqual(
      createEmptyGuideStore(),
    );
  });

  it('ignora datos locales inválidos sin bloquear la aplicación', async () => {
    getItemAsync.mockResolvedValue('{invalid-json');

    await expect(getGuideStore('user-1')).resolves.toEqual(
      createEmptyGuideStore(),
    );
  });

  it('continúa con estado vacío si el almacenamiento no está disponible', async () => {
    getItemAsync.mockRejectedValue(new Error('Secure storage unavailable'));

    await expect(getGuideStore('user-1')).resolves.toEqual(
      createEmptyGuideStore(),
    );
  });

  it('persiste el progreso únicamente bajo una clave del usuario', async () => {
    const store = {
      firstStepsInvitationEnabled: true,
      guides: { 'first-booking': { status: 'completed' as const } },
      version: 1 as const,
    };

    await saveGuideStore('user-1', store);

    expect(setItemAsync).toHaveBeenCalledWith(
      'nava.guide.v1.user-1',
      JSON.stringify(store),
    );
  });
});
