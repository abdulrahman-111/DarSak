export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function direction(locale: Locale) {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
