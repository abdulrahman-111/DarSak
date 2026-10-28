import type { NextConfig } from 'next';
import { BASELINE_CSP, HSTS } from './src/lib/csp';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cache-Control', value: 'private, no-store' },
          {
            key: 'Content-Security-Policy',
            // Always-enforced baseline. The nonce policy is added per request by src/proxy.ts.
            value: BASELINE_CSP,
          },
          { key: 'Strict-Transport-Security', value: HSTS },
        ],
      },
    ];
  },
  experimental: {
    useTypeScriptCli: false,
    serverActions: { bodySizeLimit: '1mb' },
    proxyClientMaxBodySize: '1mb',
  },
};

export default nextConfig;
