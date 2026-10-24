import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ flush: vi.fn() }));
vi.mock('@/features/email/worker', () => ({ flushEmailOutbox: mocks.flush }));
import { GET } from '@/app/api/email/cron/route';

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.flush.mockReset();
});

describe('protected email cron route', () => {
  it('does not claim work without the exact configured bearer secret', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    const response = await GET(new Request('https://dars.example/api/email/cron') as never);
    expect(response.status).toBe(401);
    expect(mocks.flush).not.toHaveBeenCalled();
  });
  it('returns a safe disabled response in staging without loading worker credentials', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    const response = await GET(new Request('https://dars.example/api/email/cron') as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'disabled' });
    expect(mocks.flush).not.toHaveBeenCalled();
  });
  it('still requires the configured cron secret in staging', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('CRON_SECRET', 'secret');
    const response = await GET(new Request('https://dars.example/api/email/cron') as never);
    expect(response.status).toBe(401);
    expect(mocks.flush).not.toHaveBeenCalled();
  });
  it('returns disabled after valid staging cron authorization', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('CRON_SECRET', 'secret');
    const response = await GET(
      new Request('https://dars.example/api/email/cron', {
        headers: { authorization: 'Bearer secret' },
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'disabled' });
    expect(mocks.flush).not.toHaveBeenCalled();
  });
  it('returns only aggregate counts and uses a retryable status on worker failure', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.flush.mockResolvedValue({
      state: 'error',
      claimed: 1,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      unsettled: 1,
    });
    const response = await GET(
      new Request('https://dars.example/api/email/cron', {
        headers: { authorization: 'Bearer secret' },
      }) as never,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({
      state: 'error',
      claimed: 1,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      unsettled: 1,
    });
  });
});
