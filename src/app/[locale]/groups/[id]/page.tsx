import { groupLearningDetails } from '@/features/teacher/group-learning-data';
import { GroupLearningView } from '@/features/teacher/group-learning-view';
import { GroupFeedbackSection } from '@/features/feedback/group-section';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GroupRequestBar } from '@/features/groups/request-bar';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  MapPin,
  UserRound,
  Users,
} from 'lucide-react';
import { getDictionary } from '@/i18n/config';
import { pageMetadata, snippet } from '@/features/seo/metadata';
import { publicGroupDetail } from '@/features/platform/data';
import { publicCopy } from '@/components/public/copy';
import { isConfigured } from '@/lib/supabase/server';
import { classDetail, enrollmentForGroup } from '@/features/student/data';
import { canRequest, idSchema } from '@/features/student/domain';
import { EnrollmentForm } from '@/features/student/forms';
import { WaitlistJoinForm, WaitlistWithdrawForm } from '@/features/student/waitlist-forms';
import { canSharePublicGroup } from '@/features/student/share-domain';
import { PublicGroupShare } from '@/features/student/public-group-share';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';
import { SavedGroupForm } from '@/features/student/saved-form';
import { savedGroupStatus } from '@/features/student/saved-data';
import { StudentOverlapWarning } from '@/features/student/overlap-warning';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { groupAnnouncement } from '@/features/groups/announcement-data';
import { AnnouncementView } from '@/features/groups/announcement-view';
import { summarizeSchedule } from '@/features/groups/schedule-summary';
export const maxDuration = 40;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: 'ar' | 'en'; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const ar = locale === 'ar';
  const fallback = pageMetadata({
    locale,
    path: `/groups/${id}`,
    title: ar ? 'تفاصيل المجموعة' : 'Group details',
    description: ar
      ? 'تفاصيل المجموعة ومواعيدها على درسك.'
      : 'Group details and schedule on DarSak.',
    noIndex: true,
  });
  if (!isConfigured() || !idSchema.safeParse(id).success) return fallback;
  // Same memoized public lookup the page uses for the group, so no extra fetch.
  const { data: group, error } = await publicGroupDetail(id);
  if (error || !group || group.status !== 'published') return fallback;
  const subject = group.offering?.subject
    ? catalogueDisplayName(group.offering.subject, locale)
    : '';
  const teacher = group.teacher?.full_name ?? '';
  const generated = ar
    ? `مجموعة${subject ? ` ${subject}` : ''}${teacher ? ` مع ${teacher}` : ''}${group.location ? ` — ${group.location}` : ''} على درسك.`
    : `${subject ? `${subject} group` : 'Group'}${teacher ? ` with ${teacher}` : ''}${group.location ? ` — ${group.location}` : ''} on DarSak.`;
  return pageMetadata({
    locale,
    path: `/groups/${id}`,
    title: subject ? `${group.name} — ${subject}` : group.name,
    description: snippet(group.description) || generated,
  });
}

export default async function GroupDetail({
  params,
  searchParams,
}: {
  searchParams?: Promise<{ feedback?: string }>;
  params: Promise<{ locale: 'ar' | 'en'; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isConfigured()) notFound();

  const query = await searchParams;
  const requestedOffset = Number(query?.feedback);
  const feedbackOffset =
    Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const t = await getDictionary(locale);
  const c = publicCopy[locale];
  const detail = await classDetail(id);
  const requestViewer = await getRequestViewer();
  const activeViewer = !!requestViewer.user && requestViewer.profile?.status === 'active';
  if (!detail || detail.group.status !== 'published') notFound();
  const data = detail.group;

  const me = requestViewer.user
    ? { user: requestViewer.user, profile: requestViewer.profile }
    : null;
  const [announcement, enrollment, saved, learning, waitlistEntry] = await Promise.all([
    activeViewer ? groupAnnouncement(requestViewer.db, id) : Promise.resolve(null),
    me?.profile?.role === 'student' ? enrollmentForGroup(id) : Promise.resolve(null),
    activeViewer && me?.profile?.role === 'student' ? savedGroupStatus(id) : Promise.resolve(false),
    groupLearningDetails(requestViewer.db, id),
    me?.profile?.role === 'student'
      ? requestViewer.db
          .from('waitlist_entries')
          .select('id,status')
          .eq('group_id', id)
          .eq('student_id', requestViewer.user!.id)
          .maybeSingle()
          .then(result => result.data as { id: string; status: string } | null)
      : Promise.resolve(null),
  ]);
  const BackArrow = locale === 'ar' ? ArrowRight : ArrowLeft;
  const subject = data.offering?.subject
    ? catalogueDisplayName(data.offering.subject, locale) || t.groups
    : t.groups;
  const nextLesson = data.next_lesson_at
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }).format(new Date(data.next_lesson_at))
    : null;
  const isStudent = me?.profile?.role === 'student' && me.profile.status === 'active';
  const canEnroll =
    detail.publiclyEligible && canRequest(enrollment?.status) && data.available_seats !== 0;
  // Phones only: keep the next step reachable when it is an actual action (guest sign-in, or a request the student can make).
  const canJoinWaitlist =
    isStudent &&
    canRequest(enrollment?.status) &&
    detail.publiclyEligible &&
    data.available_seats === 0 &&
    waitlistEntry?.status !== 'waiting';
  const showRequestBar =
    !me || (isStudent && (canEnroll || canJoinWaitlist) && waitlistEntry?.status !== 'waiting');

  return (
    <div className="min-h-[72vh] bg-cream">
      <section className="container py-10 md:py-16">
        <Link
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-orange"
          href={`/${locale}/teachers`}
        >
          <BackArrow size={17} />
          {c.back}
        </Link>
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <article className="min-w-0 rounded-[1.4rem] border border-line bg-surface p-6 md:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-mint px-3 py-1.5 text-sm font-bold text-teal">
                {subject}
              </span>
              <span className="rounded-full bg-[#dfedd5] px-3 py-1.5 text-xs font-bold text-[#2c5620]">
                {c.published}
              </span>
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[.14em] text-orange">
              {c.detailEyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-.03em] text-teal md:text-5xl">
              {data.name}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-ink-soft">
              {data.description || c.detailIntro}
            </p>
            <p className="mt-4 rounded-xl border border-line p-4 text-sm text-muted">
              {enrollment?.status === 'accepted' ? (
                <Link
                  href={`/${locale}/student/classes/${id}?view=teacher#teacher-contact`}
                  className="inline-flex min-h-11 items-center font-bold text-teal underline"
                >
                  {locale === 'ar'
                    ? 'عرض بيانات التواصل مع المعلم'
                    : 'View teacher contact details'}
                </Link>
              ) : locale === 'ar' ? (
                'تظهر بيانات التواصل مع المعلم بعد قبول طلب انضمامك إلى إحدى مجموعاته.'
              ) : (
                'Teacher contact details become available after your enrollment in one of their groups is accepted.'
              )}
            </p>
            {learning.error ? (
              <p role="alert" className="mt-4 text-sm text-danger">
                {locale === 'ar'
                  ? 'تعذر تحميل تفاصيل التعلم. حدّث الصفحة وحاول مجددًا.'
                  : 'Could not load learning details. Refresh and try again.'}
              </p>
            ) : (
              <GroupLearningView locale={locale} details={learning.data} />
            )}
            {activeViewer && (
              <AnnouncementView locale={locale} announcement={announcement} className="mt-6" />
            )}

            <div className="mt-6 rounded-xl bg-cream p-4" aria-label={c.nextLesson}>
              <p className="flex items-center gap-2 text-sm font-bold text-teal">
                <Image
                  aria-hidden="true"
                  src="/brand/darsak/next-session-time.svg"
                  alt=""
                  width={16}
                  height={16}
                />
                {c.nextLesson}
              </p>
              <p className="mt-2 text-sm text-muted">{nextLesson || c.noNextLesson}</p>
            </div>

            {canSharePublicGroup(detail.publiclyEligible, data.status) && (
              <PublicGroupShare locale={locale} groupId={data.id} />
            )}

            {detail.teacher && (
              <div className="mt-7 flex items-center gap-3 rounded-xl border border-line p-4">
                <span className="grid size-11 place-items-center rounded-xl bg-teal text-white">
                  <UserRound size={20} />
                </span>
                <div>
                  <p className="text-sm text-muted">{locale === 'ar' ? 'المدرس' : 'Teacher'}</p>
                  <Link
                    href={`/${locale}/teachers/${detail.teacher.id}`}
                    className="font-bold text-teal underline decoration-teal/30 underline-offset-2"
                  >
                    {detail.teacher.full_name}
                  </Link>
                  {detail.teacher.headline && (
                    <p className="text-sm text-muted">{detail.teacher.headline}</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-9 border-t border-[#efe6d6] pt-7">
              <h2 className="text-xl font-bold text-teal">{c.arrangement}</h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-cream p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted">
                    <BookOpen size={16} />
                    {c.subject}
                  </dt>
                  <dd className="mt-2 font-bold text-ink">{subject}</dd>
                </div>
                <div className="rounded-xl bg-cream p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted">
                    <MapPin size={16} />
                    {c.location}
                  </dt>
                  <dd className="mt-2 font-bold text-ink">{data.location || c.unknownLocation}</dd>
                </div>
                <div className="rounded-xl bg-cream p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted">
                    <Users size={16} />
                    {c.capacity}
                  </dt>
                  <dd className="mt-2 font-bold text-ink">{data.capacity}</dd>
                </div>
                {data.offering?.node && (
                  <div className="rounded-xl bg-cream p-4">
                    <dt className="flex items-center gap-2 text-sm text-muted">
                      <Image
                        aria-hidden="true"
                        src="/brand/darsak/academic-stage.svg"
                        alt=""
                        width={16}
                        height={16}
                      />
                      {c.context}
                    </dt>
                    <dd className="mt-2 font-bold text-ink">
                      {catalogueDisplayName(data.offering.node, locale)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="mt-8 border-t border-[#efe6d6] pt-7">
              <h2 className="flex items-center gap-2 text-xl font-bold text-teal">
                <CalendarDays size={20} />
                {locale === 'ar' ? 'المواعيد الأسبوعية' : 'Weekly schedule'}
              </h2>
              {detail.slots.length ? (
                <div className="mt-4 grid gap-3">
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {summarizeSchedule(detail.slots, locale).lines.map(line => (
                      <li key={line} className="rounded-xl bg-cream p-4 font-bold text-teal">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted">
                    {summarizeSchedule(detail.slots, locale).countLabel}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  {locale === 'ar'
                    ? 'سيعلن المدرس المواعيد قريبًا.'
                    : 'The teacher will publish the schedule soon.'}
                </p>
              )}
            </div>
            <div id="feedback">
              <GroupFeedbackSection
                db={requestViewer.db}
                locale={locale}
                groupId={id}
                isStudent={isStudent}
                offset={feedbackOffset}
              />
            </div>
          </article>

          <aside
            id="request-panel"
            className="h-fit scroll-mt-24 rounded-[1.4rem] bg-teal p-6 text-cream lg:sticky lg:top-24"
          >
            <h2 className="text-2xl font-black">{c.requestTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-[#cfe3de]">{c.requestBody}</p>
            <ol className="mt-4 grid gap-2 text-sm text-cream">
              {(locale === 'ar'
                ? [
                    'أرسل طلب الانضمام',
                    'ينظر المعلم في طلبك ويقبله',
                    'بعد القبول، تواصل مع المعلم لتأكيد الترتيبات',
                  ]
                : [
                    'Send your request',
                    'Your teacher reviews and accepts it',
                    'After acceptance, contact the teacher to confirm arrangements',
                  ]
              ).map((step, index) => (
                <li key={step} className="flex items-start gap-2 rounded-xl bg-white/10 p-3">
                  <span className="font-bold text-[#8fd1b5]">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {data.available_seats !== undefined && (
              <p className="mt-4 flex items-center gap-2 text-sm font-bold text-cream">
                <span className="grid size-6 place-items-center rounded-full bg-[#8fd1b5]">
                  <Image
                    aria-hidden="true"
                    src="/brand/darsak/available-seats.svg"
                    alt=""
                    width={16}
                    height={16}
                  />
                </span>
                {c.availableSeats}: {data.available_seats}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-3 [&_button]:w-full [&_form_.text-muted]:text-[#cfe3de] [&_form_button[type=button]]:border-cream/50 [&_form_button[type=button]]:text-cream">
              {isStudent && detail.publiclyEligible && (
                <SavedGroupForm locale={locale} groupId={id} saved={saved} />
              )}
              {isStudent && enrollment?.status === 'pending' ? (
                <>
                  <p
                    role="status"
                    className="student-request-confirmation rounded-xl bg-white/10 p-3 text-sm"
                  >
                    {locale === 'ar'
                      ? 'تم إرسال طلبك! سيراجعه معلمك. تابع الطلب في مجموعاتي.'
                      : 'Request sent! Your teacher will review it. Track it in My classes.'}{' '}
                    <Link className="font-bold underline" href={`/${locale}/student/classes`}>
                      {locale === 'ar' ? 'مجموعاتي' : 'My classes'}
                    </Link>
                  </p>
                  <EnrollmentForm locale={locale} id={enrollment.id} kind="cancel" />
                </>
              ) : isStudent && enrollment?.status === 'accepted' ? (
                <>
                  <p className="rounded-xl bg-white/10 p-3 text-sm">{c.acceptedEnrollment}</p>
                  <EnrollmentForm locale={locale} id={enrollment.id} kind="cancel" />
                </>
              ) : isStudent && waitlistEntry?.status === 'waiting' ? (
                <>
                  <p role="status" className="rounded-xl bg-white/10 p-3 text-sm">
                    {locale === 'ar'
                      ? 'أنت في قائمة الانتظار. عند توفر مقعد، قد ينقل المعلم إدخالك إلى طلب انضمام للمراجعة. لا يُحجز مقعد حتى يراجع المعلم الطلب ويقبله.'
                      : 'You are on the waitlist. If a seat opens, the teacher may move your entry to an enrollment request for review. A place is not reserved unless the teacher reviews and accepts it.'}{' '}
                    <Link
                      className="font-bold underline"
                      href={`/${locale}/student/classes#waitlist-history`}
                    >
                      {locale === 'ar' ? 'سجل قائمة الانتظار' : 'Waitlist history'}
                    </Link>
                  </p>
                  <WaitlistWithdrawForm locale={locale} entryId={waitlistEntry.id} />
                </>
              ) : isStudent && canEnroll ? (
                <>
                  {enrollment?.status === 'rejected' && (
                    <p className="rounded-xl bg-white/10 p-3 text-sm">{c.retryEnrollment}</p>
                  )}
                  {enrollment?.status === 'cancelled' && (
                    <p className="rounded-xl bg-white/10 p-3 text-sm">{c.cancelledEnrollment}</p>
                  )}
                  <StudentOverlapWarning locale={locale} groupId={id} />
                  <EnrollmentForm locale={locale} id={id} kind="request" />
                </>
              ) : isStudent && !detail.publiclyEligible ? (
                <p role="status" className="rounded-xl bg-white/10 p-3 text-sm">
                  {c.notPublished}
                </p>
              ) : isStudent && data.available_seats === 0 ? (
                detail.publiclyEligible ? (
                  <WaitlistJoinForm locale={locale} groupId={id} />
                ) : (
                  <p role="status" className="rounded-xl bg-white/10 p-3 text-sm">
                    {c.fullEnrollment}
                  </p>
                )
              ) : !isStudent ? (
                me ? (
                  <p className="rounded-xl bg-white/10 p-3 text-sm">{c.studentOnlyEnrollment}</p>
                ) : (
                  <Link
                    data-request-action
                    className="block rounded-xl bg-cream px-5 py-3 text-center font-bold text-teal transition hover:bg-white"
                    href={`/${locale}/login?next=/${locale}/groups/${id}`}
                  >
                    {c.signInToRequest}
                  </Link>
                )
              ) : (
                <p className="rounded-xl bg-white/10 p-3 text-sm">{c.studentOnlyEnrollment}</p>
              )}
            </div>
          </aside>
        </div>
        {showRequestBar && (
          <>
            <div aria-hidden="true" className="h-20 lg:hidden" />
            <GroupRequestBar
              targetId="request-panel"
              label={
                isStudent
                  ? canJoinWaitlist
                    ? locale === 'ar'
                      ? 'انضم إلى قائمة الانتظار'
                      : 'Join waitlist'
                    : locale === 'ar'
                      ? 'اطلب الانضمام'
                      : 'Request a place'
                  : c.signInToRequest
              }
              detail={
                data.available_seats !== undefined && data.available_seats !== null
                  ? `${c.availableSeats}: ${data.available_seats}`
                  : undefined
              }
            />
          </>
        )}
      </section>
    </div>
  );
}
