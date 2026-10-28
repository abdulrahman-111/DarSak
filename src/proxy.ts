import createMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { routing } from '@/i18n/routing';
import {
  buildCsp,
  createNonce,
  cspHeader,
  isCspEnforced,
  isLandingPath,
  isStaticContentPath,
} from '@/lib/security/csp';

const localize = createMiddleware(routing);

/**
 * The landing page is static for anonymous visitors, so the signed-in redirect lives here.
 * Mirrors the former page logic: only an active student or teacher is sent to their home
 * (`/{locale}/{role}`); everyone else (pending, suspended, admin, no profile) sees the landing.
 * Identity comes from the verified claims; the role is read with the visitor's own session
 * under RLS. Any failure falls through to the landing page.
 */
async function signedInLandingTarget(
  db: ReturnType<typeof createServerClient>,
  userId: string,
  locale: string,
) {
  try {
    const { data } = await db.from('profiles').select('role,status').eq('id', userId).maybeSingle();
    if (data?.status === 'active' && (data.role === 'student' || data.role === 'teacher'))
      return `/${locale}/${data.role}`;
  } catch {
    // Treat as anonymous: the static landing page is safe to show.
  }
  return null;
}
export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  const updates: { name: string; value: string; options: CookieOptions }[] = [];
  const pathname = request.nextUrl.pathname;
  let landingRedirect: string | null = null;
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
    const { data: claims } = await db.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (userId && isLandingPath(pathname))
      landingRedirect = await signedInLandingTarget(db, userId, pathname.split('/')[1]);
  }
  // Per-request nonce policy. Next reads the nonce from the request's CSP header and stamps
  // it on its own inline scripts; `x-nonce` exposes it to our components via next/headers.
  // Static content pages are exempt: a nonce would force them to render dynamically.
  const enforce = isCspEnforced();
  const nonce = isStaticContentPath(pathname) ? undefined : createNonce();
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
  const response = landingRedirect
    ? NextResponse.redirect(new URL(landingRedirect, request.url))
    : localize(request);
  response.headers.set(csp.name, csp.value);
  updates.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  if (updates.length || request.cookies.getAll().some(({ name }) => name.startsWith('sb-'))) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}
export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
