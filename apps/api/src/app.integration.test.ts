import { createDatabaseClient } from '@barber-saas/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('API con PostgreSQL', () => {
  const connectionString = testDatabaseUrl ?? 'postgresql://unused/unused';
  const database = createDatabaseClient({ connectionString });
  const config = readConfig({
    API_HOST: '127.0.0.1',
    API_PORT: '4000',
    APP_ENV: 'local',
    CORS_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: connectionString,
    MOBILE_RESET_URL: 'barbersaas://reset-password',
  });
  let app: Awaited<ReturnType<typeof buildApi>>;

  beforeEach(async () => {
    app ??= await buildApi({ config, database });
    await database.auditLog.deleteMany();
    await database.memberLocation.deleteMany();
    await database.membership.deleteMany();
    await database.location.deleteMany();
    await database.organization.deleteMany();
    await database.passwordResetToken.deleteMany();
    await database.session.deleteMany();
    await database.user.deleteMany();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function register(email: string) {
    const response = await app.inject({
      method: 'POST',
      payload: {
        confirmPassword: 'Clave-segura-123',
        email,
        fullName: 'Propietario de prueba',
        password: 'Clave-segura-123',
      },
      url: '/v1/auth/register',
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ session: { token: string } }>().session.token;
  }

  async function onboard(token: string, slug: string) {
    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: {
        location: {
          city: 'Quito',
          countryCode: 'EC',
          currencyCode: 'USD',
          name: `Sucursal ${slug}`,
          phone: '0999999999',
          slug: `${slug}-centro`,
          timezone: 'America/Guayaquil',
          whatsappPhone: '0999999999',
        },
        name: `Barbería ${slug}`,
        slug,
      },
      url: '/v1/onboarding',
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ organizationId: string }>();
  }

  it('crea cuenta, sesión y onboarding atómico', async () => {
    const token = await register('owner@example.com');
    const created = await onboard(token, 'barberia-principal');

    const membership = await database.membership.findFirst({
      include: { memberLocations: true },
      where: { organizationId: created.organizationId },
    });
    expect(membership?.role).toBe('OWNER');
    expect(membership?.memberLocations).toHaveLength(1);
    expect(await database.auditLog.count()).toBe(1);
  });

  it('aísla la organización usando la identidad de cada sesión', async () => {
    const firstToken = await register('first@example.com');
    const first = await onboard(firstToken, 'tenant-uno');
    const secondToken = await register('second@example.com');
    const second = await onboard(secondToken, 'tenant-dos');

    const response = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'GET',
      url: `/v1/organizations/current?organizationId=${second.organizationId}`,
    });
    const body = response.json<{
      organization: { id: string; name: string };
    }>();

    expect(response.statusCode).toBe(200);
    expect(body.organization.id).toBe(first.organizationId);
    expect(body.organization.id).not.toBe(second.organizationId);
    expect(response.body).not.toContain('Barbería tenant-dos');
  });
});
