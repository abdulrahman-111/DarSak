import Link from 'next/link';
import { ArrowUpRight, BookOpen, Clock3 } from 'lucide-react';
import { ensureLocale } from '@/i18n/config';
import { studentClasses, studentWaitlist } from '@/features/student/data';
import { EnrollmentForm } from '@/features/student/forms';
import { WaitlistWithdrawForm } from '@/features/student/waitlist-forms';
import { EnrollmentProgress } from '@/features/student/enrollment-progress';
import { Status } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import {
  ClassMark,
  StudentEmpty,
  StudentHeading,
  studentCard,
} from '@/features/student/workspace-ui';
export default async function StudentClasses({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; waitlist_page?: string; cancelled?: string }>;
}) {
  const { locale: raw } = await params,
    locale = ensureLocale(raw),
    ar = locale === 'ar',
    search = await searchParams,
    [data, waitlist] = await Promise.all([
      studentClasses(locale, search?.page),
      studentWaitlist(locale, search?.waitlist_page),
    ]);
  const accepted = data.enrollments.filter(e => e.status === 'accepted'),
    requests = data.enrollments.filter(e => e.status !== 'accepted');
  const labels = ar
    ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
    : { previous: 'Previous', next: 'Next', page: 'Page' };
  return (
    <div className="screen-enter">
      <StudentHeading
        eyebrow={ar ? 'مساحتك التعليمية' : 'Your learning space'}
        title={ar ? 'مجموعاتي' : 'My classes'}
        description={
          ar
            ? 'ادخل إلى مجموعتك لمتابعة الحصص والمواد والتواصل مع معلمك.'
            : 'Open a class to find your lessons, materials and teacher contact in one place.'
        }
        action={
          <Link
            href={`/${locale}/teachers`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-teal transition-colors hover:border-teal/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
          >
            {ar ? 'اكتشف مجموعة' : 'Find a class'}
            <ArrowUpRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
          </Link>
        }
      />
      {search?.cancelled === '1' && (
        <p role="status" className="mb-5 rounded-xl bg-teal/5 p-4 text-sm text-teal">
          {ar
            ? 'تم إلغاء التسجيل. يمكنك طلب الانضمام مجددًا لاحقًا.'
            : 'Enrollment cancelled. You can request to join again later.'}
        </p>
      )}
      {data.error ? (
        <>
          <section className={studentCard}>
            <p role="alert" className="text-sm text-danger">
              {ar
                ? 'تعذر تحميل مجموعاتك. حدّث الصفحة للمحاولة مجددًا.'
                : 'Could not load your classes. Refresh to try again.'}
            </p>
          </section>
          <section id="waitlist-history" className="mt-10 scroll-mt-8">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-teal">
              <Clock3 size={18} />
              {ar ? 'سجل قائمة الانتظار' : 'Waitlist history'}
            </h2>
            {waitlist.error ? (
              <p role="alert" className={studentCard}>
                {ar
                  ? 'تعذّر تحميل سجل قائمة الانتظار. حدّث الصفحة للمحاولة مجددًا.'
                  : 'Could not load waitlist history. Refresh to try again.'}
              </p>
            ) : (
              <>
                {waitlist.rows.length ? (
                  <div className="grid gap-3">
                    {waitlist.rows.map(entry => {
                      const label = ar
                        ? (
                            {
                              waiting: 'في قائمة الانتظار',
                              promoted: 'نُقل إلى طلب انضمام',
                              withdrawn: 'تم الانسحاب من القائمة',
                              closed: 'أُغلقت القائمة',
                            } as Record<string, string>
                          )[entry.status]
                        : (
                            {
                              waiting: 'Waiting',
                              promoted: 'Moved to enrollment request',
                              withdrawn: 'Withdrawn',
                              closed: 'Closed',
                            } as Record<string, string>
                          )[entry.status];
                      return (
                        <article key={entry.id} className={studentCard}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="wrap-break-word font-bold text-teal">
                                {entry.group_name || (ar ? 'مجموعة تعليمية' : 'Learning group')}
                              </h3>
                              <p className="mt-1 text-sm text-muted">
                                {entry.teacher_name ||
                                  (ar ? 'المعلم غير متاح' : 'Teacher unavailable')}
                              </p>
                            </div>
                            <span className="rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-teal">
                              {label}
                            </span>
                          </div>
                          {entry.status === 'waiting' && (
                            <div className="mt-3">
                              <p className="mb-3 text-sm text-muted">
                                {ar
                                  ? 'لا يُحجز مقعد حتى يراجع المعلم طلب الانضمام ويقبله.'
                                  : 'A place is not reserved unless the teacher reviews and accepts an enrollment request.'}
                              </p>
                              <WaitlistWithdrawForm locale={locale} entryId={entry.id} />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className={studentCard}>
                    {ar ? 'لا توجد إدخالات في قائمة الانتظار.' : 'You have no waitlist entries.'}
                  </p>
                )}
                <StudentPagination
                  locale={locale}
                  href={`/${locale}/student/classes`}
                  page={waitlist.page}
                  pageCount={waitlist.pageCount}
                  pageParam="waitlist_page"
                  preserve={{ page: data.page }}
                  labels={labels}
                />
              </>
            )}
          </section>
        </>
      ) : (
        <>
          {!!accepted.length && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 font-bold text-teal">
                <BookOpen size={18} />
                {ar ? 'مجموعاتك المسجل بها' : 'Your enrolled classes'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {accepted.map(e => (
                  <article
                    key={e.id}
                    className={`${studentCard} group transition-colors hover:border-teal/40`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <ClassMark name={e.group?.name ?? 'D'} />
                      <Status
                        value={e.group?.status === 'archived' ? 'archived' : 'accepted'}
                        locale={locale}
                      />
                    </div>
                    <h3 className="mt-4 wrap-break-word text-lg font-bold text-teal">
                      <Link
                        className="inline-flex min-h-11 items-center underline decoration-teal/20 underline-offset-2"
                        href={`/${locale}/student/classes/${e.group_id}`}
                      >
                        {e.group?.name || (ar ? 'مجموعتك التعليمية' : 'Your learning class')}
                      </Link>
                    </h3>
                    {e.group?.location && (
                      <p className="mt-2 text-sm text-muted">{e.group.location}</p>
                    )}
                    <p className="mt-5 flex items-center gap-2 text-sm font-bold text-teal">
                      <Link
                        href={`/${locale}/student/classes/${e.group_id}?view=teacher#teacher-contact`}
                        className="inline-flex min-h-11 items-center gap-2 underline decoration-teal/30 underline-offset-2"
                      >
                        {ar ? 'تواصل مع المعلم' : 'Contact teacher'}
                        <ArrowUpRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                      </Link>
                    </p>
                    <EnrollmentProgress locale={locale} current="accepted" />
                  </article>
                ))}
              </div>
            </section>
          )}
          {!!requests.length && (
            <section className={accepted.length ? 'mt-8' : ''}>
              <h2 className="mb-4 flex items-center gap-2 font-bold text-teal">
                <Clock3 size={18} />
                {ar ? 'طلبات الانضمام' : 'Enrollment requests'}
              </h2>
              <div className="grid gap-3">
                {requests.map(e => (
                  <article key={e.id} className={studentCard}>
                    <div className="flex items-center gap-3">
                      <ClassMark name={e.group?.name ?? 'D'} />
                      <div className="min-w-0 flex-1">
                        <h3 className="wrap-break-word font-bold text-teal">
                          {e.group?.name ||
                            (ar ? 'طلب انضمام لمجموعة' : 'Class enrollment request')}
                        </h3>
                        <p
                          role={e.status === 'pending' ? 'status' : undefined}
                          className={`mt-1 text-sm text-muted ${e.status === 'pending' ? 'student-request-confirmation' : ''}`}
                        >
                          {e.status === 'pending'
                            ? ar
                              ? 'تم إرسال طلبك! سيراجعه معلمك. تابع الطلب في مجموعاتي.'
                              : 'Request sent! Your teacher will review it. Track it in My classes.'
                            : e.status === 'rejected'
                              ? ar
                                ? 'رفض المعلم هذا الطلب. يمكنك إرسال طلب جديد من صفحة المجموعة.'
                                : 'The teacher declined this request. You can send a new request from the group page.'
                              : e.status === 'cancelled'
                                ? ar
                                  ? 'أُلغي هذا الطلب. يمكنك إرسال طلب جديد من صفحة المجموعة.'
                                  : 'This request was cancelled. You can send a new request from the group page.'
                                : ar
                                  ? 'تتوفر حالة هذا الطلب هنا.'
                                  : 'The status of this request is shown here.'}
                        </p>
                      </div>
                      <Status value={e.status} locale={locale} />
                    </div>
                    {e.status === 'pending' && (
                      <>
                        <EnrollmentProgress locale={locale} current="requested" />
                        <details className="mt-3 border-t border-line pt-2">
                          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted">
                            {ar ? 'إدارة الطلب' : 'Manage request'}
                          </summary>
                          <EnrollmentForm locale={locale} id={e.id} kind="cancel" />
                        </details>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {!data.enrollments.length && !waitlist.total && (
            <StudentEmpty
              title={ar ? 'ابدأ بمجموعتك الأولى' : 'Find your first learning group'}
              description={
                ar
                  ? 'اختر مادة ومعلمًا يناسبان أهدافك، ثم أرسل طلب الانضمام.'
                  : 'Choose a subject and teacher that fit your goals, then request to join.'
              }
              href={`/${locale}/teachers`}
              label={ar ? 'اكتشف المعلمين والمجموعات' : 'Explore teachers and groups'}
              icon="find-a-group"
            />
          )}
          <StudentPagination
            locale={locale}
            href={`/${locale}/student/classes`}
            page={data.page}
            pageCount={data.pageCount}
            labels={labels}
            preserve={{ waitlist_page: search?.waitlist_page }}
          />
          <section id="waitlist-history" className="mt-10 scroll-mt-8">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-teal">
              <Clock3 size={18} />
              {ar ? 'سجل قائمة الانتظار' : 'Waitlist history'}
            </h2>
            {waitlist.error ? (
              <section className={studentCard}>
                <p role="alert" className="text-sm text-danger">
                  {ar
                    ? 'تعذّر تحميل سجل قائمة الانتظار. حدّث الصفحة للمحاولة مجددًا.'
                    : 'Could not load waitlist history. Refresh to try again.'}
                </p>
                <Link
                  href={`/${locale}/student/classes?${new URLSearchParams({
                    ...(search?.page ? { page: search.page } : {}),
                    ...(search?.waitlist_page ? { waitlist_page: search.waitlist_page } : {}),
                  })}`}
                  className="mt-3 inline-flex min-h-11 items-center font-bold text-orange underline"
                >
                  {ar ? 'إعادة المحاولة' : 'Try again'}
                </Link>
              </section>
            ) : waitlist.rows.length ? (
              <div className="grid gap-3">
                {waitlist.rows.map(entry => {
                  const stateLabel = ar
                    ? (
                        {
                          waiting: 'في قائمة الانتظار',
                          promoted: 'نُقل إلى طلب انضمام',
                          withdrawn: 'تم الانسحاب من القائمة',
                          closed: 'أُغلقت القائمة',
                        } as Record<string, string>
                      )[entry.status]
                    : (
                        {
                          waiting: 'Waiting',
                          promoted: 'Moved to enrollment request',
                          withdrawn: 'Withdrawn',
                          closed: 'Closed',
                        } as Record<string, string>
                      )[entry.status];
                  return (
                    <article key={entry.id} className={studentCard}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="wrap-break-word font-bold text-teal">
                            {entry.group_name || (ar ? 'مجموعة تعليمية' : 'Learning group')}
                          </h3>
                          <p className="mt-1 text-sm text-muted">
                            {ar ? 'المعلم: ' : 'Teacher: '}
                            {entry.teacher_name || (ar ? 'غير متاح' : 'Unavailable')}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
                              dateStyle: 'medium',
                            }).format(new Date(entry.created_at))}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-teal">
                          {stateLabel}
                        </span>
                      </div>
                      {entry.status === 'waiting' && (
                        <div className="mt-4">
                          <p className="mb-3 text-sm text-muted">
                            {ar
                              ? 'عند توفر مقعد، قد ينقل المعلم إدخالك إلى طلب انضمام للمراجعة. لا يؤكد ذلك حجز مقعد.'
                              : 'If a seat opens, the teacher may move your entry to an enrollment request for review. This does not reserve a place.'}
                          </p>
                          <WaitlistWithdrawForm locale={locale} entryId={entry.id} />
                        </div>
                      )}
                      {entry.status === 'promoted' && (
                        <p role="status" className="mt-3 text-sm text-muted">
                          {ar
                            ? 'تم نقل الإدخال إلى مراجعة طلب الانضمام. راجع حالة طلبك أعلاه لمعرفة القرار الحالي.'
                            : 'This entry moved to enrollment review. Check your request above for its current status.'}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className={studentCard}>
                {ar ? 'لا توجد إدخالات في قائمة الانتظار.' : 'You have no waitlist entries.'}
              </p>
            )}
            <StudentPagination
              locale={locale}
              href={`/${locale}/student/classes`}
              page={waitlist.page}
              pageCount={waitlist.pageCount}
              pageParam="waitlist_page"
              preserve={{ page: data.page }}
              labels={labels}
            />
          </section>
        </>
      )}
    </div>
  );
}
