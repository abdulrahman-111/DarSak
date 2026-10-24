import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { getSupabaseConfig, siteUrl } from '@/lib/supabase/config';
import {
  assertStagingBackend,
  assertGoogleIntegrationEnvironment,
  isExternalWorkerEnabled,
} from '@/lib/deployment-environment';

const stagingEnv = {
  APP_ENV: 'staging',
  SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('staging deployment environment', () => {
  it('fails closed when the expected backend project is missing', () => {
    expect(() =>
      assertStagingBackend('https://dmbepdjwjmuelqcfzjae.supabase.co', {
        APP_ENV: 'staging',
      }),
    ).toThrow(/SUPABASE_EXPECTED_PROJECT_REF/);
  });

  it('keeps the server guard active when the public staging marker is set alone', () => {
    expect(() =>
      assertStagingBackend('https://ubrvjjibibqaiomrvwbd.supabase.co', {
        NEXT_PUBLIC_APP_ENV: 'staging',
        SUPABASE_EXPECTED_PROJECT_REF: 'ubrvjjibibqaiomrvwbd',
      }),
    ).toThrow(/SUPABASE_EXPECTED_PROJECT_REF/);
  });

  it('rejects a mismatched or live Supabase project', () => {
    expect(() =>
      assertStagingBackend('https://ubrvjjibibqaiomrvwbd.supabase.co', stagingEnv),
    ).toThrow(/production Supabase project is forbidden/);
    expect(() => assertStagingBackend('https://other.supabase.co', stagingEnv)).toThrow(
      /staging Supabase project/,
    );
  });

  it('requires HTTPS for remote staging Supabase', () => {
    expect(() =>
      assertStagingBackend('http://dmbepdjwjmuelqcfzjae.supabase.co', stagingEnv),
    ).toThrow(/HTTPS/);
  });

  it('allows localhost for ordinary local development', () => {
    expect(() => assertStagingBackend('http://127.0.0.1:54321', {})).not.toThrow();
    expect(() => assertStagingBackend('ftp://localhost', {})).toThrow(/HTTP or HTTPS/);
  });

  it('rejects the live Supabase project unless both environment markers and hosting target explicitly say production', () => {
    const liveUrl = 'https://ubrvjjibibqaiomrvwbd.supabase.co';
    for (const env of [
      {},
      { APP_ENV: 'local' },
      {
        APP_ENV: 'production',
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_APP_ENV: 'production',
        SUPABASE_EXPECTED_PROJECT_REF: 'ubrvjjibibqaiomrvwbd',
        NEXT_PUBLIC_SITE_URL: 'https://darsak-platform.vercel.app',
      },
      {
        APP_ENV: 'production',
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_ENV: 'staging',
        SUPABASE_EXPECTED_PROJECT_REF: 'ubrvjjibibqaiomrvwbd',
        NEXT_PUBLIC_SITE_URL: 'https://darsak-platform.vercel.app',
      },
    ]) {
      expect(() => assertStagingBackend(liveUrl, env)).toThrow();
    }
    expect(() =>
      assertStagingBackend(liveUrl, {
        APP_ENV: 'production',
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_ENV: 'production',
        SUPABASE_EXPECTED_PROJECT_REF: 'ubrvjjibibqaiomrvwbd',
        NEXT_PUBLIC_SITE_URL: 'https://darsak-platform.vercel.app',
      }),
    ).not.toThrow();
  });

  it('rejects conflicting app markers and production markers with a noncanonical site origin', () => {
    expect(() =>
      assertStagingBackend('https://dmbepdjwjmuelqcfzjae.supabase.co', {
        APP_ENV: 'staging',
        NEXT_PUBLIC_APP_ENV: 'production',
        SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      }),
    ).toThrow(/marker/i);
    expect(() =>
      assertStagingBackend('https://ubrvjjibibqaiomrvwbd.supabase.co', {
        APP_ENV: 'production',
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_ENV: 'production',
        SUPABASE_EXPECTED_PROJECT_REF: 'ubrvjjibibqaiomrvwbd',
        NEXT_PUBLIC_SITE_URL: 'https://preview.example',
      }),
    ).toThrow(/origin/i);
  });

  it('disables workers unless both app markers and the hosting target are production', () => {
    expect(
      isExternalWorkerEnabled({
        APP_ENV: 'staging',
        NEXT_PUBLIC_APP_ENV: 'staging',
        VERCEL_ENV: 'production',
      }),
    ).toBe(false);
    expect(isExternalWorkerEnabled({})).toBe(false);
    expect(
      isExternalWorkerEnabled({
        APP_ENV: 'production',
        NEXT_PUBLIC_APP_ENV: 'production',
        VERCEL_ENV: 'preview',
      }),
    ).toBe(false);
    expect(
      isExternalWorkerEnabled({
        APP_ENV: 'production',
        NEXT_PUBLIC_APP_ENV: 'production',
        VERCEL_ENV: 'production',
      }),
    ).toBe(true);
  });

  it('requires public production markers, the fixed origin, and the real browser origin for live Supabase', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ubrvjjibibqaiomrvwbd.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF', 'ubrvjjibibqaiomrvwbd');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak-platform.vercel.app');
    expect(getSupabaseConfig()).toBeNull();

    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubGlobal('window', { location: { origin: 'https://preview-abc.vercel.app' } });
    expect(getSupabaseConfig()).toBeNull();
    vi.stubGlobal('window', { location: { origin: 'https://darsak-platform.vercel.app' } });
    expect(getSupabaseConfig()).toEqual({
      url: 'https://ubrvjjibibqaiomrvwbd.supabase.co',
      key: 'publishable',
    });
  });

  it('keeps public localhost Supabase available when deployment markers are unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable');
    expect(getSupabaseConfig()).toEqual({ url: 'http://127.0.0.1:54321', key: 'publishable' });
    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('requires exact staging public project configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://dmbepdjwjmuelqcfzjae.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable');
    expect(getSupabaseConfig()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF', 'dmbepdjwjmuelqcfzjae');
    expect(getSupabaseConfig()).toEqual({
      url: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      key: 'publishable',
    });
  });

  it('requires the isolated staging backend before enabling Google integration', () => {
    expect(() =>
      assertGoogleIntegrationEnvironment('https://dmbepdjwjmuelqcfzjae.supabase.co', stagingEnv),
    ).not.toThrow();
    expect(() =>
      assertGoogleIntegrationEnvironment('https://dmbepdjwjmuelqcfzjae.supabase.co', {}),
    ).toThrow(/APP_ENV=staging/);
  });
});
