import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('abre el portal y muestra la propuesta comercial de Nava', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight));
  await expect(
    page
      .getByRole('heading', {
        name: 'Haz crecer tu barbería con más orden y menos complicaciones.',
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText('Prueba Nava durante 10 días. Después, tu cuenta pasa a Nava Free.'),
  ).toHaveCount(1);
});

test('muestra controles de cookies y la página de privacidad', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('dialog', { name: 'Preferencias de cookies' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rechazar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configurar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceptar' })).toBeVisible();

  await page.goto('/tratamiento-de-datos');
  await expect(
    page.getByRole('heading', {
      name: 'Tu información merece un manejo claro.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'soporte@navacloud.app' }).first(),
  ).toBeVisible();
});

test('no pide consentimiento de cookies durante una reserva pública', async ({
  page,
}) => {
  await page.goto('/booking/token-de-prueba');
  await expect(
    page.getByRole('dialog', { name: 'Preferencias de cookies' }),
  ).toBeHidden();
});

test('no presenta infracciones críticas o serias de accesibilidad', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([]);
});
