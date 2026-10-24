import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isConfigured, requireSupabaseConfig } from './config';
import { PASSWORD_RECOVERY_COOKIE, verifyRecoveryProof } from '@/features/auth/recovery-proof';
import { assertStagingBackend } from '@/lib/deployment-environment';
export { isConfigured } from './config';
export async function createClient() {
  const { url, key } = requireSupabaseConfig();
  assertStagingBackend(url);
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes before rendering.
        }
      },
    },
  });
}
export async function getVerifiedUser() {
  if (!isConfigured()) return null;
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  return error ? null : data.user;
}
/** Recovery permission is issued by the auth callback and bound to the verified session. */
export async function getVerifiedRecoveryUser() {
  if (!isConfigured()) return null;
  const db = await createClient();
  const [{ data: { user }, error: userError }, { data: claimsData, error: claimsError }] = await Promise.all([
    db.auth.getUser(), db.auth.getClaims(),
  ]);
  const claims = claimsData?.claims;
  if (userError || claimsError || !user || claims?.sub !== user.id || typeof claims.session_id !== 'string') return null;
  const jar = await cookies();
  if (!verifyRecoveryProof(jar.get(PASSWORD_RECOVERY_COOKIE)?.value, user.id, claims.session_id)) return null;
  return user;
}
