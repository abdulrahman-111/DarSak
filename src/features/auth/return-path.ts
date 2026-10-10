import type { Locale } from '@/i18n/config';

const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

/** Accept only a local group/class path in the active locale. */
export function safeLoginReturnPath(locale: Locale, candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;

  const pathPattern = new RegExp(`^/${locale}/(?:groups|classes)/${UUID_PATTERN}(?![\\s\\S])`);
  return pathPattern.test(candidate) ? candidate : null;
}

export function loginRedirectPath(locale: Locale, candidate: unknown): string {
  return safeLoginReturnPath(locale, candidate) ?? `/${locale}/dashboard`;
}
