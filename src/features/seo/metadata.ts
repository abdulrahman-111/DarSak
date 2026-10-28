import type { Metadata } from 'next';
import { siteUrl } from '@/lib/supabase/config';

export type SeoLocale = 'ar' | 'en';

const brandName: Record<SeoLocale, string> = { ar: 'درسك', en: 'DarSak' };
const openGraphLocale: Record<SeoLocale, string> = { ar: 'ar_EG', en: 'en_US' };

/** Path for a locale, e.g. localePath('en', '/teachers') -> '/en/teachers'. */
export function localePath(locale: SeoLocale, path = '') {
  const clean = path === '/' ? '' : path;
  return `/${locale}${clean}`;
}

/** Canonical and hreflang alternates for a locale-independent path ('' = landing page). */
export function seoAlternates(locale: SeoLocale, path = '') {
  const origin = siteUrl();
  return {
    canonical: `${origin}${localePath(locale, path)}`,
    languages: {
      ar: `${origin}${localePath('ar', path)}`,
      en: `${origin}${localePath('en', path)}`,
    },
  };
}

/** "Page title · DarSak" using the localized brand name. */
export function seoTitle(locale: SeoLocale, title: string) {
  return `${title} · ${brandName[locale]}`;
}

/** The locale's branded share card (src/app/[locale]/opengraph-image.tsx). */
function shareImage(locale: SeoLocale) {
  return { url: `${siteUrl()}/${locale}/opengraph-image`, width: 1200, height: 630 };
}

export function pageMetadata({
  locale,
  path = '',
  title,
  description,
  fullTitle = false,
  noIndex = false,
}: {
  locale: SeoLocale;
  path?: string;
  title: string;
  description: string;
  /** Use `title` as-is instead of appending the brand name. */
  fullTitle?: boolean;
  noIndex?: boolean;
}): Metadata {
  const alternates = seoAlternates(locale, path);
  const imageUrl = shareImage(locale).url;
  const finalTitle = fullTitle ? title : seoTitle(locale, title);
  return {
    title: finalTitle,
    description,
    alternates,
    openGraph: {
      title: finalTitle,
      description,
      url: alternates.canonical,
      siteName: brandName[locale],
      locale: openGraphLocale[locale],
      alternateLocale: openGraphLocale[locale === 'ar' ? 'en' : 'ar'],
      type: 'website',
      images: [shareImage(locale)],
    },
    twitter: { card: 'summary_large_image', title: finalTitle, description, images: [imageUrl] },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** Trim and collapse whitespace, cutting at a word boundary with an ellipsis. */
export function snippet(text: string | null | undefined, max = 160) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
