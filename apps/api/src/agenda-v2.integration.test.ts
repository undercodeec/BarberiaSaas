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

interface AppointmentPageResponse {
  readonly items: readonly { readonly id: string; readonly startsAt: string }[];
  readonly nextCursor: string | null;
}

interface CalendarSummaryResponse {
  readonly items: readonly {
    readonly appointmentCount: number;
    readonly date: string;
    readonly locationId: string;
  }[];
}

describeWithFixture('agenda v2 multi-sede', () => {
  const session = JSON.parse(readFileSync(sessionFile, 'utf8')) as {
    readonly locationIds: readonly string[];
    readonly professionalMembershipId: string;
    readonly serviceId: string;
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

  it('combina dos sedes, ordena por fecha/id y pagina sin duplicados', async () => {
    const headers = { authorization: `Bearer ${session.token}` };
    const locationIds = session.locationIds.slice(0, 2).join(',');
    const first = await app.inject({
      headers,
      method: 'GET',
      url: `/v2/appointments?from=2026-08-01&to=2026-08-31&locationIds=${locationIds}&limit=2`,
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(Number(first.headers['x-nava-query-count'])).toBeLessThanOrEqual(4);
    const firstPage = first.json<AppointmentPageResponse>();
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items[0]!.startsAt <= firstPage.items[1]!.startsAt).toBe(
      true,
    );

    const second = await app.inject({
      headers,
      method: 'GET',
      url: `/v2/appointments?from=2026-08-01&to=2026-08-31&locationIds=${locationIds}&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(
      second.json<AppointmentPageResponse>().items.map(({ id }) => id),
    ).not.toEqual(expect.arrayContaining(firstPage.items.map(({ id }) => id)));
  });

  it('rechaza una sede ajena antes de filtrar resultados parcialmente', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${session.token}` },
      method: 'GET',
      url: `/v2/appointments?from=2026-08-01&to=2026-08-31&locationIds=${session.locationIds[0]},aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    });
    expect(response.statusCode).toBe(403);
  });

  it('resume las citas por fecha civil de cada sede', async () => {
    const locationIds = session.locationIds.slice(0, 2).join(',');
    const response = await app.inject({
      headers: { authorization: `Bearer ${session.token}` },
      method: 'GET',
      url: `/v2/appointments/calendar-summary?from=2026-08-01&to=2026-08-31&locationIds=${locationIds}`,
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<CalendarSummaryResponse>();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appointmentCount: expect.any(Number),
          date: expect.stringMatching(/^2026-08-\d{2}$/u),
        }),
      ]),
    );
  });

  it('conserva la disponibilidad privada de v1', async () => {
    const query = new URLSearchParams({
      date: '2026-08-03',
      locationId: session.locationIds[0]!,
      membershipId: session.professionalMembershipId,
      serviceIds: session.serviceId,
    });
    const headers = { authorization: `Bearer ${session.token}` };
    const [legacy, scalable] = await Promise.all([
      app.inject({ headers, method: 'GET', url: `/v1/availability?${query}` }),
      app.inject({ headers, method: 'GET', url: `/v2/availability?${query}` }),
    ]);

    expect(legacy.statusCode, legacy.body).toBe(200);
    expect(scalable.statusCode, scalable.body).toBe(200);
    expect(scalable.json()).toEqual(legacy.json());
  });
});
