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

  const displayedRating = data.visitor.teacher.teacher_rating_average;
  const displayedCount = data.visitor.teacher.teacher_rating_count;
  const ratingVisible =
    Number.isFinite(displayedRating) &&
    (displayedRating as number) >= 1 &&
    (displayedRating as number) <= 5 &&
    Number.isSafeInteger(displayedCount) &&
    (displayedCount as number) >= 3;
  const serviceGroup = data.visitor.groups.find(group => {
    const subject = ar
      ? group.offering?.subject?.name_ar || group.offering?.subject?.name_en
      : group.offering?.subject?.name_en || group.offering?.subject?.name_ar;
    return !!subject?.trim() && !!group.description?.trim();
  });
  const serviceSubject = serviceGroup
    ? ar
      ? serviceGroup.offering?.subject?.name_ar || serviceGroup.offering?.subject?.name_en
      : serviceGroup.offering?.subject?.name_en || serviceGroup.offering?.subject?.name_ar
    : null;
  const teacherJson = teacherJsonLd(
    locale,
    seo.kind === 'found'
      ? seo.data
      : {
          id: data.visitor.teacher.id,
          name: data.visitor.teacher.full_name,
          headline: data.visitor.teacher.headline,
          subjects: data.visitor.specializations.map(item => item.subject).slice(0, 8),
        },
    ratingVisible && serviceGroup && serviceSubject
      ? {
          subject: serviceSubject,
          description: serviceGroup.description,
          average: displayedRating as number,
          count: displayedCount as number,
        }
      : undefined,
  );

  return (
    <>
      {(seo.kind === 'found' || data.visitor) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(teacherJson) }}
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
