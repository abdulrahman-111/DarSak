import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel } from '@/components/platform/ui';
import { TeacherAvatarImage } from '@/features/teacher/profile-avatar-image';
import { publicTeacherDetail } from '@/features/teacher/profile-data';
import { publicTeacherContactLinks } from '@/features/teacher/profile-domain';
import { idSchema } from '@/features/student/domain';
import { ensureLocale } from '@/i18n/config';

export default async function PublicTeacherPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  if (!idSchema.safeParse(id).success) notFound();
  const data = await publicTeacherDetail(locale, id);
  if (data.error) return <section className="container py-12"><Panel><p role="alert" className="text-sm text-red-800">{data.error}</p></Panel></section>;
  if (!data.teacher) notFound();

  const links = publicTeacherContactLinks(data.contacts ?? {});
  return <div className="min-h-[70vh] bg-[#f6f0e4]">
    <section className="container py-10 md:py-16">
      <Link href={`/${locale}/teachers`} className="mb-7 inline-flex font-bold text-orange">{ar ? 'العودة إلى اكتشف' : 'Back to discover'}</Link>
      <article className="mx-auto max-w-4xl rounded-[1.4rem] border border-[#e3d9c8] bg-[#fffdf8] p-5 shadow-[0_12px_35px_rgba(6,59,59,.05)] md:p-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <TeacherAvatarImage src={data.avatarUrl} name={data.teacher.full_name} size="size-32"/>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{ar ? 'ملف المعلم' : 'Teacher profile'}</p>
            <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-teal md:text-4xl">{data.teacher.full_name}</h1>
            {data.teacher.headline && <p className="mt-2 text-lg text-muted">{data.teacher.headline}</p>}
          </div>
        </div>

        <section className="mt-8 border-t border-[#efe6d6] pt-7">
          <h2 className="text-xl font-black text-teal">{ar ? 'نبذة' : 'About'}</h2>
          {data.teacher.bio ? <p className="mt-3 whitespace-pre-wrap leading-8 text-[#4d473f]">{data.teacher.bio}</p> : <p className="mt-3 text-muted">{ar ? 'لم يضف المعلم نبذة بعد.' : 'This teacher has not added a bio yet.'}</p>}
        </section>

        <section className="mt-8 border-t border-[#efe6d6] pt-7">
          <h2 className="text-xl font-black text-teal">{ar ? 'المواد والسياقات' : 'Subjects and contexts'}</h2>
          {data.specializations.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.specializations.map(item => <li key={item.id} className="rounded-xl bg-[#f6f0e4] p-4">
              <span className="block font-bold text-teal">{item.subject}</span>
              <span className="mt-1 block text-sm text-muted">{item.context}</span>
            </li>)}
          </ul> : <p className="mt-3 text-muted">{ar ? 'لم يضف المعلم تخصصات بعد.' : 'No specializations have been added yet.'}</p>}
        </section>

        {(links.phone || links.whatsapp || links.email) && <section className="mt-8 border-t border-[#efe6d6] pt-7">
          <h2 className="text-xl font-black text-teal">{ar ? 'تواصل مع المعلم' : 'Contact this teacher'}</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {links.phone && <a href={links.phone} dir="ltr" className="rounded-xl border border-line px-4 py-2.5 font-bold text-teal">{ar ? 'اتصال' : 'Call'}</a>}
            {links.whatsapp && <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" dir="ltr" className="rounded-xl border border-line px-4 py-2.5 font-bold text-teal">WhatsApp</a>}
            {links.email && <a href={links.email} dir="ltr" className="rounded-xl border border-line px-4 py-2.5 font-bold text-teal">{ar ? 'بريد إلكتروني' : 'Email'}</a>}
          </div>
        </section>}
      </article>
    </section>
  </div>;
}
