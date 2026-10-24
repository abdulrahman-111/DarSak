const STAGING_PROJECT_REF = 'dmbepdjwjmuelqcfzjae';
const PRODUCTION_PROJECT_REF = 'ubrvjjibibqaiomrvwbd';
const PRODUCTION_SITE_ORIGIN = 'https://darsak-platform.vercel.app';

function isLoopback(hostname: string) {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    const marker = process.env.NEXT_PUBLIC_APP_ENV;
    const expectedRef = process.env.NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF;
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    if (marker === 'staging') {
      if (expectedRef !== STAGING_PROJECT_REF || parsed.protocol !== 'https:' || parsed.port || parsed.hostname !== `${STAGING_PROJECT_REF}.supabase.co`) return null;
    } else if (marker === 'production') {
      const browserOrigin = typeof window === 'undefined' ? null : window.location?.origin;
      if (expectedRef !== PRODUCTION_PROJECT_REF || parsed.protocol !== 'https:' || parsed.port || parsed.hostname !== `${PRODUCTION_PROJECT_REF}.supabase.co` || process.env.NEXT_PUBLIC_SITE_URL !== PRODUCTION_SITE_ORIGIN || (browserOrigin !== null && browserOrigin !== PRODUCTION_SITE_ORIGIN)) return null;
    } else if (marker === 'local' || marker === 'development' || marker === undefined || marker === '') {
      if (!isLoopback(parsed.hostname) || !['http:', 'https:'].includes(parsed.protocol)) return null;
    } else {
      return null;
    }
  } catch { return null; }
  return { url, key };
}
export function isConfigured() { return getSupabaseConfig() !== null; }
export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  return config;
}
/** Public site origin for auth redirects; falls back to local dev when unset or invalid. */
export function siteUrl() {
  const fallback = 'http://localhost:3000';
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
    return value === PRODUCTION_SITE_ORIGIN ? PRODUCTION_SITE_ORIGIN : fallback;
  }
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return fallback;
    return parsed.origin;
  } catch { return fallback; }
}
