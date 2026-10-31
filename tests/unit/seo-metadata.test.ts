import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageMetadata, seoAlternates, seoTitle, snippet } from '@/features/seo/metadata';
import { privatePageMetadata } from '@/features/seo/private-page-metadata';

afterEach(() => vi.unstubAllEnvs());

describe('seo metadata helpers', () => {
  it('marks localized authentication and account setup metadata noindex', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak.example');
    for (const locale of ['ar', 'en'] as const) {
      for (const path of [
        '/login',
        '/register',
        '/check-email',
        '/choose-role',
        '/forgot-password',
        '/reset-password',
        '/account/setup',
      ]) {
        const meta = privatePageMetadata(locale, path);
        expect(meta.alternates?.canonical).toBe(`https://darsak.example/${locale}${path}`);
        expect(meta.robots).toEqual({ index: false, follow: false });
      }
    }
  });

  it('builds canonical and hreflang alternates from the site origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak.example/');
    expect(seoAlternates('en', '/teachers')).toEqual({
      canonical: 'https://darsak.example/en/teachers',
      languages: {
        ar: 'https://darsak.example/ar/teachers',
        en: 'https://darsak.example/en/teachers',
      },
    });
    expect(seoAlternates('ar').canonical).toBe('https://darsak.example/ar');
  });

  it('localizes the brand suffix', () => {
    expect(seoTitle('en', 'Find a teacher')).toBe('Find a teacher · DarSak');
    expect(seoTitle('ar', 'ابحث عن معلم')).toBe('ابحث عن معلم · درسك');
  });

  it('adds Open Graph fields and the locale', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darsak.example');
    const meta = pageMetadata({ locale: 'ar', path: '/help', title: 'مساعدة', description: 'د' });
    expect(meta.title).toBe('مساعدة · درسك');
    expect(meta.openGraph).toMatchObject({
      title: 'مساعدة · درسك',
      description: 'د',
      url: 'https://darsak.example/ar/help',
      siteName: 'درسك',
      locale: 'ar_EG',
      type: 'website',
      images: [{ url: 'https://darsak.example/ar/opengraph-image', width: 1200, height: 630 }],
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(meta.robots).toBeUndefined();
  });

  it('can use a full title and mark a page noindex', () => {
    const meta = pageMetadata({
      locale: 'en',
      title: 'DarSak · Hello',
      description: 'd',
      fullTitle: true,
      noIndex: true,
    });
    expect(meta.title).toBe('DarSak · Hello');
    expect(meta.openGraph).toMatchObject({ locale: 'en_US' });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('shortens long text at a word boundary', () => {
    expect(snippet('  a   b \n c ')).toBe('a b c');
    expect(snippet(null)).toBe('');
    const long = `${'word '.repeat(60)}end`;
    const cut = snippet(long, 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/wor…$/);
  });
});
