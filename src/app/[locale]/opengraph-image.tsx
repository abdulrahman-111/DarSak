import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { ensureLocale, getDictionary } from '@/i18n/config';

export const alt = 'DarSak';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Bundled with the app (TrueType, since the share-image renderer cannot read the
// WOFF2 files used for web pages): no network fetch while rendering.
const arabicFont = path.join(
  process.cwd(),
  'src/app/fonts/ibm-plex-sans-arabic-arabic-700-normal.ttf',
);

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = ensureLocale((await params).locale);
  const t = await getDictionary(locale);
  const ar = locale === 'ar';
  const fonts = ar
    ? [{ name: 'Plex Arabic', data: await readFile(arabicFont), weight: 700 as const }]
    : [];

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: ar ? 'flex-end' : 'flex-start',
        textAlign: ar ? 'right' : 'left',
        padding: '0 96px',
        background: '#0e4a4b',
        color: '#f6f0e4',
        fontFamily: ar ? '"Plex Arabic"' : 'sans-serif',
        direction: ar ? 'rtl' : 'ltr',
        borderBottom: '16px solid #b04c16',
      }}
    >
      <div style={{ display: 'flex', fontSize: 132, fontWeight: 700, color: '#f6f0e4' }}>
        {t.brand}
      </div>
      <div
        style={{
          display: 'flex',
          width: 120,
          height: 8,
          margin: '28px 0 36px',
          background: '#b04c16',
        }}
      />
      <div style={{ display: 'flex', fontSize: 52, lineHeight: 1.35, maxWidth: 900 }}>
        {t.tagline}
      </div>
    </div>,
    { ...size, ...(ar ? { fonts } : {}) },
  );
}
