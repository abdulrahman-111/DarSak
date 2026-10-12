import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, MapPin, UserRound, Users } from 'lucide-react';
import { getDictionary } from '@/i18n/config';
import { currentUser } from '@/features/platform/data';
import { publicCopy } from '@/components/public/copy';
import { isConfigured } from '@/lib/supabase/server';
import { classDetail, enrollmentForGroup } from '@/features/student/data';
import { canRequest } from '@/features/student/domain';
import { EnrollmentForm } from '@/features/student/forms';
import { canSharePublicGroup } from '@/features/student/share-domain';
import { PublicGroupShare } from '@/features/student/public-group-share';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';

const weekdays = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

export default async function GroupDetail({ params }: { params: Promise<{ locale: 'ar' | 'en'; id: string }> }) {
  const { locale, id } = await params;
  if (!isConfigured()) notFound();

  const t = await getDictionary(locale);
  const c = publicCopy[locale];
  const detail = await classDetail(id);
  if (!detail || detail.group.status !== 'published') notFound();
  const data = detail.group;

  const me = await currentUser();
  const enrollment = me?.profile?.role === 'student' ? await enrollmentForGroup(id) : null;
  const BackArrow = locale === 'ar' ? ArrowRight : ArrowLeft;
  const subject = data.offering?.subject ? catalogueDisplayName(data.offering.subject, locale) || t.groups : t.groups;
  const nextLesson = data.next_lesson_at
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(data.next_lesson_at))
    : null;
  const isStudent = me?.profile?.role === 'student' && me.profile.status === 'active';
  const canEnroll = canRequest(enrollment?.status) && data.available_seats !== 0;

  return (
    <div className="min-h-[72vh] bg-[#f6f0e4]">
      <section className="container py-10 md:py-16">
        <Link className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-orange" href={`/${locale}/teachers`}><BackArrow size={17}/>{c.back}</Link>
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <article className="rounded-[1.4rem] border border-[#e3d9c8] bg-[#fffdf8] p-6 md:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-[#d5ebe6] px-3 py-1.5 text-sm font-bold text-teal">{subject}</span>
              <span className="rounded-full bg-[#dfedd5] px-3 py-1.5 text-xs font-bold text-[#2c5620]">{c.published}</span>
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[.14em] text-orange">{c.detailEyebrow}</p>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-.03em] text-teal md:text-5xl">{data.name}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#4d473f]">{data.description || c.detailIntro}</p>

            <div className="mt-6 rounded-xl bg-[#f6f0e4] p-4" aria-label={c.nextLesson}>
              <p className="flex items-center gap-2 text-sm font-bold text-teal"><CalendarDays size={17}/>{c.nextLesson}</p>
              <p className="mt-2 text-sm text-muted">{nextLesson || c.noNextLesson}</p>
            </div>

            {canSharePublicGroup(detail.publiclyEligible, data.status) && <PublicGroupShare locale={locale} groupId={data.id}/>}

            {detail.teacher && <div className="mt-7 flex items-center gap-3 rounded-xl border border-[#e3d9c8] p-4"><span className="grid size-11 place-items-center rounded-xl bg-teal text-white"><UserRound size={20}/></span><div><p className="text-sm text-muted">{locale === 'ar' ? 'المدرس' : 'Teacher'}</p><Link href={`/${locale}/teachers/${detail.teacher.id}`} className="font-bold text-teal underline decoration-teal/30 underline-offset-2">{detail.teacher.full_name}</Link>{detail.teacher.headline && <p className="text-sm text-muted">{detail.teacher.headline}</p>}</div></div>}

            <div className="mt-9 border-t border-[#efe6d6] pt-7">
              <h2 className="text-xl font-bold text-teal">{c.arrangement}</h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-[#f6f0e4] p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted"><BookOpen size={16}/>{c.subject}</dt>
                  <dd className="mt-2 font-bold text-ink">{subject}</dd>
                </div>
                <div className="rounded-xl bg-[#f6f0e4] p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted"><MapPin size={16}/>{c.location}</dt>
                  <dd className="mt-2 font-bold text-ink">{data.location || c.unknownLocation}</dd>
                </div>
                <div className="rounded-xl bg-[#f6f0e4] p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted"><Users size={16}/>{c.capacity}</dt>
                  <dd className="mt-2 font-bold text-ink">{data.capacity}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-8 border-t border-[#efe6d6] pt-7">
              <h2 className="flex items-center gap-2 text-xl font-bold text-teal"><CalendarDays size={20}/>{locale === 'ar' ? 'المواعيد الأسبوعية' : 'Weekly schedule'}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {detail.slots.length ? detail.slots.map(slot => <div key={slot.id} className="rounded-xl bg-[#f6f0e4] p-4"><p className="font-bold text-teal">{weekdays[locale][slot.weekday]}</p><p className="mt-1 text-sm text-muted">{slot.start_time.slice(0,5)}–{slot.end_time.slice(0,5)} · {locale === 'ar' ? 'توقيت القاهرة' : 'Cairo time'}</p></div>) : <p className="text-sm text-muted">{locale === 'ar' ? 'سيعلن المدرس المواعيد قريبًا.' : 'The teacher will publish the schedule soon.'}</p>}
              </div>
            </div>
          </article>

          <aside className="h-fit rounded-[1.4rem] bg-teal p-6 text-cream lg:sticky lg:top-24">
            <h2 className="text-2xl font-black">{c.requestTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-[#cfe3de]">{c.requestBody}</p>
            <div className="mt-6 [&_button]:w-full [&_button]:bg-orange [&_button]:text-white">
              {isStudent && enrollment?.status === 'pending' ? (
                <><p className="mb-3 rounded-xl bg-white/10 p-3 text-sm">{c.pendingEnrollment}</p><EnrollmentForm locale={locale} id={enrollment.id} kind="cancel"/></>
              ) : isStudent && enrollment?.status === 'accepted' ? (
                <><p className="mb-3 rounded-xl bg-white/10 p-3 text-sm">{c.acceptedEnrollment}</p><EnrollmentForm locale={locale} id={enrollment.id} kind="cancel"/></>
              ) : isStudent && canEnroll ? (
                <>
                  {enrollment?.status === 'rejected' && <p className="mb-3 rounded-xl bg-white/10 p-3 text-sm">{c.retryEnrollment}</p>}
                  {enrollment?.status === 'cancelled' && <p className="mb-3 rounded-xl bg-white/10 p-3 text-sm">{c.cancelledEnrollment}</p>}
                  <EnrollmentForm locale={locale} id={id} kind="request"/>
                </>
              ) : isStudent && data.available_seats === 0 ? (
                <p role="status" className="rounded-xl bg-white/10 p-3 text-sm">{c.fullEnrollment}</p>
              ) : !isStudent ? (
                me ? <p className="rounded-xl bg-white/10 p-3 text-sm">{c.studentOnlyEnrollment}</p> : (
                  <Link className="block rounded-xl bg-cream px-5 py-3 text-center font-bold text-teal transition hover:bg-white" href={`/${locale}/login?next=/${locale}/groups/${id}`}>{c.signInToRequest}</Link>
                )
              ) : (
                <p className="rounded-xl bg-white/10 p-3 text-sm">{c.studentOnlyEnrollment}</p>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
