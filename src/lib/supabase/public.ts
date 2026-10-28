import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

/**
 * Anonymous, cookie-less client for reads whose result is identical for every
 * visitor (security-definer public_* functions that never look at auth.uid()).
 * It must never be used for per-user data: it has no session, and its results
 * are meant to be stored in the shared Next.js data cache.
 */
export function createPublicClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createSupabaseClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export type PublicClient = NonNullable<ReturnType<typeof createPublicClient>>;
