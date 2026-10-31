import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }));

import robots from '@/app/robots';
import sitemap, { revalidate } from '@/app/sitemap';
import manifest from '@/app/manifest';

beforeEach(() => {
  rpc.mockReset();
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
    rpc.mockImplementation(async (name: string) =>
      name === 'discover_groups'
        ? { data: [{ id: 'g1' }], error: null }
        : { data: [{ id: 't1' }], error: null },
    );
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);
    expect(urls).toContain('https://darsak.example/en/groups/g1');
    expect(urls).toContain('https://darsak.example/ar/teachers/t1');
    expect(entries.find(e => e.url.endsWith('/en/groups/g1'))?.alternates?.languages).toEqual({
      ar: 'https://darsak.example/ar/groups/g1',
      en: 'https://darsak.example/en/groups/g1',
    });
    expect(entries.find(e => e.url.endsWith('/ar/teachers/t1'))?.alternates?.languages).toEqual({
      ar: 'https://darsak.example/ar/teachers/t1',
      en: 'https://darsak.example/en/teachers/t1',
    });
  });

  it('falls back to static routes when a public RPC fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
    rpc.mockResolvedValue({ data: null, error: new Error('down') });
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toHaveLength(10);
  });
});
