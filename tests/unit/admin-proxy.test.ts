import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerClientMock, localizeMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  localizeMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient: createServerClientMock }));
vi.mock('next-intl/middleware', () => ({ default: () => localizeMock }));

import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@admin/proxy';

const canonicalOrigin = 'https://darsak-admin-portal.vercel.app';

describe('administrator proxy host boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_APP', 'true');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('SUPABASE_EXPECTED_PROJECT_REF', 'ubrvjjibibqaiomrvwbd');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF', 'ubrvjjibibqaiomrvwbd');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ubrvjjibibqaiomrvwbd.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', canonicalOrigin);
    vi.stubEnv('VERCEL_ENV', 'production');
    localizeMock.mockImplementation((request: NextRequest) => NextResponse.next({ request }));
    createServerClientMock.mockReturnValue({ auth: { getClaims: vi.fn() } });
  });

  it('redirects alternate-host GET requests to the fixed canonical origin and preserves path/query', async () => {
    const response = await proxy(
      new NextRequest('https://preview.example.vercel.app/en/admin?tab=users'),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${canonicalOrigin}/en/admin?tab=users`);
    expect(localizeMock).not.toHaveBeenCalled();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe requests on alternate hosts without forwarding them', async () => {
    const response = await proxy(
      new NextRequest('https://preview.example.vercel.app/en/login', { method: 'POST' }),
    );

    expect(response.status).toBe(421);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(localizeMock).not.toHaveBeenCalled();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it('keeps protocol-relative paths on the fixed canonical origin', async () => {
    const response = await proxy(
      new NextRequest('https://preview.example.vercel.app//evil.example/path?x=1'),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${canonicalOrigin}//evil.example/path?x=1`);
    expect(new URL(response.headers.get('location')!).origin).toBe(canonicalOrigin);
  });

  it('processes requests on the canonical production origin', async () => {
    const response = await proxy(new NextRequest(`${canonicalOrigin}/en/admin`));

    expect(response.status).toBe(200);
    expect(localizeMock).toHaveBeenCalledOnce();
    expect(createServerClientMock).toHaveBeenCalledOnce();
  });
});
