import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDatabaseClient } from '@barber-saas/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';
import { observeDatabaseQuery } from './request-metrics';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const sessionFile = fileURLToPath(
  new URL('../.secrets/performance-session.json', import.meta.url),
);
const describeWithFixture =
  process.env.PERFORMANCE_FIXTURE_TESTS === '1' &&
  testDatabaseUrl &&
  existsSync(sessionFile)
    ? describe
    : describe.skip;

describeWithFixture('inventario v2 con fixture local', () => {
  const session = JSON.parse(readFileSync(sessionFile, 'utf8')) as {
    readonly locationIds: readonly string[];
    readonly productIds: readonly string[];
    readonly token: string;
  };
  const database = createDatabaseClient({
    connectionString: testDatabaseUrl!,
    queryObserver: ({ durationMs }) => observeDatabaseQuery(durationMs),
  });
  let app: Awaited<ReturnType<typeof buildApi>>;

  beforeAll(async () => {
    app = await buildApi({
      config: readConfig({
        API_HOST: '127.0.0.1',
        API_PORT: '4000',
        APP_ENV: 'local',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: testDatabaseUrl!,
        MOBILE_INVITATION_URL: 'barbersaas://accept-invitation',
        MOBILE_RESET_URL: 'barbersaas://reset-password',
      }),
      database,
    });
  });

  afterAll(async () => app.close());

  it('pagina productos sin devolver Base64 y mantiene el resumen liviano', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${session.token}` },
      method: 'GET',
      url: `/v2/inventory/products?locationId=${session.locationIds[0]}&limit=1`,
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<{
      readonly items: readonly {
        readonly imageUrl: string | null;
        readonly quantityOnHand: number;
      }[];
      readonly nextCursor: string | null;
      readonly summary: unknown;
    }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).not.toHaveProperty('imageData');
    expect(body.items[0]?.imageUrl).toMatch(/^\/v2\/inventory\/products\/.+\/image$/u);
    expect(body.items[0]?.quantityOnHand).toBeGreaterThan(0);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.summary).not.toBeNull();
    expect(Buffer.byteLength(response.body)).toBeLessThan(250_000);
    expect(Number(response.headers['x-nava-query-count'])).toBeLessThanOrEqual(6);
  });

  it('sirve imagen privada y pagina movimientos por cursor', async () => {
    const headers = { authorization: `Bearer ${session.token}` };
    const [image, movements] = await Promise.all([
      app.inject({
        headers,
        method: 'GET',
        url: `/v2/inventory/products/${session.productIds[0]}/image`,
      }),
      app.inject({
        headers,
        method: 'GET',
        url: `/v2/inventory/movements?locationId=${session.locationIds[0]}&limit=2`,
      }),
    ]);
    expect(image.statusCode).toBe(200);
    expect(image.headers.etag).toEqual(expect.any(String));
    expect(image.headers['cache-control']).toBe('private, max-age=300');
    expect(movements.statusCode, movements.body).toBe(200);
    expect(movements.json<{ readonly items: unknown[] }>().items).toHaveLength(2);
  });

  it('mantiene las lecturas de productos y resumen bajo concurrencia', async () => {
    const headers = { authorization: `Bearer ${session.token}` };
    const requests = Array.from({ length: 20 }, (_, index) =>
      app.inject({
        headers,
        method: 'GET',
        url:
          index % 2 === 0
            ? `/v2/inventory/products?locationId=${session.locationIds[0]}&limit=50`
            : `/v2/inventory/summary?locationId=${session.locationIds[0]}`,
      }),
    );
    const responses = await Promise.all(requests);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual(
      expect.not.arrayContaining([500]),
    );
  });
});
