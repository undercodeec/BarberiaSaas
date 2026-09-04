import {
  checkForAppStoreUpdate,
  isAppStoreVersionNewer,
} from './app-store-updates';

describe('isAppStoreVersionNewer', () => {
  it('detecta una versión de App Store más reciente', () => {
    expect(isAppStoreVersionNewer('0.1.16', '0.1.17')).toBe(true);
    expect(isAppStoreVersionNewer('0.1.16', '0.2.0')).toBe(true);
  });

  it('ignora la misma versión, una anterior y versiones no numéricas', () => {
    expect(isAppStoreVersionNewer('0.1.16', '0.1.16')).toBe(false);
    expect(isAppStoreVersionNewer('0.1.16', '0.1.15')).toBe(false);
    expect(isAppStoreVersionNewer('0.1.16', 'latest')).toBe(false);
  });
});

describe('checkForAppStoreUpdate', () => {
  it('consulta la versión pública antes de mostrar la actualización', async () => {
    await expect(
      checkForAppStoreUpdate('0.1.16', async () => ({
        json: async () => ({ results: [{ version: '0.1.17' }] }),
        ok: true,
      })),
    ).resolves.toBe(true);
  });
});
