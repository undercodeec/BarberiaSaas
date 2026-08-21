import { expect, test, type Page, type Route } from '@playwright/test';

const operator = {
  email: 'admin@nava.local',
  fullName: 'Admin Nava',
  id: '11111111-1111-4111-8111-111111111111',
  role: 'super_admin',
};
const organization = {
  counts: { appointments: 4, locations: 1, memberships: 2, services: 3 },
  createdAt: '2026-08-01T12:00:00.000Z',
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Nava Demo',
  owner: { email: 'owner@nava.local', fullName: 'Owner Demo' },
  plan: 'local',
  slug: 'nava-demo',
  status: 'active',
  trialEndsAt: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

async function mockPlatformApi(page: Page) {
  await page.route('http://127.0.0.1:4000/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/v1/platform/login')
      return json(route, {
        challengeToken: 'challenge-token',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
    if (path === '/v1/platform/verify-access-code')
      return json(route, {
        operator,
        session: {
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          token: 'platform-session-token',
        },
      });
    if (path === '/v1/platform/session') return json(route, { operator });
    if (path === '/v1/platform/overview')
      return json(route, {
        activation: {
          completedFirstAppointment: 1,
          createdFirstAppointment: 1,
          createdService: 1,
          organizations: 1,
        },
        notificationFailures: 0,
        subscriptions: { active: 1 },
        trialsEndingSoon: 0,
      });
    if (path === '/v1/platform/organizations')
      return json(route, {
        organizations: [organization],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      });
    if (path === '/v1/platform/notification-errors')
      return json(route, { errors: [] });
    if (path === '/v1/platform/audit')
      return json(route, {
        logs: [],
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      });
    if (path === '/v1/platform/privacy-requests')
      return json(route, { requests: [] });
    if (path === '/v1/platform/overrides')
      return json(route, { overrides: [] });
    if (path === '/v1/platform/onboarding')
      return json(route, {
        abandonedAfterHours: 24,
        pendingRegistrations: [],
        profiles: [
          {
            abandoned: false,
            accountType: 'business',
            appointments: 1,
            businessName: 'Nava Demo',
            collaborators: 1,
            completedAt: '2026-08-02T12:00:00.000Z',
            createdAt: '2026-08-01T12:00:00.000Z',
            organization: { id: organization.id, name: organization.name },
            owner: { email: 'ow***@nava.local', fullName: 'O. D.' },
            progressPercent: 100,
            services: 3,
            stages: {
              account: true,
              businessProfile: true,
              location: true,
              service: true,
              team: true,
            },
            updatedAt: '2026-08-02T12:00:00.000Z',
            userId: '33333333-3333-4333-8333-333333333333',
          },
        ],
        summary: {
          abandoned: 0,
          completed: 1,
          pending: 0,
          pendingVerification: 0,
        },
      });
    if (path === '/v1/platform/reviews') return json(route, { reviews: [] });
    if (path === '/v1/platform/configurations')
      return json(route, { allowedKeys: [], configurations: [] });
    if (path === '/v1/auth/logout') return route.fulfill({ status: 204 });
    return json(route, { code: 'UNMOCKED', message: path }, 500);
  });
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#platform-email').fill('admin@nava.local');
  await page.locator('#platform-password').fill('correct-password');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Confirma tu acceso' }),
  ).toBeVisible();
  await page.locator('input[autocomplete="one-time-code"]').fill('123456');
  await page.getByRole('button', { name: 'Confirmar y entrar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Resumen de plataforma' }),
  ).toBeVisible();
}

test('autentica con segundo factor y abre los módulos administrativos', async ({
  page,
}) => {
  await mockPlatformApi(page);
  await signIn(page);

  await page.getByRole('button', { name: /Privacidad/u }).click();
  await expect(
    page.getByRole('heading', { name: 'Privacidad y derechos de datos' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Excepciones/u }).click();
  await expect(
    page.getByRole('heading', { name: 'Límites y funcionalidades temporales' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Onboarding y reseñas/u }).click();
  await expect(
    page.getByText('Nava Demo', { exact: true }).last(),
  ).toBeVisible();

  await page.getByRole('button', { name: /global/iu }).click();
  await expect(page.getByRole('heading', { name: /global/iu })).toBeVisible();
});
