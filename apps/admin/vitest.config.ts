import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./app/test-setup.ts'],
  },
});
