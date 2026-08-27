import { describe, expect, it } from 'vitest';

import { getWebApiBaseUrl } from './api-url';

describe('getWebApiBaseUrl', () => {
  it('permite una URL local durante desarrollo', () => {
    expect(
      getWebApiBaseUrl({
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000',
        NODE_ENV: 'development',
      }),
    ).toBe('http://127.0.0.1:4000');
  });

  it.each([
    undefined,
    'api.navacloud.app',
    'http://127.0.0.1:4000',
    'http://localhost:4000',
    'http://api.navacloud.app',
  ])('rechaza %s en producción', (apiUrl) => {
    expect(() =>
      getWebApiBaseUrl({
        NEXT_PUBLIC_API_URL: apiUrl,
        NODE_ENV: 'production',
      }),
    ).toThrow();
  });

  it('acepta la API pública configurada en producción', () => {
    expect(
      getWebApiBaseUrl({
        NEXT_PUBLIC_API_URL: 'https://api.navacloud.app/',
        NODE_ENV: 'production',
      }),
    ).toBe('https://api.navacloud.app');
  });
});
