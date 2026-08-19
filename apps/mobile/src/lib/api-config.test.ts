import {
  assertSecureMobileApiConfiguration,
  parseMobileAppEnvironment,
} from '../../app.config';

describe('configuracion segura de API mobile', () => {
  it('permite HTTP solamente en desarrollo local', () => {
    expect(
      assertSecureMobileApiConfiguration({
        allowedHosts: undefined,
        environment: 'local',
        url: 'http://127.0.0.1:4000',
      }),
    ).toBe('http://127.0.0.1:4000/');
  });

  it.each(['preview', 'staging', 'production'] as const)(
    'rechaza HTTP en %s',
    (environment) => {
      expect(() =>
        assertSecureMobileApiConfiguration({
          allowedHosts: 'api.navacloud.app',
          environment,
          url: 'http://api.navacloud.app',
        }),
      ).toThrow('debe usar HTTPS');
    },
  );

  it('rechaza hosts fuera de la allowlist sin exponer la URL', () => {
    expect(() =>
      assertSecureMobileApiConfiguration({
        allowedHosts: 'api.navacloud.app',
        environment: 'production',
        url: 'https://api.example.invalid',
      }),
    ).toThrow('no esta permitido');
  });

  it('infiere produccion para un build sin entorno explicito', () => {
    expect(parseMobileAppEnvironment(undefined, true)).toBe('production');
  });
});
