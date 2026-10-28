import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('global security response headers', () => {
  it('sets the approved browser security headers on every path', async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find(rule => rule.source === '/:path*');
    const headers = Object.fromEntries(
      (globalRule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(headers).toEqual({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      'strict-transport-security': 'max-age=31536000',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
  });

  it('limits server action and proxy request bodies to one megabyte', () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe('1mb');
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe('1mb');
  });
});
