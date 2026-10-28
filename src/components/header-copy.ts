const HEADER_KEYS = [
  'brand',
  'home',
  'discover',
  'teachOnDarsak',
  'dashboard',
  'account',
  'logout',
  'login',
  'register',
] as const;

/** Only the labels the client header renders, so the full dictionary never ships in the page payload. */
export function headerCopy(dictionary: Record<string, unknown>): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const key of HEADER_KEYS) {
    const value = dictionary[key];
    if (typeof value === 'string') copy[key] = value;
  }
  return copy;
}

/** Changes whenever the layout is rendered again, e.g. after a server action revalidates it. */
export function renderStamp() {
  return Date.now();
}
