import type { NextConfig } from 'next';

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
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
  experimental: {
    // Next 16 defaults to the CLI type-checker. Its wrapper does not pass the
    // local TypeScript binary's arguments correctly in this environment.
    useTypeScriptCli: false,
    serverActions: {
      bodySizeLimit: '12mb',
    },
    proxyClientMaxBodySize: '12mb',
  },
};
export default nextConfig;
