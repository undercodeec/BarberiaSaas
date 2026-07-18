import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@barber-saas/design-tokens'],
};

export default nextConfig;
