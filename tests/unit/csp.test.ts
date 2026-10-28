import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { createServerClientMock, localizeMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  localizeMock: vi.fn(),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: createServerClientMock }));
vi.mock('next-intl/middleware', () => ({ default: () => localizeMock }));

import { proxy } from '@/proxy';
import { proxy as adminProxy } from '@admin/proxy';
import {
  buildCsp,
  createNonce,
  isLandingPath,
  isStaticContentPath,
  supabaseOrigins,
} from '@/lib/security/csp';
import { buildCsp as buildAdminCsp } from '@admin/lib/csp';

const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find(part => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('buildCsp', () => {
  const policy = buildCsp({
    nonce: 'abc123',
    supabaseUrl: 'https://proj.supabase.co',
    development: false,
    upgradeInsecure: true,
  });

  it('uses the nonce with strict-dynamic and no unsafe-inline for scripts', () => {
    expect(directive(policy, 'script-src')).toBe(
      "'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com",
    );
    expect(directive(policy, 'style-src')).toBe("'self' 'unsafe-inline'");
  });

  it('derives Supabase https and wss origins', () => {
    expect(directive(policy, 'connect-src')).toBe(
      "'self' https://proj.supabase.co wss://proj.supabase.co",
    );
    expect(directive(policy, 'img-src')).toBe("'self' data: blob: https://proj.supabase.co");
  });

  it('allows Turnstile and Google sign-in origins and keeps the baseline directives', () => {
    expect(directive(policy, 'frame-src')).toBe(
      'https://challenges.cloudflare.com https://accounts.google.com',
    );
    expect(directive(policy, 'form-action')).toContain('https://accounts.google.com');
    expect(policy).toContain("frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('adds unsafe-eval only in development and uses ws for local http Supabase', () => {
    expect(policy).not.toContain('unsafe-eval');
    const dev = buildCsp({ nonce: 'n', supabaseUrl: 'http://127.0.0.1:54321', development: true });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toBe(
      "'self' http://127.0.0.1:54321 ws://127.0.0.1:54321",
    );
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('omits Supabase origins when the URL is missing or invalid', () => {
    expect(supabaseOrigins('not a url')).toEqual({ http: null, ws: null });
    expect(supabaseOrigins('ftp://x.example')).toEqual({ http: null, ws: null });
    expect(
      directive(buildCsp({ nonce: 'n', supabaseUrl: '', development: false }), 'connect-src'),
    ).toBe("'self'");
  });

  it('falls back to a nonce-free script policy for static content pages', () => {
    const fallback = buildCsp({ supabaseUrl: '', development: false });
    expect(directive(fallback, 'script-src')).toBe("'self' 'unsafe-inline'");
    expect(isStaticContentPath('/en/help')).toBe(true);
    expect(isStaticContentPath('/ar/pricing')).toBe(true);
    expect(isStaticContentPath('/en/helpdesk')).toBe(false);
    expect(isStaticContentPath('/en/login')).toBe(false);
  });

  it('exempts only the exact localized landing paths from the nonce', () => {
    for (const path of ['/ar', '/en', '/ar/', '/en/']) {
      expect(isStaticContentPath(path)).toBe(true);
      expect(isLandingPath(path)).toBe(true);
    }
    for (const path of ['/', '/fr', '/en/teachers', '/en/student', '/en/login', '/ar/register'])
      expect(isStaticContentPath(path)).toBe(false);
  });

  it('generates unique, base64 nonces', () => {
    const nonces = new Set(Array.from({ length: 200 }, createNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it('keeps the administrator policy free of third-party script and frame origins', () => {
    const admin = buildAdminCsp({
      nonce: 'n',
      supabaseUrl: 'https://p.supabase.co',
      development: false,
    });
    expect(directive(admin, 'script-src')).toBe("'self' 'nonce-n' 'strict-dynamic'");
    expect(directive(admin, 'frame-src')).toBe("'none'");
    expect(directive(admin, 'form-action')).toBe("'self'");
    expect(directive(admin, 'connect-src')).toBe(
      "'self' https://p.supabase.co wss://p.supabase.co",
    );
  });
});

describe.each([
  ['public', proxy, 'https://dars.example/en/login'],
  ['admin', adminProxy, 'https://darsak-admin-portal.vercel.app/en/login'],
] as const)('%s proxy CSP header', (_name, handler, url) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VERCEL_ENV', '');
    localizeMock.mockImplementation((request: NextRequest) => NextResponse.next({ request }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sends Report-Only by default with a fresh nonce per request', async () => {
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
      const request = new NextRequest(url);
      const response = await handler(request);
      expect(response.headers.get('content-security-policy')).toBeNull();
      const policy = response.headers.get('content-security-policy-report-only') ?? '';
      const nonce = request.headers.get('x-nonce') ?? '';
      expect(nonce).not.toBe('');
      expect(policy).toContain(`'nonce-${nonce}'`);
      expect(request.headers.get('content-security-policy-report-only')).toBe(policy);
      seen.push(nonce);
    }
    expect(new Set(seen).size).toBe(2);
  });

  it('enforces only when CSP_ENFORCE=true', async () => {
    vi.stubEnv('CSP_ENFORCE', 'true');
    const response = await handler(new NextRequest(url));
    expect(response.headers.get('content-security-policy')).toContain("'strict-dynamic'");
    expect(response.headers.get('content-security-policy-report-only')).toBeNull();
  });

  it('does not enforce for other CSP_ENFORCE values', async () => {
    vi.stubEnv('CSP_ENFORCE', '1');
    const response = await handler(new NextRequest(url));
    expect(response.headers.get('content-security-policy')).toBeNull();
  });
});

describe('public proxy static content exemption', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    localizeMock.mockImplementation((request: NextRequest) => NextResponse.next({ request }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sets no nonce on help/privacy/terms/pricing so they can stay static', async () => {
    const request = new NextRequest('https://dars.example/en/privacy');
    const response = await proxy(request);
    expect(request.headers.get('x-nonce')).toBeNull();
    const policy = response.headers.get('content-security-policy-report-only') ?? '';
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain('nonce-');
  });
});
