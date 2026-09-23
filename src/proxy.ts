import createMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { routing } from '@/i18n/routing';
const localize = createMiddleware(routing);
export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  const updates: { name: string; value: string; options: CookieOptions }[] = [];
  if (config) {
    const db = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies) {
          cookies.forEach(cookie => {
            request.cookies.set(cookie.name, cookie.value);
            updates.push(cookie);
          });
        },
      },
    });
    // Verify with Auth; never authorize from the cookie-only session object.
    await db.auth.getUser();
  }
  // Route after refreshing so rewrites forward fresh cookies to Server Components.
  const response = localize(request);
  updates.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  if (updates.length || request.cookies.getAll().some(({ name }) => name.startsWith('sb-'))) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}
export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
