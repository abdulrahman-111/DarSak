export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
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
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return fallback;
    return parsed.origin;
  } catch { return fallback; }
}
