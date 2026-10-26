import 'server-only';

import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

/** The RPC derives identity and applies persistent user/global limits atomically. */
export async function reserveSanadRequest(
  db: Db,
): Promise<{ lease: string | null; failed: boolean }> {
  const result = await db.rpc('sanad_reserve_request');
  if (result.error) return { lease: null, failed: true };
  if (result.data === null) return { lease: null, failed: false };
  if (typeof result.data !== 'string') return { lease: null, failed: true };
  return { lease: result.data, failed: false };
}

export async function releaseSanadRequest(db: Db, lease: string): Promise<void> {
  const result = await db.rpc('sanad_release_request', { p_lease: lease });
  if (result.error) throw new Error('quota release failed');
}
