import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/account-deletions/cron/route';

const fetchMock = vi.fn();
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('account deletion recovery cron', () => {
  it('rejects callers without CRON_SECRET before reading or forwarding worker credentials', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('ACCOUNT_DELETION_WORKER_SECRET', 'worker-secret');
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      new Request('https://example.test/api/account-deletions/cron') as never,
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the scoped worker operation and returns aggregate counts', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('ACCOUNT_DELETION_WORKER_SECRET', 'worker-secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co/');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          state: 'pending',
          claimed: 2,
          completed: 1,
          pending: 1,
          request_id: 'must-not-leak',
        }),
        { status: 503 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      new Request('https://example.test/api/account-deletions/cron', {
        headers: { authorization: 'Bearer cron-secret' },
      }) as never,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body).toEqual({ state: 'pending', claimed: 2, completed: 1, pending: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/functions/v1/delete-account');
    expect(init.headers['x-account-deletion-worker-key']).toBe('worker-secret');
    expect(JSON.parse(init.body)).toEqual({ operation: 'worker', limit: 5 });
    expect(JSON.stringify(body)).not.toContain('worker-secret');
  });

  it('fails closed when worker configuration is absent', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable');
    const response = await GET(
      new Request('https://example.test/api/account-deletions/cron', {
        headers: { authorization: 'Bearer cron-secret' },
      }) as never,
    );
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
