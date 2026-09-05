import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: { setupFiles: ['./app/test-setup.ts'] },
});
