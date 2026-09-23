import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isConfigured, requireSupabaseConfig } from './config';
export { isConfigured } from './config';
export async function createClient() {
  const { url, key } = requireSupabaseConfig();
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
