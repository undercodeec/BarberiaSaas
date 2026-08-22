import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/admin-e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm --filter @barber-saas/admin dev',
    env: {
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:3001',
  },
});
