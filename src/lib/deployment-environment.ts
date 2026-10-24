import 'server-only';

export const STAGING_SUPABASE_PROJECT_REF = 'dmbepdjwjmuelqcfzjae';
export const PRODUCTION_SUPABASE_PROJECT_REF = 'ubrvjjibibqaiomrvwbd';
export const PRODUCTION_SITE_ORIGIN = 'https://darsak-platform.vercel.app';

type Environment = Record<string, string | undefined>;

function parseCanonicalSupabaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Supabase URL is invalid.');
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Supabase URL must be canonical.');
  }
  return parsed;
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

function assertAppMarkersMatch(env: Environment): void {
  if (env.APP_ENV && env.NEXT_PUBLIC_APP_ENV && env.APP_ENV !== env.NEXT_PUBLIC_APP_ENV) {
    throw new Error('Server and public application environment markers must match.');
  }
}

function assertStagingBackendConfig(url: string, env: Environment): void {
  if (env.SUPABASE_EXPECTED_PROJECT_REF !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(
      'Staging requires SUPABASE_EXPECTED_PROJECT_REF to match the staging Supabase project.',
    );
  }
  const parsed = parseCanonicalSupabaseUrl(url);
  if (parsed.protocol !== 'https:' || parsed.port)
    throw new Error('Staging requires canonical HTTPS for the remote Supabase project.');
  if (parsed.hostname !== `${STAGING_SUPABASE_PROJECT_REF}.supabase.co`) {
    if (parsed.hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`) {
      throw new Error('The production Supabase project is forbidden in staging.');
    }
    throw new Error('Staging requires the exact staging Supabase project.');
  }
}

function assertProductionBackendConfig(url: string, env: Environment): void {
  if (
    env.APP_ENV !== 'production' ||
    env.NEXT_PUBLIC_APP_ENV !== 'production' ||
    env.VERCEL_ENV !== 'production'
  ) {
    throw new Error(
      'The live Supabase project requires explicit production app and hosting markers.',
    );
  }
  if (env.SUPABASE_EXPECTED_PROJECT_REF !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(
      'Production requires SUPABASE_EXPECTED_PROJECT_REF to match the live Supabase project.',
    );
  }
  if (env.NEXT_PUBLIC_SITE_URL !== PRODUCTION_SITE_ORIGIN) {
    throw new Error('Production requires the fixed public site origin.');
  }
  const parsed = parseCanonicalSupabaseUrl(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
  ) {
    throw new Error('Production requires the exact live Supabase project.');
  }
  if (parsed.port) throw new Error('Production requires the canonical live Supabase URL.');
}

/** Enforces the selected deployment's Supabase destination before any request is made. */
export function assertStagingBackend(url: string, env: Environment = process.env): void {
  assertAppMarkersMatch(env);

  const serverEnvironment = env.APP_ENV;
  const publicEnvironment = env.NEXT_PUBLIC_APP_ENV;
  const parsed = parseCanonicalSupabaseUrl(url);
  const liveHost = `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
  const stagingHost = `${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;

  if (serverEnvironment === 'staging' || publicEnvironment === 'staging') {
    assertStagingBackendConfig(url, env);
    return;
  }
  if (
    parsed.hostname === liveHost ||
    serverEnvironment === 'production' ||
    publicEnvironment === 'production'
  ) {
    assertProductionBackendConfig(url, env);
    return;
  }
  if (serverEnvironment && !['local', 'development'].includes(serverEnvironment)) {
    throw new Error('Unsupported APP_ENV deployment marker.');
  }
  if (publicEnvironment && !['local', 'development'].includes(publicEnvironment)) {
    throw new Error('Unsupported public application environment marker.');
  }
  if (isLoopback(parsed.hostname)) {
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('Local Supabase must use HTTP or HTTPS.');
    return;
  }
  if (parsed.hostname === stagingHost) {
    throw new Error('The staging Supabase project requires explicit staging application markers.');
  }
  throw new Error(
    'Nonproduction deployments may use only a local Supabase project or the explicitly marked staging project.',
  );
}

/** External workers are active only in the exact production deployment. */
export function isExternalWorkerEnabled(env: Environment = process.env): boolean {
  if (env.APP_ENV === 'staging' || env.NEXT_PUBLIC_APP_ENV === 'staging') return false;
  return (
    env.APP_ENV === 'production' &&
    env.NEXT_PUBLIC_APP_ENV === 'production' &&
    env.VERCEL_ENV === 'production'
  );
}

/** Gate for future Google OAuth/data integration before it reads Google credentials. */
export function assertGoogleIntegrationEnvironment(
  supabaseUrl: string,
  env: Environment = process.env,
): void {
  if (env.APP_ENV !== 'staging') {
    throw new Error('Google integration is enabled only with APP_ENV=staging.');
  }
  assertStagingBackend(supabaseUrl, env);
}
