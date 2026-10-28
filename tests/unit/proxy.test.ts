import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { createServerClientMock, localizeMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  localizeMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient: createServerClientMock }));
vi.mock('next-intl/middleware', () => ({ default: () => localizeMock }));

import { proxy } from '@/proxy';

function localizedResponse(request: NextRequest) {
  return NextResponse.rewrite(new URL('/en/dashboard', request.url), {
    request: { headers: request.headers },
  });
}

describe('proxy auth and localization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
    localizeMock.mockImplementation(localizedResponse);
  });

  it('verifies valid JWT claims and keeps authorization out of proxy', async () => {
    const getClaims = vi
      .fn()
      .mockResolvedValue({ data: { claims: { sub: 'user-1', role: 'admin' } }, error: null });
    createServerClientMock.mockReturnValue({ auth: { getClaims, getUser: vi.fn() } });

    const response = await proxy(new NextRequest('https://dars.example/dashboard'));

    expect(getClaims).toHaveBeenCalledOnce();
    expect(localizeMock).toHaveBeenCalledOnce();
    expect(response.headers.get('x-middleware-rewrite')).toContain('/en/dashboard');
  });

  it('forwards refreshed cookies through localization and sets them on the response without caching', async () => {
    createServerClientMock.mockImplementation((_url, _key, options) => ({
      auth: {
        getClaims: vi.fn(async () => {
          options.cookies.setAll([
            {
              name: 'sb-project-auth-token',
              value: 'fresh-access',
              options: { path: '/', httpOnly: true },
            },
            {
              name: 'sb-project-auth-token.1',
              value: 'fresh-refresh',
              options: { path: '/', httpOnly: true },
            },
          ]);
          return { data: { claims: { sub: 'user-1' } }, error: null };
        }),
      },
    }));

    const response = await proxy(
      new NextRequest('https://dars.example/dashboard', {
        headers: { cookie: 'sb-project-auth-token=expired' },
      }),
    );

    const forwardedCookie = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwardedCookie).toContain('sb-project-auth-token=fresh-access');
    expect(forwardedCookie).toContain('sb-project-auth-token.1=fresh-refresh');
    expect(response.headers.getSetCookie().join('\n')).toContain(
      'sb-project-auth-token=fresh-access',
    );
    expect(response.headers.getSetCookie().join('\n')).toContain(
      'sb-project-auth-token.1=fresh-refresh',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('continues localization when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    const response = await proxy(new NextRequest('https://dars.example/dashboard'));

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(localizeMock).toHaveBeenCalledOnce();
    expect(response.headers.get('x-middleware-rewrite')).toContain('/en/dashboard');
  });

  describe('landing page', () => {
    function mockSession(claims: unknown, profile: unknown, profileError: unknown = null) {
      const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: profileError });
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      const from = vi.fn(() => ({ select }));
      createServerClientMock.mockReturnValue({
        auth: { getClaims: vi.fn().mockResolvedValue({ data: claims, error: null }) },
        from,
      });
      return { from, eq };
    }
    const landing = (path = '/en', cookie = 'sb-x-auth-token=abc') =>
      proxy(new NextRequest(`https://dars.example${path}`, { headers: { cookie } }));

    it.each([
      ['student', '/en', '/en/student'],
      ['teacher', '/ar', '/ar/teacher'],
      ['student', '/ar/', '/ar/student'],
    ])('redirects an active %s on %s to %s, private and uncached', async (role, path, target) => {
      const { eq } = mockSession({ claims: { sub: 'u1' } }, { role, status: 'active' });
      const response = await landing(path);
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get('location')!).pathname).toBe(target);
      expect(new URL(response.headers.get('location')!).search).toBe('');
      expect(eq).toHaveBeenCalledWith('id', 'u1');
      expect(localizeMock).not.toHaveBeenCalled();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('content-security-policy-report-only')).not.toContain('nonce-');
    });

    it.each([
      ['pending teacher', { role: 'teacher', status: 'pending' }],
      ['suspended student', { role: 'student', status: 'suspended' }],
      ['admin', { role: 'admin', status: 'active' }],
      ['missing profile', null],
    ])('serves the landing page to a %s without redirecting', async (_name, profile) => {
      mockSession({ claims: { sub: 'u1' } }, profile);
      const response = await landing();
      expect(response.status).toBe(200);
      expect(localizeMock).toHaveBeenCalledOnce();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    it('does not look up a profile for anonymous visitors or other paths', async () => {
      const anon = mockSession(null, null);
      const response = await landing('/en', '');
      expect(anon.from).not.toHaveBeenCalled();
      expect(response.headers.get('cache-control')).toBeNull();

      const other = mockSession({ claims: { sub: 'u1' } }, { role: 'student', status: 'active' });
      const teachers = await landing('/en/teachers');
      expect(other.from).not.toHaveBeenCalled();
      expect(teachers.status).toBe(200);
    });

    it('falls back to the landing page when the profile lookup throws', async () => {
      createServerClientMock.mockReturnValue({
        auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u1' } } }) },
        from: () => {
          throw new Error('boom');
        },
      });
      const response = await landing();
      expect(response.status).toBe(200);
      expect(localizeMock).toHaveBeenCalledOnce();
    });
  });
});
