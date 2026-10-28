import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Panel } from '@/components/platform/ui';
import { TeacherProfile } from '@/components/public/teacher-profile';
import { publicTeacherDetail } from '@/features/teacher/profile-data';
import { idSchema } from '@/features/student/domain';
import { ensureLocale } from '@/i18n/config';
import Link from 'next/link';
import { pageMetadata, snippet } from '@/features/seo/metadata';

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
  if (!idSchema.safeParse(id).success) return fallback;
  const data = await publicTeacherDetail(locale, id);
  const view = data.visitor;
  if (data.error || !view) return fallback;
  const { full_name: name, headline } = view.teacher;
  const subjects = [...new Set(view.specializations.map(item => item.subject))].slice(0, 4);
  const taught = subjects.join(ar ? '، ' : ', ');
  const description = snippet(
    [
      headline,
      taught &&
        (ar
          ? `يدرّس ${taught} على درسك. تصفّح مجموعاته واطلب مقعدًا.`
          : `Teaches ${taught} on DarSak. Browse their groups and request a seat.`),
    ]
      .filter(Boolean)
      .join(' · ') ||
      (ar
        ? 'اطلع على ملف المعلم ومجموعاته على درسك.'
        : 'View this teacher’s profile and groups on DarSak.'),
  );
  return pageMetadata({
    locale,
    path: `/teachers/${id}`,
    title: headline ? `${name} — ${headline}` : name,
    description,
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
  const data = await publicTeacherDetail(locale, id);
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
    <TeacherProfile
      view={data.visitor}
      locale={locale}
      backLabel={ar ? 'العودة إلى اكتشف' : 'Back to discover'}
    />
  );
}
