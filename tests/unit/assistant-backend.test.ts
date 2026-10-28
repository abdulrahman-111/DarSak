import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { assistantRequestSchema } from '@/features/assistant/domain';
import { DEFAULT_SANAD_LIMITS, getSanadConfig } from '@/features/assistant/config';

describe('SanDak request contract', () => {
  it('accepts bounded chat and flattened draft requests without any age acknowledgment', () => {
    expect(
      assistantRequestSchema.safeParse({
        mode: 'chat',
        locale: 'en',
        page: 'group',
        messages: [{ role: 'user', text: 'hello' }],
      }).success,
    ).toBe(true);
    expect(
      assistantRequestSchema.safeParse({
        mode: 'group_draft',
        locale: 'ar',
        topic: 'رياضيات',
        level: 'beginner',
        format: 'online',
        guidance: '',
      }).success,
    ).toBe(true);
  });

  it('rejects forged fields, unknown page types, excessive history and a final assistant message', () => {
    const valid = {
      mode: 'chat',
      locale: 'en',
      messages: [{ role: 'user', text: 'hello' }],
    };
    expect(assistantRequestSchema.safeParse({ ...valid, userId: 'forged' }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ ...valid, acknowledged: true }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ ...valid, page: '/en/teacher/42' }).success).toBe(
      false,
    );
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

describe('SanDak config', () => {
  it('is enabled only with SANAD_ENABLED=true and a server-only API key', () => {
    expect(getSanadConfig({})).toBeNull();
    expect(getSanadConfig({ SANAD_ENABLED: 'true' })).toBeNull();
    expect(getSanadConfig({ GEMINI_API_KEY: 'key' })).toBeNull();
    expect(getSanadConfig({ SANAD_ENABLED: 'false', GEMINI_API_KEY: 'key' })).toBeNull();
    expect(getSanadConfig({ SANAD_ENABLED: 'TRUE', GEMINI_API_KEY: 'key' })).toBeNull();
    expect(getSanadConfig({ SANAD_ENABLED: 'true', GEMINI_API_KEY: '   ' })).toBeNull();
    expect(getSanadConfig({ SANAD_ENABLED: 'true', GEMINI_API_KEY: ' key ' })?.apiKey).toBe('key');
  });

  it('does not depend on staging markers, allowlists or deployment environment', () => {
    const config = getSanadConfig({
      SANAD_ENABLED: 'true',
      GEMINI_API_KEY: 'key',
      APP_ENV: 'production',
      NEXT_PUBLIC_APP_ENV: 'production',
    });
    expect(config).not.toBeNull();
    expect(config).not.toHaveProperty('allowedUserIds');
  });

  it('uses safe default limits and accepts valid overrides only', () => {
    const base = { SANAD_ENABLED: 'true', GEMINI_API_KEY: 'key' };
    expect(DEFAULT_SANAD_LIMITS).toEqual({
      userDaily: 60,
      userMinute: 10,
      globalDaily: 3000,
      globalConcurrency: 10,
    });
    expect(getSanadConfig(base)?.limits).toEqual(DEFAULT_SANAD_LIMITS);
    expect(
      getSanadConfig({
        ...base,
        SANAD_USER_DAILY_LIMIT: '30',
        SANAD_USER_MINUTE_LIMIT: '5',
        SANAD_GLOBAL_DAILY_LIMIT: '1000',
        SANAD_GLOBAL_CONCURRENCY: '4',
      })?.limits,
    ).toEqual({ userDaily: 30, userMinute: 5, globalDaily: 1000, globalConcurrency: 4 });
    expect(
      getSanadConfig({
        ...base,
        SANAD_USER_DAILY_LIMIT: '0',
        SANAD_USER_MINUTE_LIMIT: '-3',
        SANAD_GLOBAL_DAILY_LIMIT: 'lots',
        SANAD_GLOBAL_CONCURRENCY: '9999999',
      })?.limits,
    ).toEqual(DEFAULT_SANAD_LIMITS);
  });
});
