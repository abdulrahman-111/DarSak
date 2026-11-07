import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}));

import {
  claimProviderAttempt,
  finishProviderAttempt,
  isProviderBreakerEnabled,
} from '@/features/assistant/breaker';

const attempt = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('assistant provider breaker adapter', () => {
  it('is dormant unless its server-only switch is exactly true', () => {
    vi.stubEnv('SANAD_PROVIDER_BREAKER_ENABLED', 'True');
    expect(isProviderBreakerEnabled()).toBe(false);
    vi.stubEnv('SANAD_PROVIDER_BREAKER_ENABLED', 'true');
    expect(isProviderBreakerEnabled()).toBe(true);
  });

  it('parses a valid allowed attempt and invokes only the claim RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { allowed: true, attempt }, error: null });
    await expect(claimProviderAttempt()).resolves.toEqual({ allowed: true, attempt });
    expect(rpc).toHaveBeenCalledWith('sanad_provider_claim');
  });

  it('returns only bounded retry seconds from an open-circuit reply', async () => {
    rpc.mockResolvedValueOnce({
      data: { allowed: false, attempt: null, retry_after: 347 },
      error: null,
    });
    await expect(claimProviderAttempt()).resolves.toEqual({
      allowed: false,
      attempt: null,
      retryAfter: 347,
    });
  });

  it.each([
    ['missing response', null],
    ['non-UUID attempt', { allowed: true, attempt: 'private-detail' }],
    ['fractional retry', { allowed: false, attempt: null, retry_after: 2.5 }],
    ['excessive retry', { allowed: false, attempt: null, retry_after: 901 }],
  ])('fails closed for malformed %s', async (_label, data) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(claimProviderAttempt()).rejects.toThrow('provider breaker unavailable');
  });

  it('fails closed on RPC errors without propagating database details', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('private database detail') });
    await expect(claimProviderAttempt()).rejects.toThrow('provider breaker unavailable');
  });

  it('validates attempt tokens and sends only the fixed outcome contract', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(finishProviderAttempt('invalid', 'other_error')).rejects.toThrow(
      'provider breaker unavailable',
    );
    expect(rpc).not.toHaveBeenCalled();
    await finishProviderAttempt(attempt, 'quota_error');
    expect(rpc).toHaveBeenCalledWith('sanad_provider_finish', {
      p_attempt: attempt,
      p_outcome: 'quota_error',
    });
  });
});
