import { describe, expect, it, vi } from 'vitest';
import {
  groupJsonLd,
  organizationJsonLd,
  safeJsonLd,
  teacherJsonLd,
  websiteJsonLd,
} from '@/features/seo/structured-data';
import { entityShareImage, entityImageSize } from '@/features/seo/share-image';
import { groupFallbackDescription, teacherFallbackDescription } from '@/features/seo/metadata';

const uuid = '5c8f4f26-6d16-4f1f-9c10-df678e321abc';

describe('public entity JSON-LD', () => {
  it('builds bilingual Organization and WebSite data from the public DarSak brand', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak.example');
    for (const [locale, brand] of [
      ['en', 'DarSak'],
      ['ar', 'درسك'],
    ] as const) {
      const organization = organizationJsonLd(locale);
      const website = websiteJsonLd(locale);
      expect(organization).toMatchObject({
        '@type': 'Organization',
        name: brand,
        url: 'https://darsak.example',
        logo: 'https://darsak.example/brand/darsak/english-header-lockup.svg',
      });
      expect(website).toMatchObject({
        '@type': 'WebSite',
        name: brand,
        url: `https://darsak.example/${locale}`,
        inLanguage: locale,
      });
    }
    const serialized = JSON.stringify([
      organizationJsonLd('en'),
      websiteJsonLd('en'),
    ]).toLowerCase();
    expect(serialized).not.toMatch(/email|telephone|address|sameas|review|rating/);
  });

  it('includes names in localized fallback descriptions so sparse entities remain distinct', () => {
    const teacherA = teacherFallbackDescription('en', {
      name: 'Amina Haddad',
      headline: null,
      subjects: [],
    });
    const teacherB = teacherFallbackDescription('en', {
      name: 'Omar Ali',
      headline: null,
      subjects: [],
    });
    const groupA = groupFallbackDescription('ar', {
      name: 'مجموعة النحو',
      subject: 'اللغة العربية',
    });
    const groupB = groupFallbackDescription('ar', {
      name: 'مجموعة البلاغة',
      subject: 'اللغة العربية',
    });
    expect(teacherA).toContain('Amina Haddad');
    expect(teacherA).not.toBe(teacherB);
    expect(groupA).toContain('مجموعة النحو');
    expect(groupA).not.toBe(groupB);
  });

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

  it('adds a Service aggregate only for a visible offering and the displayed thresholded summary', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak.example');
    const teacher = { id: uuid, name: 'Amina', headline: null, subjects: [] };
    const graph = teacherJsonLd('en', teacher, {
      subject: 'Algebra',
      description: 'Weekly algebra practice.',
      average: 4.04,
      count: 4,
    });
    expect(graph).toMatchObject({
      '@graph': [
        { '@type': 'Person', '@id': `https://darsak.example/en/teachers/${uuid}#teacher` },
        {
          '@type': 'Service',
          '@id': `https://darsak.example/en/teachers/${uuid}#teaching-service`,
          name: 'Teaching with Amina',
          description: 'Algebra: Weekly algebra practice.',
          provider: { '@id': `https://darsak.example/en/teachers/${uuid}#teacher` },
          aggregateRating: { ratingValue: 4, reviewCount: 4, bestRating: 5, worstRating: 1 },
        },
      ],
    });
    expect(
      teacherJsonLd('en', teacher, { subject: '', description: 'Text', average: 4, count: 4 }),
    ).toMatchObject({ '@type': 'Person' });
    expect(
      teacherJsonLd('ar', teacher, {
        subject: 'الجبر',
        description: 'تدريب أسبوعي',
        average: 4.6,
        count: 2,
      }),
    ).toMatchObject({ '@type': 'Person' });
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
