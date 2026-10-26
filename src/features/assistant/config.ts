import 'server-only';

import { assertStagingBackend, STAGING_SUPABASE_PROJECT_REF } from '@/lib/deployment-environment';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_URL = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;

export type SanadConfig = {
  apiKey: string;
  allowedUserIds: Set<string>;
  allowedOrigins: Set<string>;
};

function trustedVercelOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.port ||
      !url.hostname.endsWith('.vercel.app')
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Returns null unless every server-side staging and pilot gate is explicitly satisfied. */
export function getSanadConfig(
  env: Record<string, string | undefined> = process.env,
): SanadConfig | null {
  try {
    if (
      env.SANAD_ENABLED !== 'true' ||
      env.APP_ENV !== 'staging' ||
      env.NEXT_PUBLIC_APP_ENV !== 'staging'
    )
      return null;
    if (
      env.SUPABASE_EXPECTED_PROJECT_REF !== STAGING_SUPABASE_PROJECT_REF ||
      env.NEXT_PUBLIC_SUPABASE_URL !== SUPABASE_URL
    )
      return null;
    assertStagingBackend(SUPABASE_URL, env);
    const apiKey = env.GEMINI_API_KEY?.trim();
    const ids =
      env.SANAD_PILOT_USER_IDS?.split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean) ?? [];
    const allowedUserIds = new Set(ids);
    if (!apiKey || ids.length === 0 || ids.some(id => !UUID.test(id))) return null;
    const siteUrl = new URL(env.NEXT_PUBLIC_SITE_URL ?? '');
    if (
      siteUrl.protocol !== 'https:' ||
      siteUrl.username ||
      siteUrl.password ||
      siteUrl.pathname !== '/' ||
      siteUrl.search ||
      siteUrl.hash
    )
      return null;
    const allowedOrigins = new Set([siteUrl.origin]);
    for (const value of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
      const origin = trustedVercelOrigin(value);
      if (origin) allowedOrigins.add(origin);
    }
    return { apiKey, allowedUserIds, allowedOrigins };
  } catch {
    return null;
  }
}
