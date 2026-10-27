import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminCookieName,
  getPublicSupabaseConfig,
  getSupabaseConfig,
} from '@admin/lib/supabase/config';

const LIVE_REF = 'ubrvjjibibqaiomrvwbd';
const LIVE_ORIGIN = 'https://darsak-admin-portal.vercel.app';

function env(values: Record<string, string> = {}) {
  vi.stubEnv('ADMIN_APP', values.ADMIN_APP ?? 'true');
  vi.stubEnv('APP_ENV', values.APP_ENV ?? 'production');
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', values.NEXT_PUBLIC_APP_ENV ?? 'production');
  vi.stubEnv('SUPABASE_EXPECTED_PROJECT_REF', values.SUPABASE_EXPECTED_PROJECT_REF ?? LIVE_REF);
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF',
    values.NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF ?? LIVE_REF,
  );
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    values.NEXT_PUBLIC_SUPABASE_URL ?? `https://${LIVE_REF}.supabase.co`,
  );
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', values.NEXT_PUBLIC_SITE_URL ?? LIVE_ORIGIN);
  vi.stubEnv('VERCEL_ENV', values.VERCEL_ENV ?? 'production');
  vi.stubEnv('NODE_ENV', values.NODE_ENV ?? 'production');
}

function localEnv(values: Record<string, string> = {}) {
  env({
    APP_ENV: 'local',
    NEXT_PUBLIC_APP_ENV: 'local',
    SUPABASE_EXPECTED_PROJECT_REF: 'local',
    NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF: 'local',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    VERCEL_ENV: '',
    NODE_ENV: 'test',
    ...values,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('admin Supabase application boundary', () => {
  it('accepts only the pinned live backend on its canonical production Vercel deployment', () => {
    env();
    expect(getPublicSupabaseConfig()).toMatchObject({ projectRef: LIVE_REF, secure: true });
    expect(getSupabaseConfig()).toMatchObject({ projectRef: LIVE_REF, secure: true });
    expect(adminCookieName(LIVE_REF)).toBe(`darsak-admin-${LIVE_REF}-auth`);
  });

  it('accepts local mode only for the explicit non-hosted loopback setup', () => {
    localEnv();
    expect(getPublicSupabaseConfig()).toMatchObject({ projectRef: 'local', secure: false });
    expect(getSupabaseConfig()).toMatchObject({ projectRef: 'local', secure: false });
    expect(adminCookieName('local')).toBe('darsak-admin-local-auth');
  });

  it.each(['http://localhost:3082', 'http://127.0.0.1:3082', 'http://[::1]:3082'])(
    'accepts the explicit local admin origin %s',
    origin => {
      localEnv({ NEXT_PUBLIC_SITE_URL: origin });
      expect(getPublicSupabaseConfig()).toMatchObject({ projectRef: 'local', secure: false });
      expect(getSupabaseConfig()).toMatchObject({ projectRef: 'local', secure: false });
    },
  );

  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: 'https://ubrvjjibibqaiomrvwbd.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54322' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321/other' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://user:pass@localhost:54321' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321?project=local' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321#fragment' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://example.test:54321' },
    { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000/path' },
    { NEXT_PUBLIC_SITE_URL: 'http://example.test:3000' },
    { NEXT_PUBLIC_SITE_URL: 'http://localhost:3081' },
    { NEXT_PUBLIC_SITE_URL: 'http://localhost:3083' },
  ] as Record<string, string>[])(
    'rejects a local config that is not a canonical loopback URL',
    values => {
      localEnv(values);
      expect(getSupabaseConfig()).toBeNull();
    },
  );

  it('rejects local mode in production and on hosted deployments', () => {
    localEnv({ NODE_ENV: 'production' });
    expect(getSupabaseConfig()).toBeNull();
    localEnv({ VERCEL_ENV: 'preview' });
    expect(getSupabaseConfig()).toBeNull();
  });

  it('rejects the old staging backend, live URL/ref mismatches, and non-production Vercel deployments', () => {
    env({
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_ENV: 'staging',
      SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      NEXT_PUBLIC_SITE_URL: 'https://darsak-admin-staging.vercel.app',
    });
    expect(getSupabaseConfig()).toBeNull();
    env({ SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae' });
    expect(getSupabaseConfig()).toBeNull();
    env({ NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co' });
    expect(getSupabaseConfig()).toBeNull();
    env({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
    expect(getSupabaseConfig()).toBeNull();
    env({ VERCEL_ENV: 'preview' });
    expect(getSupabaseConfig()).toBeNull();
    env({ VERCEL_ENV: 'development' });
    expect(getSupabaseConfig()).toBeNull();
  });

  it('rejects any deployment that does not identify the administrator app', () => {
    env({ ADMIN_APP: 'false' });
    expect(getSupabaseConfig()).toBeNull();
  });

  it('does not initialize the live browser client on a preview or local hostname', () => {
    env();
    vi.stubGlobal('window', { location: { origin: 'https://preview.example.vercel.app' } });
    expect(getPublicSupabaseConfig()).toBeNull();
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
    expect(getPublicSupabaseConfig()).toBeNull();
  });
});
