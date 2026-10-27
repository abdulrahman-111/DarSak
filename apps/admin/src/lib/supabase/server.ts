import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { adminCookieName, isConfigured, requireSupabaseConfig } from '@admin/lib/supabase/config';

export { isConfigured } from '@admin/lib/supabase/config';

export async function createClient() {
  const { url, key, projectRef, secure } = requireSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { name: adminCookieName(projectRef), path: '/', sameSite: 'lax', secure },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy refreshes before rendering.
        }
      },
    },
  });
}
