import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  entry: ['src/index.ts'],
  external: ['@prisma/client/runtime/client', 'pg'],
  format: ['esm'],
  noExternal: ['@barber-saas/database', '@barber-saas/validation'],
  outDir: 'dist',
  platform: 'node',
  sourcemap: true,
});
