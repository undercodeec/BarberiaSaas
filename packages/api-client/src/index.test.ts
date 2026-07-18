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
});
