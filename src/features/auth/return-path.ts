import type { Locale } from '@/i18n/config';

/** Switches the locale on a safe, internal path while keeping its query and fragment. */
export function switchInternalLocalePath(
  candidate: unknown,
  from: Locale,
  to: Locale,
): string | null {
  if (typeof candidate !== 'string' || !candidate.startsWith(`/${from}`)) return null;
  if (
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  )
    return null;

  const rawPath = candidate.split(/[?#]/, 1)[0];
  if (rawPath !== `/${from}` && !rawPath.startsWith(`/${from}/`)) return null;
  for (const segment of rawPath.split('/').slice(2)) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\'))
      return null;
  }

  let url: URL;
  try {
    url = new URL(candidate, 'https://darsak.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://darsak.invalid' || url.username || url.password) return null;

  const prefixLength = from.length + 1;
  return `/${to}${url.pathname.slice(prefixLength)}${url.search}${url.hash}`;
}

/** Rewrites safe redirect targets while preserving all unrelated search parameters. */
export function switchLocaleReturnParams(
  params: URLSearchParams,
  from: Locale,
  to: Locale,
): URLSearchParams {
  const switchedParams = new URLSearchParams(params);
  for (const key of ['next', 'returnTo']) {
    const values = switchedParams.getAll(key);
    if (values.length) {
      switchedParams.delete(key);
      for (const value of values) {
        const switched = switchInternalLocalePath(value, from, to);
        if (switched) switchedParams.append(key, switched);
      }
    }
  }
  return switchedParams;
}

const UUID_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

/** Accept only a local group/class path in the active locale. */
export function safeLoginReturnPath(locale: Locale, candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;

  const pathPattern = new RegExp(`^/${locale}/(?:groups|classes)/${UUID_PATTERN}(?![\\s\\S])`);
  return pathPattern.test(candidate) ? candidate : null;
}

export function loginRedirectPath(
  locale: Locale,
  candidate: unknown,
  profile?: { role?: unknown; status?: unknown } | null,
): string {
  const safeReturn = safeLoginReturnPath(locale, candidate);
  if (safeReturn) return safeReturn;
  const role = profile?.role;
  if (profile?.status === 'active' && (role === 'student' || role === 'teacher'))
    return `/${locale}/${role}`;
  if (profile?.role === 'admin') return `/${locale}/login?error=admin-portal`;
  return `/${locale}/dashboard`;
}

const AUTH_NEXT_PATTERN = /^\/(?:ar|en)(?:\/[A-Za-z0-9\-_/]*|)$/;

/** Sanitize the `next` of an auth callback: local, locale-prefixed paths only. */
export function safeAuthNext(candidate: unknown, fallbackLocale: Locale): string {
  const fallback = `/${fallbackLocale}/dashboard`;
  if (typeof candidate !== 'string') return fallback;
  if (!AUTH_NEXT_PATTERN.test(candidate)) return fallback;
  if (candidate.includes('//') || candidate.includes('\\') || candidate.includes('..'))
    return fallback;
  return candidate;
}
