import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { snippet, type SeoLocale } from './metadata';

export const entityImageSize = { width: 1200, height: 630 };
const fontPath = (name: string) => path.join(process.cwd(), 'src/app/fonts', name);
const arabicFontPath = fontPath('ibm-plex-sans-arabic-arabic-700-normal.ttf');
const latinFontPath = fontPath('instrument-sans-latin-700.ttf');
const glyphCoveragePath = path.join(process.cwd(), 'src/features/seo/share-glyph-coverage.json');
const genericText = {
  ar: { title: 'ملف تعليمي', subject: 'درسك' },
  en: { title: 'Learning profile', subject: 'DarSak' },
} as const;

function supportsText(text: string, codepoints: Set<number>) {
  return Array.from(text).every(char => codepoints.has(char.codePointAt(0)!));
}

function displayPhrase(text: string) {
  return snippet(text.normalize('NFKC'), 42).replace(/\s+/g, '\u00a0');
}

function phraseSize(text: string, max: number, min: number) {
  return Math.max(min, Math.min(max, Math.floor(1000 / Math.max(text.length * 1.05, 1))));
}

export async function entityShareImage(locale: SeoLocale, title: string, subject: string) {
  const [arabicFont, latinFont, codepoints] = await Promise.all([
    readFile(arabicFontPath),
    readFile(latinFontPath),
    readFile(glyphCoveragePath, 'utf8').then(value => new Set<number>(JSON.parse(value))),
  ]);
  const ar = locale === 'ar';
  const safeTitle = supportsText(title, codepoints) ? title : genericText[locale].title;
  const safeSubject = supportsText(subject, codepoints) ? subject : genericText[locale].subject;
  const titleText = displayPhrase(safeTitle);
  const subjectText = displayPhrase(safeSubject);
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
        padding: '72px 88px',
        background: '#0e4a4b',
        color: '#f6f0e4',
        fontFamily: 'Instrument Sans, Plex Arabic',
        direction: ar ? 'rtl' : 'ltr',
        borderBottom: '16px solid #b04c16',
      }}
    >
      <div style={{ display: 'flex', fontSize: 38, fontWeight: 700 }}>DarSak · درسك</div>
      <div
        style={{ display: 'flex', width: 112, height: 8, margin: '30px 0', background: '#b04c16' }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: ar ? 'flex-end' : 'flex-start',
          fontSize: phraseSize(titleText, 62, 22),
          lineHeight: 1.2,
          width: 1024,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          fontWeight: 700,
        }}
      >
        {titleText}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: ar ? 'flex-end' : 'flex-start',
          marginTop: 28,
          fontSize: phraseSize(subjectText, 32, 20),
          lineHeight: 1.25,
          color: '#d8e4dd',
          width: 980,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {subjectText}
      </div>
    </div>,
    {
      ...entityImageSize,
      fonts: [
        { name: 'Instrument Sans', data: latinFont, weight: 700 },
        { name: 'Plex Arabic', data: arabicFont, weight: 700 },
      ],
    },
  );
}
