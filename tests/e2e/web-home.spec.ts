import { expect, test } from '@playwright/test';

test('muestra la pantalla inicial en un viewport móvil', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Tu barbería, bajo control' }),
  ).toBeVisible();
  await expect(page.getByText('Fase 0 completada')).toBeVisible();
});
