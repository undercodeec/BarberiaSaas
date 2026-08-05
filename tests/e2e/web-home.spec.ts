import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('muestra la pantalla inicial en un viewport móvil', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Tu barbería, bajo control' }),
  ).toBeVisible();
  await expect(page.getByText('Fase 0 completada')).toBeVisible();
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
