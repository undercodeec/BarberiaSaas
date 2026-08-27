import type { NextConfig } from 'next';
import { join } from 'node:path';

import { getAdminApiBaseUrl } from './app/api-url';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: join(__dirname, '../..'),
  },
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    const apiOrigin = getAdminApiBaseUrl();
    return [
      {
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${apiOrigin}; upgrade-insecure-requests`,
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(), payment=()',
          },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
        source: '/:path*',
      },
    ];
  },
};

export default nextConfig;
