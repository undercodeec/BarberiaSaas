import { describe, expect, it } from 'vitest';

import { getAdminApiBaseUrl } from './api-url';

describe('getAdminApiBaseUrl', () => {
  it('permite una URL local configurada durante desarrollo', () => {
    expect(
      getAdminApiBaseUrl({
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000',
        NODE_ENV: 'development',
      }),
    ).toBe('http://127.0.0.1:4000');
  });

  it('usa la URL configurada en producción', () => {
    expect(
      getAdminApiBaseUrl({
        NEXT_PUBLIC_API_URL: 'https://api.navacloud.app/',
        NODE_ENV: 'production',
      }),
    ).toBe('https://api.navacloud.app');
  });

  it('falla explícitamente sin NEXT_PUBLIC_API_URL en producción', () => {
    expect(() => getAdminApiBaseUrl({ NODE_ENV: 'production' })).toThrow(
      'NEXT_PUBLIC_API_URL is required',
    );
  });

  it('rechaza una URL inválida en producción', () => {
    expect(() =>
      getAdminApiBaseUrl({
        NEXT_PUBLIC_API_URL: 'api.navacloud.app',
        NODE_ENV: 'production',
      }),
    ).toThrow('must be a valid absolute URL');
  });

  it.each(['http://127.0.0.1:4000', 'http://localhost:4000'])(
    'rechaza %s en producción',
    (apiUrl) => {
      expect(() =>
        getAdminApiBaseUrl({
          NEXT_PUBLIC_API_URL: apiUrl,
          NODE_ENV: 'production',
        }),
      ).toThrow('cannot point to localhost');
    },
  );
});
