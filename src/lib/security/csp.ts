/**
 * Content-Security-Policy construction for the public application.
 *
 * Pure and Edge-safe: used by `src/proxy.ts` (per-request nonce policy) and
 * `next.config.ts` (static, always-enforced baseline). The administrator app keeps its own
 * copy in `apps/admin/src/lib/csp.ts` because the two apps must not share modules.
 */

/** Directives that are always enforced via the static header, independent of CSP_ENFORCE. */
export const BASELINE_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

export const HSTS = 'max-age=31536000';

export const CSP_ENFORCING_HEADER = 'Content-Security-Policy';
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const GOOGLE_ORIGIN = 'https://accounts.google.com';

/**
 * Locale-prefixed content pages that are (or are about to become) statically rendered.
 * A nonce forces dynamic rendering, so these paths get no nonce; they receive a nonce-free
 * policy that allows Next's own inline bootstrap scripts instead. They contain no
 * user-generated content and no auth widgets.
 */
const STATIC_CONTENT_PATH = /^\/(?:(?:ar|en)\/)?(?:help|privacy|terms|pricing)(?:\/|$)/;
/** The localized landing page (`/ar`, `/en`, optional trailing slash), statically rendered for visitors. */
const LANDING_PATH = /^\/(?:ar|en)\/?$/;

export function isLandingPath(pathname: string) {
  return LANDING_PATH.test(pathname);
}

export function isStaticContentPath(pathname: string) {
  return STATIC_CONTENT_PATH.test(pathname) || LANDING_PATH.test(pathname);
}

export function isCspEnforced(value = process.env.CSP_ENFORCE) {
  return value === 'true';
}

export function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Supabase http(s) and ws(s) origins derived from NEXT_PUBLIC_SUPABASE_URL, or none. */
export function supabaseOrigins(value = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!value) return { http: null, ws: null };
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { http: null, ws: null };
    return {
      http: url.origin,
      ws: `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`,
    };
  } catch {
    return { http: null, ws: null };
  }
}

type PolicyOptions = {
  /** Omit for nonce-free static content pages. */
  nonce?: string;
  supabaseUrl?: string;
  /** Adds 'unsafe-eval' for React's development tooling only. */
  development?: boolean;
  /** Emit upgrade-insecure-requests (enforcing mode on HTTPS deployments only). */
  upgradeInsecure?: boolean;
};

export function buildCsp({
  nonce,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  development = process.env.NODE_ENV !== 'production',
  upgradeInsecure = false,
}: PolicyOptions = {}) {
  const supabase = supabaseOrigins(supabaseUrl);
  const script = nonce
    ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE_ORIGIN]
    : ["'self'", "'unsafe-inline'"];
  if (development) script.push("'unsafe-eval'");
  const list = (...values: (string | null)[]) => values.filter(Boolean).join(' ');
  const directives = [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list("'self'", 'data:', 'blob:', supabase.http)}`,
    "font-src 'self' data:",
    `connect-src ${list("'self'", supabase.http, supabase.ws)}`,
    `frame-src ${TURNSTILE_ORIGIN} ${GOOGLE_ORIGIN}`,
    // Google sign-in is a server-action redirect through Supabase's authorize endpoint.
    `form-action ${list("'self'", supabase.http, GOOGLE_ORIGIN)}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (upgradeInsecure) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** Header name + value to send for the current mode; Report-Only unless CSP_ENFORCE=true. */
export function cspHeader(policy: string, enforce = isCspEnforced()) {
  return {
    name: enforce ? CSP_ENFORCING_HEADER : CSP_REPORT_ONLY_HEADER,
    value: policy,
  };
}
