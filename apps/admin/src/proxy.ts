import createMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminCookieName, getSupabaseConfig } from '@admin/lib/supabase/config';
import { buildCsp, createNonce, cspHeader, isCspEnforced } from '@admin/lib/csp';

const ADMIN_ORIGIN = 'https://darsak-admin-portal.vercel.app';

const localize = createMiddleware({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});

export async function proxy(request: NextRequest) {
  const productionPortal =
    process.env.VERCEL_ENV === 'production' && process.env.APP_ENV === 'production';
  if (productionPortal && request.nextUrl.origin !== ADMIN_ORIGIN) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new NextResponse('Canonical administrator portal required', {
        status: 421,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const destination = new URL(ADMIN_ORIGIN);
    destination.pathname = request.nextUrl.pathname;
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 308);
  }

  const config = getSupabaseConfig();
  const updates: { name: string; value: string; options: CookieOptions }[] = [];
  if (config) {
    const db = createServerClient(config.url, config.key, {
      cookieOptions: {
        name: adminCookieName(config.projectRef),
        path: '/',
        sameSite: 'lax',
        secure: config.secure,
      },
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
    await db.auth.getClaims();
  }
  // Per-request nonce policy; Report-Only unless CSP_ENFORCE=true. Next stamps the nonce on
  // its inline scripts from the request CSP header; `x-nonce` exposes it to components.
  const enforce = isCspEnforced();
  const nonce = createNonce();
  const csp = cspHeader(
    buildCsp({
      nonce,
      upgradeInsecure: enforce && process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://'),
    }),
    enforce,
  );
  request.headers.set('x-nonce', nonce);
  request.headers.set(csp.name, csp.value);
  const response = localize(request);
  response.headers.set(csp.name, csp.value);
  for (const { name, value, options } of updates) response.cookies.set(name, value, options);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
