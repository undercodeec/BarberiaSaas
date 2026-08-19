import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './index';

describe('createApiClient', () => {
  it('normaliza la URL y devuelve una respuesta tipada', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ready: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://example.test/',
      fetchImplementation,
    });

    await expect(
      client.request<{ ready: boolean }>('/health'),
    ).resolves.toEqual({ ready: true });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.test/health',
      expect.any(Object),
    );
  });

  it('adjunta la sesión y conserva el error del backend', async () => {
    const onAuthenticationFailure = vi.fn();
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'INVALID_SESSION',
          message: 'Sesión vencida.',
        }),
        { status: 401 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://example.test',
      fetchImplementation,
      getAccessToken: async () => 'token-secreto',
      onAuthenticationFailure,
    });

    await expect(client.request('/private')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      message: 'Sesión vencida.',
      statusCode: 401,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.test/private',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer token-secreto',
        }),
      }),
    );
    expect(onAuthenticationFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_SESSION', statusCode: 401 }),
    );
  });
});
