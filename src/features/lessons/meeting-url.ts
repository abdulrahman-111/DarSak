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
 * Extra hosts are trusted configured domains; their subdomains are accepted too.
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
  if (host.includes('xn--') || isIpLiteral(host) || host.endsWith('.')) return null;

  if (
    EXACT_MEETING_HOSTS.has(host) ||
    isSubdomainOf(host, MEETING_DOMAIN_ROOTS) ||
    isSubdomainOf(host, extraHosts)
  ) {
    return url.toString();
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
