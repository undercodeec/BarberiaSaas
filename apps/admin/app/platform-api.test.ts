import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  API_URL,
  PlatformApiError,
  getOrganizations,
  getPlatformSession,
  requestPlatformAccessCode,
  startPlatformLogin,
  verifyPlatformAccessCode,
} from './platform-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente del panel de plataforma', () => {
  it('inicia sesión sin enviar credenciales previas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          challengeToken: 'preauth-token',
          expiresAt: '2026-08-04T00:05:00.000Z',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      startPlatformLogin('admin@nava.ec', 'clave-segura'),
    ).resolves.toEqual({
      challengeToken: 'preauth-token',
      expiresAt: '2026-08-04T00:05:00.000Z',
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/v1/platform/login`);
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).has('authorization')).toBe(false);
  });

  it('autoriza y codifica los filtros de organizaciones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          organizations: [],
          pagination: { page: 2, pageSize: 10, total: 0, totalPages: 1 },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getOrganizations('session-token', {
      page: 2,
      plan: 'local',
      search: 'Piloto Norte',
      status: 'trial',
      trial: 'ending_soon',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('page=2');
    expect(url).toContain('search=Piloto+Norte');
    expect(url).toContain('status=trial');
    expect(url).toContain('plan=local');
    expect(url).toContain('trial=ending_soon');
    expect(new Headers(options.headers).get('authorization')).toBe(
      'Bearer session-token',
    );
  });

  it('solicita y confirma el código de acceso con la sesión opaca', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            expiresAt: '2026-08-04T00:05:00.000Z',
            message: 'Código enviado.',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            operator: {
              email: 'admin@nava.ec',
              fullName: 'Administración Nava',
              id: 'operator-id',
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await requestPlatformAccessCode('session-token');
    await verifyPlatformAccessCode('session-token', '123456');

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestUrl).toBe(`${API_URL}/v1/platform/access-code`);
    expect(requestOptions.method).toBe('POST');
    expect(new Headers(requestOptions.headers).get('authorization')).toBe(
      'Bearer session-token',
    );
    const [verificationUrl, verificationOptions] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(verificationUrl).toBe(`${API_URL}/v1/platform/verify-access-code`);
    expect(verificationOptions.body).toBe(JSON.stringify({ code: '123456' }));
  });

  it('conserva el código y mensaje seguro devueltos por la API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'PLATFORM_ADMIN_REQUIRED',
            message: 'Acceso restringido.',
          }),
          { headers: { 'content-type': 'application/json' }, status: 403 },
        ),
      ),
    );

    const error = await getPlatformSession('outsider').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PlatformApiError);
    expect(error).toMatchObject({
      code: 'PLATFORM_ADMIN_REQUIRED',
      message: 'Acceso restringido.',
      status: 403,
    });
  });
});
