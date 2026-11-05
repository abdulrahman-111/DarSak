import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const clientCreated = vi.fn();
const clientOptions = vi.fn();
const select = vi.fn();
const order = vi.fn();
const range = vi.fn();
const teacherPages: Array<{ data: Array<{ id: string }> | null; error: Error | null }> = [];
const groupPages = new Map<number, { data: Array<{ id: string }> | null; error: Error | null }>();
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, options: unknown) => {
    clientCreated();
    clientOptions(options);
    return {
      rpc: (name: string, args?: { p_offset?: number }) => {
        rpc(name, args);
        if (name === 'public_teachers') {
          let pageIndex = 0;
          const builder = {
            select: (projection: string) => {
              select(projection);
              return builder;
            },
            order: (column: string, orderOptions: { ascending: boolean }) => {
              order(column, orderOptions);
              return builder;
            },
            range: (start: number, end: number) => {
              range(start, end);
              pageIndex = start / 50;
              return builder;
            },
            then: (resolve: (value: unknown) => unknown) =>
              resolve(teacherPages[pageIndex] ?? { data: [], error: null }),
          };
          return builder;
        }
        return Promise.resolve(groupPages.get(args?.p_offset ?? 0) ?? { data: [], error: null });
      },
    };
  },
}));

import robots from '@/app/robots';
import sitemap, { revalidate } from '@/app/sitemap';
import manifest from '@/app/manifest';

beforeEach(() => {
  rpc.mockReset();
  clientCreated.mockReset();
  clientOptions.mockReset();
  select.mockReset();
  order.mockReset();
  range.mockReset();
  teacherPages.length = 0;
  groupPages.clear();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak.example');
});
afterEach(() => vi.unstubAllEnvs());

describe('robots', () => {
  it('allows public routes, blocks private areas and points to the sitemap', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule.allow).toEqual(['/', '/ar/account/setup$', '/en/account/setup$']);
    expect(rule.disallow).toEqual([
      '/*/student',
      '/ar/teacher$',
      '/ar/teacher/',
      '/en/teacher$',
      '/en/teacher/',
      '/*/account',
      '/*/notifications',
      '/*/reports',
      '/*/dashboard',
      '/api/',
    ]);
    expect(rule.disallow).not.toContain('/*/teacher');
    expect(result.sitemap).toBe('https://darsak.example/sitemap.xml');
  });
});

describe('manifest', () => {
  it('describes the installable app', () => {
    expect(manifest()).toMatchObject({
      name: 'DarSak',
      short_name: 'DarSak',
      start_url: '/ar',
      display: 'standalone',
      background_color: '#f6f0e4',
      theme_color: '#0e4a4b',
    });
  });
});

describe('sitemap', () => {
  it('revalidates hourly', () => expect(revalidate).toBe(3600));

  it('returns only static routes for both locales when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const urls = (await sitemap()).map(entry => entry.url);
    expect(rpc).not.toHaveBeenCalled();
    expect(clientCreated).not.toHaveBeenCalled();
    expect(urls).toContain('https://darsak.example/ar');
    expect(urls).toContain('https://darsak.example/ar/teachers');
    expect(urls).toContain('https://darsak.example/ar/privacy');
    expect(urls).not.toContain('https://darsak.example/en/login');
    expect(urls).not.toContain('https://darsak.example/ar/register');
    expect(urls).toContain('https://darsak.example/en/teachers');
    expect(urls.every(url => !url.includes('/groups/'))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('adds published groups and approved teachers from the public RPCs', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    groupPages.set(0, { data: [{ id: '33333333-3333-4333-8333-333333333333' }], error: null });
    teacherPages.push({ data: [{ id: '11111111-1111-4111-8111-111111111111' }], error: null });
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);
    expect(urls).toContain('https://darsak.example/en/groups/33333333-3333-4333-8333-333333333333');
    expect(urls).toContain(
      'https://darsak.example/ar/teachers/11111111-1111-4111-8111-111111111111',
    );
    expect(
      entries.find(e => e.url.endsWith('/en/groups/33333333-3333-4333-8333-333333333333'))
        ?.alternates?.languages,
    ).toEqual({
      ar: 'https://darsak.example/ar/groups/33333333-3333-4333-8333-333333333333',
      en: 'https://darsak.example/en/groups/33333333-3333-4333-8333-333333333333',
    });
    expect(
      entries.find(e => e.url.endsWith('/ar/teachers/11111111-1111-4111-8111-111111111111'))
        ?.alternates?.languages,
    ).toEqual({
      ar: 'https://darsak.example/ar/teachers/11111111-1111-4111-8111-111111111111',
      en: 'https://darsak.example/en/teachers/11111111-1111-4111-8111-111111111111',
    });
    expect(select).toHaveBeenCalledWith('id');
    expect(order).toHaveBeenCalledWith('id', { ascending: true });
    expect(range).toHaveBeenCalledWith(0, 49);
    expect(clientOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    );
  });

  it('pages teachers in stable 50-row ranges and deduplicates IDs across locales', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    const first = Array.from({ length: 50 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    }));
    teacherPages.push(
      { data: first, error: null },
      { data: [first[0], { id: '22222222-2222-4222-8222-222222222222' }], error: null },
    );
    const entries = await sitemap();
    const teacherUrls = entries.map(entry => entry.url).filter(url => url.includes('/teachers/'));
    expect(teacherUrls).toHaveLength(102);
    expect(new Set(teacherUrls).size).toBe(102);
    expect(range.mock.calls).toEqual([
      [0, 49],
      [50, 99],
    ]);
    expect(teacherUrls).toContain(
      'https://darsak.example/en/teachers/22222222-2222-4222-8222-222222222222',
    );
  });

  it('stops after an empty teacher page and caps at 20 full pages', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    teacherPages.push({ data: [], error: null });
    await sitemap();
    expect(range.mock.calls).toEqual([[0, 49]]);
    range.mockClear();
    teacherPages.length = 0;
    for (let page = 0; page < 20; page += 1) {
      teacherPages.push({
        data: Array.from({ length: 50 }, (_, i) => ({
          id: `${String(page + 1).padStart(8, '0')}-1111-4111-8111-${String(i).padStart(12, '0')}`,
        })),
        error: null,
      });
    }
    await sitemap();
    expect(range).toHaveBeenCalledTimes(20);
    expect(range).toHaveBeenLastCalledWith(950, 999);
  });

  it('requests one empty follow-up after an exact full teacher page', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    teacherPages.push(
      {
        data: Array.from({ length: 50 }, (_, i) => ({
          id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
        })),
        error: null,
      },
      { data: [], error: null },
    );
    const entries = await sitemap();
    expect(range.mock.calls).toEqual([
      [0, 49],
      [50, 99],
    ]);
    expect(entries.filter(entry => entry.url.includes('/teachers/'))).toHaveLength(100);
  });

  it('keeps static-only output if a later teacher or group page fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    groupPages.set(0, { data: [], error: null });
    teacherPages.push(
      {
        data: Array.from({ length: 50 }, (_, i) => ({
          id: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`,
        })),
        error: null,
      },
      { data: null, error: new Error('teacher page failed') },
    );
    expect(await sitemap()).toHaveLength(10);

    teacherPages.length = 0;
    range.mockClear();
    rpc.mockClear();
    groupPages.clear();
    groupPages.set(0, {
      data: Array.from({ length: 50 }, (_, i) => ({
        id: `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`,
      })),
      error: null,
    });
    groupPages.set(50, { data: null, error: new Error('group page failed') });
    expect(await sitemap()).toHaveLength(10);
    expect(
      rpc.mock.calls.filter(([name]) => name === 'discover_groups').map(([, args]) => args),
    ).toEqual([
      expect.objectContaining({ p_offset: 0, p_limit: 50 }),
      expect.objectContaining({ p_offset: 50, p_limit: 50 }),
    ]);
  });

  it('preserves the group 50-row paging and 20-page maximum', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    for (let page = 0; page < 20; page += 1) {
      groupPages.set(page * 50, {
        data: Array.from({ length: 50 }, (_, i) => ({
          id: `${String(page + 7).padStart(8, '0')}-7777-4777-8777-${String(i).padStart(12, '0')}`,
        })),
        error: null,
      });
    }
    await sitemap();
    const requests = rpc.mock.calls.filter(([name]) => name === 'discover_groups');
    expect(requests).toHaveLength(20);
    expect(requests.map(([, args]) => args?.p_offset)).toEqual(
      Array.from({ length: 20 }, (_, page) => page * 50),
    );
    expect(requests.every(([, args]) => args?.p_limit === 50)).toBe(true);
  });

  it('falls back to static routes when a public RPC fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    groupPages.set(0, { data: null, error: new Error('down') });
    teacherPages.push({ data: null, error: new Error('down') });
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toHaveLength(10);
  });
});
