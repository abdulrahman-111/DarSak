import createMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { routing } from '@/i18n/routing';
import {
  buildCsp,
  createNonce,
  cspHeader,
  isCspEnforced,
  isStaticContentPath,
} from '@/lib/security/csp';

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
    // Verify claims and refresh the session here; authoritative authorization
    // uses a fresh getUser() result and live profile in getRequestViewer.
    await db.auth.getClaims();
  }
  // Per-request nonce policy. Next reads the nonce from the request's CSP header and stamps
  // it on its own inline scripts; `x-nonce` exposes it to our components via next/headers.
  // Static content pages are exempt: a nonce would force them to render dynamically.
  const enforce = isCspEnforced();
  const nonce = isStaticContentPath(request.nextUrl.pathname) ? undefined : createNonce();
  const csp = cspHeader(
    buildCsp({
      nonce,
      upgradeInsecure: enforce && process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://'),
    }),
    enforce,
  );
  if (nonce) request.headers.set('x-nonce', nonce);
  request.headers.set(csp.name, csp.value);

  // Route after refreshing so rewrites forward fresh cookies to Server Components.
  const response = localize(request);
  response.headers.set(csp.name, csp.value);
  updates.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  if (updates.length || request.cookies.getAll().some(({ name }) => name.startsWith('sb-'))) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}
export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
