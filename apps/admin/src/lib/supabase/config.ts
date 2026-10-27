const PRODUCTION_PROJECT_REF = 'ubrvjjibibqaiomrvwbd';
const ADMIN_ORIGIN = 'https://darsak-admin-portal.vercel.app';
const LOCAL_PROJECT_REF = 'local';
const LOCAL_SUPABASE_PORT = '54321';
const LOCAL_SITE_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
  'http://localhost:3082',
  'http://127.0.0.1:3082',
  'http://[::1]:3082',
]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type AdminSupabaseConfig = {
  url: string;
  key: string;
  projectRef: typeof PRODUCTION_PROJECT_REF | typeof LOCAL_PROJECT_REF;
  secure: boolean;
};

function parseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function isProductionConfig(urlValue: string, ref: string, siteUrl: string) {
  const url = parseUrl(urlValue);
  return (
    ref === PRODUCTION_PROJECT_REF &&
    siteUrl === ADMIN_ORIGIN &&
    url?.protocol === 'https:' &&
    url.hostname === `${PRODUCTION_PROJECT_REF}.supabase.co` &&
    !url.port
  );
}

function isLocalConfig(urlValue: string, ref: string, siteUrl: string) {
  if (ref !== LOCAL_PROJECT_REF || process.env.NODE_ENV === 'production') return false;
  const url = parseUrl(urlValue);
  const site = parseUrl(siteUrl);
  return Boolean(
    url?.protocol === 'http:' &&
      LOOPBACK_HOSTS.has(url.hostname) &&
      url.port === LOCAL_SUPABASE_PORT &&
      site?.protocol === 'http:' &&
      LOCAL_SITE_ORIGINS.has(site.origin) &&
      site.origin === siteUrl &&
      LOOPBACK_HOSTS.has(site.hostname),
  );
}

function isCurrentBrowserOrigin(siteUrl: string) {
  return typeof window === 'undefined' || window.location.origin === siteUrl;
}

export function getPublicSupabaseConfig(): AdminSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const marker = process.env.NEXT_PUBLIC_APP_ENV;
  const expectedRef = process.env.NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url || !key || !marker || !expectedRef || !siteUrl) return null;

  if (
    marker === 'production' &&
    isProductionConfig(url, expectedRef, siteUrl) &&
    isCurrentBrowserOrigin(siteUrl)
  ) {
    return { url, key, projectRef: PRODUCTION_PROJECT_REF, secure: true };
  }
  if (
    marker === 'local' &&
    process.env.NODE_ENV !== 'production' &&
    isLocalConfig(url, expectedRef, siteUrl) &&
    isCurrentBrowserOrigin(siteUrl)
  ) {
    return { url, key, projectRef: LOCAL_PROJECT_REF, secure: false };
  }
  return null;
}

export function getSupabaseConfig(): AdminSupabaseConfig | null {
  if (process.env.ADMIN_APP !== 'true') return null;
  const marker = process.env.APP_ENV;
  const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF;
  const publicConfig = getPublicSupabaseConfig();
  if (!publicConfig || marker !== process.env.NEXT_PUBLIC_APP_ENV) return null;

  if (
    marker === 'production' &&
    expectedRef === PRODUCTION_PROJECT_REF &&
    process.env.VERCEL_ENV === 'production'
  ) {
    return publicConfig;
  }
  if (
    marker === 'local' &&
    process.env.NODE_ENV !== 'production' &&
    !process.env.VERCEL_ENV &&
    expectedRef === LOCAL_PROJECT_REF
  ) {
    return publicConfig;
  }
  return null;
}

export function isConfigured() {
  return getSupabaseConfig() !== null;
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Admin Supabase is not configured for the canonical production portal or local development.');
  return config;
}

export function adminCookieName(
  projectRef: AdminSupabaseConfig['projectRef'] = PRODUCTION_PROJECT_REF,
) {
  return `darsak-admin-${projectRef}-auth`;
}
