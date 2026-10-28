/**
 * Content-Security-Policy construction for the administrator app.
 *
 * Mirrors `src/lib/security/csp.ts` (the two apps must not share modules) minus the
 * Turnstile and Google origins, which the administrator portal does not use. Every admin
 * route is dynamic and `no-store`, so there are no static-page exemptions.
 */

/** Directives that are always enforced via the static header, independent of CSP_ENFORCE. */
export const BASELINE_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

export const HSTS = 'max-age=31536000';

export const CSP_ENFORCING_HEADER = 'Content-Security-Policy';
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';

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
  /** Per-request nonce; without one the policy falls back to 'unsafe-inline' scripts. */
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
    ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]
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
    "frame-src 'none'",
    "form-action 'self'",
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
