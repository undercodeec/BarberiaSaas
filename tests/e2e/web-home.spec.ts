import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('muestra la landing comercial en un viewport móvil', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Haz crecer tu barbería con más orden y menos complicaciones.',
    }),
  ).toBeVisible();
  await expect(page.getByText('10 días para probar Nava')).toBeVisible();
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
    page.getByRole('link', { name: 'soporte@navacloud.app' }),
  ).toBeVisible();
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
