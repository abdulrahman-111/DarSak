import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { assistantRequestSchema } from '@/features/assistant/domain';
import { getSanadConfig } from '@/features/assistant/config';

const keys = [
  'APP_ENV',
  'NEXT_PUBLIC_APP_ENV',
  'SUPABASE_EXPECTED_PROJECT_REF',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SANAD_ENABLED',
  'GEMINI_API_KEY',
  'SANAD_PILOT_USER_IDS',
  'NEXT_PUBLIC_SITE_URL',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => {
  for (const key of keys) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Sanad request contract', () => {
  it('accepts bounded chat and flattened draft requests', () => {
    expect(
      assistantRequestSchema.safeParse({
        mode: 'chat',
        locale: 'en',
        acknowledged: true,
        messages: [{ role: 'user', text: 'hello' }],
      }).success,
    ).toBe(true);
    expect(
      assistantRequestSchema.safeParse({
        mode: 'group_draft',
        acknowledged: true,
        locale: 'ar',
        topic: 'رياضيات',
        level: 'beginner',
        format: 'online',
        guidance: '',
      }).success,
    ).toBe(true);
  });
  it('rejects forged fields, missing acknowledgment, excessive history and a final assistant message', () => {
    const valid = {
      mode: 'chat',
      locale: 'en',
      acknowledged: true,
      messages: [{ role: 'user', text: 'hello' }],
    };
    expect(assistantRequestSchema.safeParse({ ...valid, userId: 'forged' }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ ...valid, acknowledged: false }).success).toBe(false);
    expect(
      assistantRequestSchema.safeParse({
        ...valid,
        messages: [{ role: 'assistant', text: 'hello' }],
      }).success,
    ).toBe(false);
    expect(
      assistantRequestSchema.safeParse({
        ...valid,
        messages: [{ role: 'user', text: 'x'.repeat(2001) }],
      }).success,
    ).toBe(false);
  });
});

describe('Sanad config', () => {
  it('fails closed unless every staging and pilot marker is present', () => {
    for (const key of keys) delete process.env[key];
    expect(getSanadConfig()).toBeNull();
    Object.assign(process.env, {
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_ENV: 'staging',
      SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      SANAD_ENABLED: 'true',
      GEMINI_API_KEY: 'test-key',
      SANAD_PILOT_USER_IDS: '11111111-1111-4111-8111-111111111111',
      NEXT_PUBLIC_SITE_URL: 'https://darsak-sanad-staging.vercel.app',
    });
    expect(getSanadConfig()?.allowedUserIds.has('11111111-1111-4111-8111-111111111111')).toBe(true);
    process.env.APP_ENV = 'production';
    expect(getSanadConfig()).toBeNull();
  });

  it.each([
    ['production public marker', { NEXT_PUBLIC_APP_ENV: 'production' }],
    ['mismatched server marker', { APP_ENV: 'production' }],
    ['missing provider key', { GEMINI_API_KEY: '' }],
  ])('fails closed for %s', (_label, change) => {
    Object.assign(process.env, {
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_ENV: 'staging',
      SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      SANAD_ENABLED: 'true',
      GEMINI_API_KEY: 'test-key',
      SANAD_PILOT_USER_IDS: '11111111-1111-4111-8111-111111111111',
      NEXT_PUBLIC_SITE_URL: 'https://darsak-sanad-staging.vercel.app',
    });
    Object.assign(process.env, change);
    expect(getSanadConfig()).toBeNull();
  });

  it('allows only trusted configured Vercel preview origins alongside the canonical site', () => {
    Object.assign(process.env, {
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_ENV: 'staging',
      SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      SANAD_ENABLED: 'true',
      GEMINI_API_KEY: 'test-key',
      SANAD_PILOT_USER_IDS: '11111111-1111-4111-8111-111111111111',
      NEXT_PUBLIC_SITE_URL: 'https://darsak-sanad-staging.vercel.app',
      VERCEL_URL: 'darsak-sanad-staging-git-test.vercel.app',
    });
    const config = getSanadConfig();
    expect(config?.allowedOrigins.has('https://darsak-sanad-staging-git-test.vercel.app')).toBe(
      true,
    );
    expect(config?.allowedOrigins.has('https://attacker.example')).toBe(false);
  });
});
