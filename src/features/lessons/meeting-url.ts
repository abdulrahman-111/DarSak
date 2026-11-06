const EXACT_MEETING_HOSTS = new Set([
  'meet.google.com',
  'teams.microsoft.com',
  'teams.live.com',
  'meet.jit.si',
]);

const MEETING_DOMAIN_ROOTS = ['zoom.us', 'whereby.com'] as const;
const MAX_MEETING_URL_LENGTH = 500;

/**
 * Checks whether a lesson meeting URL points at a supported meeting provider.
 * Extra hosts are trusted configured hostnames and must match exactly.
 */
export function isMeetingUrl(value: string, extraHosts: readonly string[] = []): boolean {
  return parseMeetingUrl(value, extraHosts) !== null;
}

/** Returns a valid URL normalized by the platform URL parser, or null when invalid/blank. */
export function parseMeetingUrl(
  value: string | null | undefined,
  extraHosts: readonly string[] = [],
): string | null {
  if (value == null || value === '') return null;
  if (value.length > MAX_MEETING_URL_LENGTH || /[\s\u0000-\u001f\u007f\\]/u.test(value)) {
    return null;
  }

  const authority = /^https:\/\/([^/?#]*)/iu.exec(value)?.[1];
  if (!authority || /[^\x00-\x7f]/u.test(authority)) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') {
    return null;
  }

  const host = url.hostname.toLowerCase();
  // URL converts IDNs to punycode. Reject those and IP literals explicitly so
  // provider matching never depends on browser IDN rendering or IP formatting.
  if (!isValidHostname(host) || host.includes('xn--') || isIpLiteral(host)) return null;

  const canonicalUrl = url.toString();
  if (
    EXACT_MEETING_HOSTS.has(host) ||
    isSubdomainOf(host, MEETING_DOMAIN_ROOTS) ||
    extraHosts.some(
      extraHost => isValidConfiguredHostname(extraHost) && host === extraHost.toLowerCase(),
    )
  ) {
    return canonicalUrl.length <= MAX_MEETING_URL_LENGTH ? canonicalUrl : null;
  }

  return null;
}

function isSubdomainOf(host: string, roots: readonly string[]): boolean {
  return roots.some(root => {
    const normalizedRoot = root.toLowerCase().replace(/\.$/, '');
    return host === normalizedRoot || host.endsWith(`.${normalizedRoot}`);
  });
}

function isIpLiteral(host: string): boolean {
  return host.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host);
}

function isValidHostname(host: string): boolean {
  return (
    host.length <= 253 &&
    host
      .split('.')
      .every(
        label =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label),
      )
  );
}

function isValidConfiguredHostname(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  return (
    isValidHostname(normalizedHost) &&
    !normalizedHost.includes('xn--') &&
    !isIpLiteral(normalizedHost)
  );
}
