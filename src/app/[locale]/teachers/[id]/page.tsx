import { notFound } from 'next/navigation';
import { Panel } from '@/components/platform/ui';
import { TeacherProfile } from '@/components/public/teacher-profile';
import { publicTeacherDetail } from '@/features/teacher/profile-data';
import { idSchema } from '@/features/student/domain';
import { ensureLocale } from '@/i18n/config';
import Link from 'next/link';

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
