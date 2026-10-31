import localFont from 'next/font/local';

export const instrumentSans = localFont({
  src: './fonts/instrument-sans-latin-wght-normal.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-instrument-sans',
  fallback: [],
  adjustFontFallback: false,
});
export const bricolageGrotesque = localFont({
  src: './fonts/bricolage-grotesque-latin-wght-normal.woff2',
  weight: '200 800',
  display: 'swap',
  variable: '--font-bricolage-grotesque',
  fallback: [],
  adjustFontFallback: false,
});
export const ibmPlexSansArabic = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', weight: '400' },
    { path: './fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2', weight: '700' },
  ],
  display: 'swap',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0600-06FF, U+0750-077F, U+0870-089F, U+08A0-08FF, U+200C-200E, U+FB50-FDFF, U+FE70-FEFF',
    },
  ],
  preload: false,
  variable: '--font-ibm-plex-sans-arabic',
  fallback: [],
  adjustFontFallback: false,
});

export const fontVariables = `${instrumentSans.variable} ${bricolageGrotesque.variable} ${ibmPlexSansArabic.variable}`;
