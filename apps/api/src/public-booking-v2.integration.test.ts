import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDatabaseClient } from '@barber-saas/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';

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

describeWithFixture('reserva pública v2 con fixture local', () => {
  const session = JSON.parse(readFileSync(sessionFile, 'utf8')) as {
    readonly locationIds: readonly string[];
    readonly professionalMembershipId: string;
    readonly serviceId: string;
  };
  const database = createDatabaseClient({ connectionString: testDatabaseUrl! });
  let app: Awaited<ReturnType<typeof buildApi>>;
  let path: string;

  beforeAll(async () => {
    const location = await database.location.findUniqueOrThrow({
      select: { organizationId: true, slug: true },
      where: { id: session.locationIds[0]! },
    });
    const organization = await database.organization.findUniqueOrThrow({
      select: { slug: true },
      where: { id: location.organizationId },
    });
    path = `/v2/public/${organization.slug}/${location.slug}`;
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

  afterAll(async () => app?.close());

  it('devuelve catálogo sin Base64 y expone cache compartida', async () => {
    const response = await app.inject({ method: 'GET', url: `${path}/catalog` });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const body = response.json<{
      readonly organization: { readonly profilePhotoUrl: string | null };
      readonly products: readonly { readonly imageUrl: string | null }[];
      readonly services: readonly { readonly imageUrl: string | null }[];
    }>();
    expect(body).not.toHaveProperty('imageData');
    expect(JSON.stringify(body)).not.toContain('data:image/');
    expect(body.products[0]).toHaveProperty('imageUrl');
    expect(body.services[0]).toHaveProperty('imageUrl');
  });

  it('sirve medios públicos con ETag', async () => {
    const catalog = await app.inject({ method: 'GET', url: `${path}/catalog` });
    const product = catalog
      .json<{ readonly products: readonly { readonly imageUrl: string | null }[] }>()
      .products.find((candidate) => candidate.imageUrl);
    expect(product?.imageUrl).toBeTruthy();
    const response = await app.inject({
      method: 'GET',
      url: product!.imageUrl!,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.headers.etag).toEqual(expect.any(String));
    const notModified = await app.inject({
      headers: { 'if-none-match': response.headers.etag! },
      method: 'GET',
      url: product!.imageUrl!,
    });
    expect(notModified.statusCode).toBe(304);
  });

  it('conserva la disponibilidad pública v1', async () => {
    const query = new URLSearchParams({
      date: '2026-10-03',
      membershipId: session.professionalMembershipId,
      serviceIds: session.serviceId,
    });
    const [legacy, scalable] = await Promise.all([
      app.inject({ method: 'GET', url: path.replace('/v2/', '/v1/') + `/availability?${query}` }),
      app.inject({ method: 'GET', url: `${path}/availability?${query}` }),
    ]);

    expect(scalable.statusCode, scalable.body).toBe(legacy.statusCode);
    expect(scalable.json()).toEqual(legacy.json());
  });

  it('coalesce cargas concurrentes del catálogo durante su ventana de caché', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({ method: 'GET', url: `${path}/catalog` }),
      ),
    );

    expect(responses.map(({ statusCode }) => statusCode)).toEqual(
      Array.from({ length: 20 }, () => 200),
    );
  });
});
