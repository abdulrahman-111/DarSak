import { locales } from './config';

/** Prerender every supported locale for pages that need no per-request data. */
export function localeStaticParams() {
  return locales.map(locale => ({ locale }));
}
