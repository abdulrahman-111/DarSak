import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ flush: vi.fn() }));
vi.mock('@/features/email/worker', () => ({
  flushEmailOutbox: mocks.flush,
  MAX_EMAIL_JOBS_PER_RUN: 50,
}));
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
  it('returns only aggregate counts and uses a retryable status on worker failure', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
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
  it('drains with the per-run job limit', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    mocks.flush.mockResolvedValue({
      state: 'ok',
      claimed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      unsettled: 0,
    });
    await GET(
      new Request('https://dars.example/api/email/cron', {
        headers: { authorization: 'Bearer secret' },
      }) as never,
    );
    expect(mocks.flush).toHaveBeenCalledWith(50);
  });

  it('fails loudly when production email delivery is not configured', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.flush.mockResolvedValue({
      state: 'not_configured',
      claimed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      unsettled: 0,
    });
    const response = await GET(
      new Request('https://dars.example/api/email/cron', {
        headers: { authorization: 'Bearer secret' },
      }) as never,
    );
    expect(response.status).toBe(503);
    expect((await response.json()).state).toBe('not_configured');
  });

  it('keeps not_configured as a quiet 200 outside production', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    vi.stubEnv('VERCEL_ENV', 'preview');
    mocks.flush.mockResolvedValue({
      state: 'not_configured',
      claimed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      unsettled: 0,
    });
    const response = await GET(
      new Request('https://dars.example/api/email/cron', {
        headers: { authorization: 'Bearer secret' },
      }) as never,
    );
    expect(response.status).toBe(200);
  });
});
