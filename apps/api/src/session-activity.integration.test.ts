import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { createDatabaseClient } from '@barber-saas/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';
import { observeDatabaseQuery } from './request-metrics';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describeWithDatabase('actividad de sesión en API', () => {
  const database = createDatabaseClient({
    connectionString: testDatabaseUrl!,
    queryObserver: ({ durationMs }) => observeDatabaseQuery(durationMs),
  });
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const email = `session-activity-${userId}@local.test`;
  let app: Awaited<ReturnType<typeof buildApi>>;

  beforeAll(async () => {
    await database.user.create({
      data: {
        email,
        emailVerifiedAt: new Date(),
        fullName: 'Sesión local',
        id: userId,
      },
    });
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

  afterAll(async () => {
    await database.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('no persiste actividad repetida y la actualiza una vez al expirar el intervalo', async () => {
    const session = await database.session.create({
      data: {
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        lastActiveAt: new Date(),
        tokenHash: hashToken(token),
        userId,
      },
    });
    const headers = { authorization: `Bearer ${token}` };

    const recentRequests = await Promise.all(
      Array.from({ length: 100 }, () =>
        app.inject({ headers, method: 'GET', url: '/v1/auth/session' }),
      ),
    );
    expect(recentRequests.every(({ statusCode }) => statusCode === 200)).toBe(
      true,
    );
    expect(
      recentRequests.map(({ headers: responseHeaders }) =>
        Number(responseHeaders['x-nava-query-count']),
      ),
    ).toEqual(Array.from({ length: 100 }, () => 2));
    const recent = await database.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(recent.lastActiveAt.getTime()).toBe(session.lastActiveAt.getTime());

    await database.session.update({
      data: { lastActiveAt: new Date(Date.now() - 6 * 60 * 1_000) },
      where: { id: session.id },
    });
    const expiredRequests = await Promise.all(
      Array.from({ length: 100 }, () =>
        app.inject({ headers, method: 'GET', url: '/v1/auth/session' }),
      ),
    );
    expect(expiredRequests.every(({ statusCode }) => statusCode === 200)).toBe(
      true,
    );
    const touched = await database.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    const unchanged = await database.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(touched.lastActiveAt.getTime()).toBeGreaterThan(
      recent.lastActiveAt.getTime(),
    );
    expect(unchanged.lastActiveAt.getTime()).toBe(
      touched.lastActiveAt.getTime(),
    );
  });
});
