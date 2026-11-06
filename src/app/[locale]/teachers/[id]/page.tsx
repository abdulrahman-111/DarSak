import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Panel } from '@/components/platform/ui';
import { TeacherProfile } from '@/components/public/teacher-profile';
import { publicTeacherDetail } from '@/features/teacher/profile-data';
import { idSchema } from '@/features/student/domain';
import { ensureLocale } from '@/i18n/config';
import Link from 'next/link';
import { pageMetadata, snippet, teacherFallbackDescription } from '@/features/seo/metadata';
import { publicTeacherSeo } from '@/features/seo/public-entity-data';
import { safeJsonLd, teacherJsonLd } from '@/features/seo/structured-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const fallback = pageMetadata({
    locale,
    path: `/teachers/${id}`,
    title: ar ? 'ملف المعلم' : 'Teacher profile',
    description: ar
      ? 'اطلع على ملف المعلم ومجموعاته على درسك.'
      : 'View this teacher’s profile and groups on DarSak.',
    noIndex: true,
  });
  const result = await publicTeacherSeo(locale, id);
  if (result.kind !== 'found') return fallback;
  const { id: canonicalId, name, headline, subjects } = result.data;
  const description = snippet(teacherFallbackDescription(locale, { name, headline, subjects }));
  return pageMetadata({
    locale,
    path: `/teachers/${canonicalId}`,
    title: headline ? `${name} — ${headline}` : name,
    description,
    imagePath: `/teachers/${canonicalId}/opengraph-image`,
  });
}

export default async function PublicTeacherPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  if (!idSchema.safeParse(id).success) notFound();
  const [seo, data] = await Promise.all([
    publicTeacherSeo(locale, id),
    publicTeacherDetail(locale, id),
  ]);
  if (data.error)
    return (
      <section className="container py-12">
        <Panel>
          <p role="alert" className="text-sm text-danger">
            {data.error}
          </p>
          <Link
            href={`/${locale}/teachers/${id}?retry=1`}
            className="mt-3 inline-flex font-bold text-orange underline"
          >
            {ar ? 'إعادة المحاولة' : 'Try again'}
          </Link>
        </Panel>
      </section>
    );
  if (!data.visitor) notFound();

  return (
    <>
      {seo.kind === 'found' && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(teacherJsonLd(locale, seo.data)) }}
        />
      )}
      <TeacherProfile
        view={data.visitor}
        locale={locale}
        backLabel={ar ? 'العودة إلى اكتشف' : 'Back to discover'}
      />
    </>
  );
}
