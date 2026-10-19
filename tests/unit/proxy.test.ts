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
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1', role: 'admin' } }, error: null });
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
            { name: 'sb-project-auth-token', value: 'fresh-access', options: { path: '/', httpOnly: true } },
            { name: 'sb-project-auth-token.1', value: 'fresh-refresh', options: { path: '/', httpOnly: true } },
          ]);
          return { data: { claims: { sub: 'user-1' } }, error: null };
        }),
      },
    }));

    const response = await proxy(new NextRequest('https://dars.example/dashboard', {
      headers: { cookie: 'sb-project-auth-token=expired' },
    }));

    const forwardedCookie = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwardedCookie).toContain('sb-project-auth-token=fresh-access');
    expect(forwardedCookie).toContain('sb-project-auth-token.1=fresh-refresh');
    expect(response.headers.getSetCookie().join('\n')).toContain('sb-project-auth-token=fresh-access');
    expect(response.headers.getSetCookie().join('\n')).toContain('sb-project-auth-token.1=fresh-refresh');
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
});
