import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import type { SanadLimits } from './config';

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * The RPC derives identity and applies persistent user/global limits atomically.
 * A null lease with failed=false means the request was refused (quota, in-flight
 * cap or ineligible account); failed=true means the RPC itself errored.
 */
export async function reserveSanadRequest(
  db: Db,
  limits: SanadLimits,
): Promise<{ lease: string | null; failed: boolean }> {
  const result = await db.rpc('sanad_reserve_request', {
    p_user_daily: limits.userDaily,
    p_user_minute: limits.userMinute,
    p_global_daily: limits.globalDaily,
    p_global_concurrency: limits.globalConcurrency,
  });
  if (result.error) return { lease: null, failed: true };
  if (result.data === null) return { lease: null, failed: false };
  if (typeof result.data !== 'string') return { lease: null, failed: true };
  return { lease: result.data, failed: false };
}

export async function releaseSanadRequest(db: Db, lease: string): Promise<void> {
  const result = await db.rpc('sanad_release_request', { p_lease: lease });
  if (result.error) throw new Error('quota release failed');
}
