import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/config', () => ({
  requireSupabaseConfig: () => ({ url: 'http://127.0.0.1:54321', key: 'publishable' }),
}));
import { callDeletionEdge } from '@/features/account/edge';

describe('account deletion Edge client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('preserves a pending state even when Edge returns a non-2xx cleanup warning', async () => {
    vi.stubEnv('APP_ENV', 'local');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'local');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              state: 'pending',
              request_id: 'request-1',
              error: 'session_revocation_pending',
            }),
            { status: 503 },
          ),
      ),
    );
    const result = await callDeletionEdge<{ state: string; request_id: string }>('access-token', {
      operation: 'delete',
    });
    expect(result.data).toEqual({
      state: 'pending',
      request_id: 'request-1',
      error: 'session_revocation_pending',
    });
    expect(result.error).toBe('session_revocation_pending');
  });
});
