vi.mock('server-only', () => ({}));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getSupabaseConfig } = vi.hoisted(() => ({ getSupabaseConfig: vi.fn() }));
vi.mock('@/lib/supabase/config', () => ({ getSupabaseConfig }));

import { isSupabaseHealthy } from '@/lib/health-check.server';
import { GET } from '@/app/api/health/route';

beforeEach(() => {
  vi.clearAllMocks();
  getSupabaseConfig.mockReturnValue({
    url: 'https://project.supabase.co',
    key: 'public-publishable-key',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('reports unhealthy without making a request when Supabase config is missing', async () => {
  getSupabaseConfig.mockReturnValue(null);
  const fetchImpl = vi.fn<typeof fetch>();

  expect(await isSupabaseHealthy({ fetchImpl })).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('performs a bounded public read without cookies or a service key', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]', { status: 200 }));

  expect(await isSupabaseHealthy({ fetchImpl })).toBe(true);
  const [url, init] = fetchImpl.mock.calls[0];
  expect(String(url)).toBe('https://project.supabase.co/rest/v1/subjects?select=id&limit=1');
  expect(init).toMatchObject({ method: 'GET', cache: 'no-store' });
  expect(init?.headers).toEqual({ apikey: 'public-publishable-key', Accept: 'application/json' });
  expect(init?.headers).not.toHaveProperty('Cookie');
  expect(JSON.stringify(init)).not.toContain('service_role');
});

it('reports database/API failures and timeouts as unhealthy', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));
  expect(await isSupabaseHealthy({ fetchImpl })).toBe(false);

  const hangingFetch = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
  expect(await isSupabaseHealthy({ fetchImpl: hangingFetch, timeoutMs: 5 })).toBe(false);
  expect(hangingFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

it('returns only a generic healthy/unhealthy body with no caching', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'healthy' });
  expect(response.headers.get('cache-control')).toContain('no-store');

  fetchSpy.mockResolvedValue(new Response('', { status: 503 }));
  const databaseFailure = await GET();
  expect(databaseFailure.status).toBe(503);
  expect(await databaseFailure.json()).toEqual({ status: 'unhealthy' });

  getSupabaseConfig.mockReturnValue(null);
  const unhealthy = await GET();
  expect(unhealthy.status).toBe(503);
  expect(await unhealthy.json()).toEqual({ status: 'unhealthy' });
});
