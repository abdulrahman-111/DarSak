import 'server-only';

export type SanadLimits = {
  userDaily: number;
  userMinute: number;
  globalDaily: number;
  globalConcurrency: number;
};

export type SanadConfig = {
  apiKey: string;
  limits: SanadLimits;
};

/** Safe defaults: per user 60/day and 10/min; global 3000/day and 10 in flight. */
export const DEFAULT_SANAD_LIMITS: SanadLimits = {
  userDaily: 60,
  userMinute: 10,
  globalDaily: 3000,
  globalConcurrency: 10,
};

const MAX_LIMIT = 100_000;

function limit(value: string | undefined, fallback: number): number {
  const text = value?.trim();
  if (!text || !/^\d{1,6}$/.test(text)) return fallback;
  const parsed = Number(text);
  return parsed >= 1 && parsed <= MAX_LIMIT ? parsed : fallback;
}

/**
 * Returns null unless SANAD_ENABLED=true and a server-only GEMINI_API_KEY is set.
 * Quota limits are optional and fall back to safe defaults when unset or invalid.
 */
export function getSanadConfig(
  env: Record<string, string | undefined> = process.env,
): SanadConfig | null {
  if (env.SANAD_ENABLED !== 'true') return null;
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    limits: {
      userDaily: limit(env.SANAD_USER_DAILY_LIMIT, DEFAULT_SANAD_LIMITS.userDaily),
      userMinute: limit(env.SANAD_USER_MINUTE_LIMIT, DEFAULT_SANAD_LIMITS.userMinute),
      globalDaily: limit(env.SANAD_GLOBAL_DAILY_LIMIT, DEFAULT_SANAD_LIMITS.globalDaily),
      globalConcurrency: limit(
        env.SANAD_GLOBAL_CONCURRENCY,
        DEFAULT_SANAD_LIMITS.globalConcurrency,
      ),
    },
  };
}
