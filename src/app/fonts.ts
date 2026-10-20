import localFont from 'next/font/local';

// Self-hosted so pages make no third-party font requests and builds work
// offline. Files come from the OFL-licensed Fontsource packages (licences
// are kept next to them in ./fonts).

/** Body text (Latin). Arabic glyphs fall through to IBM Plex Sans Arabic. */
export const instrumentSans = localFont({
  src: './fonts/instrument-sans-latin-wght-normal.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-instrument-sans',
  // No generic fallback inside the variable: system fonts such as Arial carry
  // Arabic glyphs and would win over IBM Plex Sans Arabic in the stack.
  fallback: [],
  adjustFontFallback: false,
});

/** Display headings (Latin). */
export const bricolageGrotesque = localFont({
  src: './fonts/bricolage-grotesque-latin-wght-normal.woff2',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-bricolage-grotesque',
  fallback: [],
  adjustFontFallback: false,
});

/** Arabic text for both body and headings. */
export const ibmPlexSansArabic = localFont({
  src: [
    {
      path: './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  // Only Arabic code points use this face, so English pages never download it.
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
