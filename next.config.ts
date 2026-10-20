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
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
  experimental: {
    // Next 16 defaults to the CLI type-checker. Its wrapper does not pass the
    // local TypeScript binary's arguments correctly in this environment.
    useTypeScriptCli: false,
    // Keep visited workspace pages in the client router cache briefly so switching
    // between tabs and going back is instant. Server actions still invalidate it.
    staleTimes: {
      dynamic: 30,
    },
    serverActions: {
      bodySizeLimit: '1mb',
    },
    proxyClientMaxBodySize: '1mb',
  },
};
export default nextConfig;
