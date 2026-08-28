import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  API_URL,
  PlatformApiError,
  downloadAuditExport,
  getOrganizationDetail,
  getOrganizations,
  getPlatformSession,
  getPlatformUsers,
  getWelcomeSurveyResponses,
  requestPlatformAccessCode,
  startPlatformLogin,
  updatePlatformAlert,
  updatePlatformMembership,
  updatePlatformUser,
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

  it('consulta usuarios con filtros en backend y sesiÃ³n autorizada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          pagination: { page: 2, pageSize: 10, total: 0, totalPages: 1 },
          users: [],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getPlatformUsers('session-token', {
      page: 2,
      search: 'persona@nava.ec',
      status: 'suspended',
      verification: 'verified',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/platform/users?');
    expect(url).toContain('search=persona%40nava.ec');
    expect(url).toContain('status=suspended');
    expect(url).toContain('verification=verified');
    expect(new Headers(options.headers).get('authorization')).toBe(
      'Bearer session-token',
    );
  });

  it('envÃ­a acciones de usuario por PATCH sin exponer secretos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'user-id', status: 'suspended' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updatePlatformUser('session-token', 'user/id', {
      action: 'suspend',
      reason: 'Incumplimiento reportado y verificado por soporte.',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/v1/platform/users/user%2Fid`);
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(
      JSON.stringify({
        action: 'suspend',
        reason: 'Incumplimiento reportado y verificado por soporte.',
      }),
    );
  });

  it('actualiza memberships por una ruta administrativa autenticada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'membership-id',
          role: 'manager',
          status: 'active',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updatePlatformMembership('session-token', 'membership/id', {
      action: 'change_role',
      reason: 'El colaborador asumirá funciones de coordinación.',
      role: 'manager',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/v1/platform/memberships/membership%2Fid`);
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(
      JSON.stringify({
        action: 'change_role',
        reason: 'El colaborador asumirá funciones de coordinación.',
        role: 'manager',
      }),
    );
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

  it('consulta la ficha 360 de una organización con el identificador codificado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ organization: { id: 'organization-id' } }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getOrganizationDetail('session-token', 'organization/id');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/v1/platform/organizations/organization%2Fid`);
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).get('authorization')).toBe(
      'Bearer session-token',
    );
  });

  it('envía la nota obligatoria al actualizar una alerta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'alert-id', status: 'resolved' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updatePlatformAlert('session-token', 'alert-id', {
      note: 'Incidencia verificada.',
      status: 'resolved',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/v1/platform/alerts/alert-id`);
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(
      JSON.stringify({ note: 'Incidencia verificada.', status: 'resolved' }),
    );
  });

  it('descarga la auditoría con rango explícito y sesión autorizada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('fecha,accion\n', {
        headers: {
          'content-disposition': 'attachment; filename="nava-auditoria.csv"',
          'content-type': 'text/csv',
        },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadAuditExport('session-token', {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-08T23:59:59.999Z',
    });

    expect(result.filename).toBe('nava-auditoria.csv');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/platform/exports/audit.csv?');
    expect(url).toContain('from=2026-08-01T00%3A00%3A00.000Z');
    expect(new Headers(options.headers).get('authorization')).toBe(
      'Bearer session-token',
    );
  });

  it('consulta respuestas de bienvenida con búsqueda y sesión autorizada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          pagination: { page: 2, pageSize: 25, total: 0, totalPages: 1 },
          responses: [],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getWelcomeSurveyResponses('session-token', {
      page: 2,
      search: 'persona@nava.ec',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/platform/welcome-survey-responses?');
    expect(url).toContain('page=2');
    expect(url).toContain('search=persona%40nava.ec');
    expect(new Headers(options.headers).get('authorization')).toBe(
      'Bearer session-token',
    );
  });
});
