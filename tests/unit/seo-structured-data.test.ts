import { describe, expect, it, vi } from 'vitest';
import { groupJsonLd, safeJsonLd, teacherJsonLd } from '@/features/seo/structured-data';
import { entityShareImage, entityImageSize } from '@/features/seo/share-image';

const uuid = '5c8f4f26-6d16-4f1f-9c10-df678e321abc';

describe('public entity JSON-LD', () => {
  it('builds Person and Course data only from public SEO fields', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak.example');
    const person = teacherJsonLd('ar', {
      id: uuid,
      name: 'Amina',
      headline: 'Math teacher',
      subjects: ['Algebra'],
    });
    const course = groupJsonLd('en', {
      id: uuid,
      name: 'Algebra group',
      description: 'Public description',
      subject: 'Algebra',
      teacher: { id: uuid, name: 'Amina' },
    });
    expect(person).toMatchObject({
      '@type': 'Person',
      knowsAbout: ['Algebra'],
      url: `https://darsak.example/ar/teachers/${uuid}`,
    });
    expect(course).toMatchObject({
      '@type': 'Course',
      provider: { '@type': 'Person', url: `https://darsak.example/en/teachers/${uuid}` },
    });
    const serialized = JSON.stringify({ person, course }).toLowerCase();
    expect(serialized).not.toMatch(/email|telephone|image|rating|price|offer|location|language/);
  });

  it('escapes script delimiters and Unicode separators and parses back to the original value', () => {
    const value = { name: '</script>&\u2028\u2029' };
    const safe = safeJsonLd(value);
    expect(safe).not.toContain('</script>');
    expect(safe).not.toContain('\u2028');
    expect(safe).toContain('\\u003c/script\\u003e\\u0026\\u2028\\u2029');
    expect(JSON.parse(safe)).toEqual(value);
  });
});

describe('entity share image', () => {
  it('renders Latin, Arabic, punctuation and unsupported input without network font fallback', async () => {
    const originalFetch = globalThis.fetch;
    const externalCalls: string[] = [];
    const guardedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('data:')) return originalFetch(input, init);
      if (/^https?:/i.test(url)) externalCalls.push(url);
      throw new Error(`Unexpected non-local request during share image rendering: ${url}`);
    });
    vi.stubGlobal('fetch', guardedFetch);
    try {
      for (const [locale, title, subject] of [
        ['en', 'Amina Haddad', 'Algebra · Geometry'],
        ['en', 'أمينة حداد', 'الجبر'],
        ['ar', 'أمينة حداد', 'الجبر والهندسة'],
        ['en', 'Unsupported 😀 name', 'CJK 漢字'],
      ] as const) {
        const response = await entityShareImage(locale, title, subject);
        expect(response.headers.get('content-type')).toContain('image/png');
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(view.getUint32(16)).toBe(entityImageSize.width);
        expect(view.getUint32(20)).toBe(entityImageSize.height);
      }
      expect(externalCalls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 30_000);
});
