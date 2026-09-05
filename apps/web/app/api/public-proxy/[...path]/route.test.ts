import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';

function request(path: string, etag?: string) {
  return new NextRequest(`http://localhost/api/public-proxy/${path}`, {
    ...(etag ? { headers: { 'if-none-match': etag } } : {}),
    method: 'GET',
  });
}

function context(path: string) {
  return { params: Promise.resolve({ path: path.split('/') }) };
}

afterEach(() => vi.unstubAllGlobals());

describe('proxy público v2', () => {
  it('reenvía medios v2, ETag y la respuesta 304', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: {
          'cache-control': 'public, max-age=300',
          etag: '"media-v2"',
        },
        status: 304,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const path = 'v2/public/nava/centro/media/service/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const response = await GET(request(path, '"media-v2"'), context(path));

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"media-v2"');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`/${path}`, 'http://localhost:4000/'),
      expect.objectContaining({
        headers: expect.any(Headers),
        method: 'GET',
      }),
    );
    expect(
      ((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get(
        'if-none-match',
      ),
    ).toBe('"media-v2"');
  });

  it('rechaza cualquier prefijo que no sea público v1 o v2', async () => {
    const response = await GET(
      request('v2/inventory/products'),
      context('v2/inventory/products'),
    );

    expect(response.status).toBe(404);
  });
});
