import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { teacherSeo, groupSeo } = vi.hoisted(() => ({ teacherSeo: vi.fn(), groupSeo: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/seo/public-entity-data', () => ({
  publicTeacherSeo: teacherSeo,
  publicGroupSeo: groupSeo,
}));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: () => true }));

import { generateMetadata as homeMetadata } from '@/app/[locale]/page';
import { generateMetadata as teachersMetadata } from '@/app/[locale]/teachers/page';
import { generateMetadata as helpMetadata } from '@/app/[locale]/help/page';
import { generateMetadata as privacyMetadata } from '@/app/[locale]/privacy/page';
import { generateMetadata as termsMetadata } from '@/app/[locale]/terms/page';
import { generateMetadata as teacherMetadata } from '@/app/[locale]/teachers/[id]/page';
import { generateMetadata as groupMetadata } from '@/app/[locale]/groups/[id]/page';

const teacherId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const groupId = 'fedcbafe-dcba-4fed-8cba-fedcbafedcba';
const origin = 'https://darsak.example';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin);
  teacherSeo.mockResolvedValue({
    kind: 'found',
    data: { id: teacherId, name: 'Nadia Teacher', headline: 'Math tutor', subjects: ['Math'] },
  });
  groupSeo.mockResolvedValue({
    kind: 'found',
    data: {
      id: groupId,
      name: 'Algebra basics',
      description: 'A clear description supplied by the group.',
      subject: 'Mathematics',
      teacher: { id: teacherId, name: 'Nadia Teacher' },
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

function assertPublicMetadata(
  meta: Awaited<ReturnType<typeof homeMetadata>>,
  locale: 'ar' | 'en',
  path: string,
  imageUrl = `${origin}/${locale}/opengraph-image`,
) {
  const canonical = `${origin}/${locale}${path}`;
  const alternates = meta.alternates?.languages as Record<string, string>;
  expect(meta.title).toBeTruthy();
  expect(meta.description).toBeTruthy();
  expect(meta.alternates?.canonical).toBe(canonical);
  expect(alternates).toEqual({ ar: `${origin}/ar${path}`, en: `${origin}/en${path}` });
  expect(meta.robots).toBeUndefined();
  expect(meta.openGraph).toMatchObject({
    title: meta.title,
    description: meta.description,
    url: canonical,
    locale: locale === 'ar' ? 'ar_EG' : 'en_US',
    alternateLocale: locale === 'ar' ? 'en_US' : 'ar_EG',
    type: 'website',
    siteName: locale === 'ar' ? 'درسك' : 'DarSak',
  });
  expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: imageUrl })]);
  expect(meta.twitter).toMatchObject({
    card: 'summary_large_image',
    title: meta.title,
    description: meta.description,
    images: [imageUrl],
  });
}

describe('actual public route metadata exports', () => {
  it.each(['ar', 'en'] as const)(
    'returns distinct localized metadata for static public routes in %s',
    async locale => {
      const routes = [
        ['', homeMetadata],
        ['/teachers', teachersMetadata],
        ['/help', helpMetadata],
        ['/privacy', privacyMetadata],
        ['/terms', termsMetadata],
      ] as const;
      const results = await Promise.all(
        routes.map(
          async ([path, generateMetadata]) =>
            [path, await generateMetadata({ params: Promise.resolve({ locale }) })] as const,
        ),
      );
      for (const [path, metadata] of results) assertPublicMetadata(metadata, locale, path);
      expect(new Set(results.map(([, metadata]) => metadata.title)).size).toBe(routes.length);
      expect(new Set(results.map(([, metadata]) => metadata.description)).size).toBe(routes.length);
    },
  );

  it.each(['ar', 'en'] as const)(
    'uses normalized public IDs and entity metadata in %s',
    async locale => {
      const teacher = await teacherMetadata({
        params: Promise.resolve({ locale, id: teacherId.toUpperCase() }),
      });
      assertPublicMetadata(
        teacher,
        locale,
        `/teachers/${teacherId}`,
        `${origin}/${locale}/teachers/${teacherId}/opengraph-image`,
      );
      expect(teacher.alternates?.canonical).not.toBe(
        `${origin}/${locale}/teachers/${teacherId.toUpperCase()}`,
      );
      expect(teacher.title).toContain('Nadia Teacher');
      expect(teacher.openGraph?.images).toEqual([
        expect.objectContaining({
          url: `${origin}/${locale}/teachers/${teacherId}/opengraph-image`,
        }),
      ]);
      expect(teacher.twitter?.images).toEqual([
        `${origin}/${locale}/teachers/${teacherId}/opengraph-image`,
      ]);

      const group = await groupMetadata({
        params: Promise.resolve({ locale, id: groupId.toUpperCase() }),
      });
      assertPublicMetadata(
        group,
        locale,
        `/groups/${groupId}`,
        `${origin}/${locale}/groups/${groupId}/opengraph-image`,
      );
      expect(group.alternates?.canonical).not.toBe(
        `${origin}/${locale}/groups/${groupId.toUpperCase()}`,
      );
      expect(group.description).toBe('A clear description supplied by the group.');
      expect(group.title).toContain('Algebra basics');
      expect(group.openGraph?.images).toEqual([
        expect.objectContaining({ url: `${origin}/${locale}/groups/${groupId}/opengraph-image` }),
      ]);
      expect(group.twitter?.images).toEqual([
        `${origin}/${locale}/groups/${groupId}/opengraph-image`,
      ]);
    },
  );

  it.each(['ar', 'en'] as const)(
    'uses localized fallback copy for sparse entities in %s',
    async locale => {
      teacherSeo.mockResolvedValueOnce({
        kind: 'found',
        data: { id: teacherId, name: 'Nadia Teacher', headline: null, subjects: [] },
      });
      groupSeo.mockResolvedValueOnce({
        kind: 'found',
        data: {
          id: groupId,
          name: 'Algebra basics',
          description: null,
          subject: 'Mathematics',
          teacher: { id: teacherId, name: 'Nadia Teacher' },
        },
      });
      const teacher = await teacherMetadata({ params: Promise.resolve({ locale, id: teacherId }) });
      const group = await groupMetadata({ params: Promise.resolve({ locale, id: groupId }) });
      expect(teacher.title).toBe(`Nadia Teacher · ${locale === 'ar' ? 'درسك' : 'DarSak'}`);
      expect(teacher.description).toContain('Nadia Teacher');
      expect(group.description).toContain('Algebra basics');
      assertPublicMetadata(
        teacher,
        locale,
        `/teachers/${teacherId}`,
        `${origin}/${locale}/teachers/${teacherId}/opengraph-image`,
      );
      assertPublicMetadata(
        group,
        locale,
        `/groups/${groupId}`,
        `${origin}/${locale}/groups/${groupId}/opengraph-image`,
      );
    },
  );

  it('keeps unavailable, missing, and invalid entity pages noindex', async () => {
    for (const kind of ['missing', 'unavailable'] as const) {
      teacherSeo.mockResolvedValueOnce({ kind });
      groupSeo.mockResolvedValueOnce({ kind });
      const teacher = await teacherMetadata({
        params: Promise.resolve({ locale: 'en', id: teacherId }),
      });
      const group = await groupMetadata({ params: Promise.resolve({ locale: 'en', id: groupId }) });
      expect(teacher.robots).toEqual({ index: false, follow: false });
      expect(group.robots).toEqual({ index: false, follow: false });
    }
    teacherSeo.mockResolvedValueOnce({ kind: 'missing' });
    groupSeo.mockResolvedValueOnce({ kind: 'missing' });
    const invalidTeacher = await teacherMetadata({
      params: Promise.resolve({ locale: 'en', id: 'invalid' }),
    });
    const invalidGroup = await groupMetadata({
      params: Promise.resolve({ locale: 'en', id: 'invalid' }),
    });
    expect(invalidTeacher.robots).toEqual({ index: false, follow: false });
    expect(invalidGroup.robots).toEqual({ index: false, follow: false });
  });
});
