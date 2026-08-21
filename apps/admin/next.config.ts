import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  reactStrictMode: true,
  turbopack: {
    root: join(__dirname, '../..'),
  },
};

export default nextConfig;
