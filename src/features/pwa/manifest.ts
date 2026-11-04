import type { MetadataRoute } from 'next';

export const PWA_LOCALES = ['ar', 'en'] as const;

export function localizedManifest(locale: string): MetadataRoute.Manifest {
  const currentLocale = locale === 'ar' ? 'ar' : 'en';
  const arabic = currentLocale === 'ar';
  return {
    id: '/',
    name: arabic ? 'درسك' : 'DarSak',
    short_name: arabic ? 'درسك' : 'DarSak',
    lang: currentLocale,
    dir: arabic ? 'rtl' : 'ltr',
    start_url: `/${currentLocale}`,
    scope: '/',
    display: 'standalone',
    background_color: '#f6f0e4',
    theme_color: '#0e4a4b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
