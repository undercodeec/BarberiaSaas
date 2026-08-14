import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@barber-saas/design-tokens'],
  turbopack: {
    root: join(__dirname, '../..'),
  },
};

export default nextConfig;
