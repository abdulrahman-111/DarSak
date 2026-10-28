import { ensureLocale } from '@/i18n/config';
import Link from 'next/link';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { teacherRequests, teacherWaitlist } from '@/features/teacher/data';
import { StudentPagination } from '@/features/student/pagination';
import { TeacherRosterFilterForm } from '@/features/teacher/roster-filter-form';
import { WaitlistPromoteForm } from '@/features/student/waitlist-forms';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';

export default async function TeacherRequests({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
    group_id?: string | string[];
    view?: string | string[];
  }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const view = Array.isArray(query.view) ? query.view[0] : query.view;
  const waitingView = view === 'waiting';
  const { data } = await loadWithTeachingAccess(locale, async () =>
    waitingView
      ? {
          ...(await teacherWaitlist(locale, query.page, query.q, query.group_id)),
          view: 'waiting' as const,
        }
      : {
          ...(await teacherRequests(locale, query.page, query.q, query.group_id)),
          view: 'requests' as const,
        },
  );
  const copy = ar
    ? {
        eyebrow: 'طلبات الطلاب',
        title: 'طلبات الانضمام',
        description: 'راجع الطلبات واقبل الطلاب عند توفر أماكن في المجموعة.',
        waitingDescription:
          'انقل الطالب المؤهل إلى طلب انضمام عند توفر مقعد. سيظل الطلب بحاجة إلى مراجعتك.',
        failed: 'تعذر تحميل طلبات الطلاب. حاول مرة أخرى.',
        retry: 'إعادة المحاولة',
        empty: 'لا توجد طلبات تنتظر المراجعة.',
        waitingEmpty: 'لا يوجد طلاب في قائمة الانتظار لهذه المجموعات.',
        previous: 'السابق',
        next: 'التالي',
        page: 'الصفحة',
        requestsTab: 'طلبات الانضمام',
        waitingTab: 'قائمة الانتظار',
      }
    : {
        eyebrow: 'Student requests',
        title: 'Enrollment requests',
        description: 'Review requests and offer places while seats are available.',
        waitingDescription:
          'Move an eligible student to an enrollment request when a seat is available. The request still needs your review.',
        failed: 'Could not load student requests. Try again.',
        retry: 'Try again',
        empty: 'No requests are waiting for review.',
        waitingEmpty: 'No students are waiting for a place in these groups.',
        previous: 'Previous',
        next: 'Next',
        page: 'Page',
        requestsTab: 'Enrollment requests',
        waitingTab: 'Waiting list',
      };
  const search = new URLSearchParams();
  if (data.query) search.set('q', data.query);
  if (data.groupId) search.set('group_id', data.groupId);
  const filters = search.toString();
  return (
    <>
      <ScreenTitle
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={waitingView ? copy.waitingDescription : copy.description}
      />
      <nav aria-label={ar ? 'نوع الطلبات' : 'Request type'} className="mb-5 flex flex-wrap gap-2">
        <Link
          aria-current={!waitingView ? 'page' : undefined}
          href={`/${locale}/teacher/requests${filters ? `?${filters}` : ''}`}
          className={`inline-flex min-h-11 items-center rounded-xl px-4 font-bold ${!waitingView ? 'bg-teal text-white' : 'border border-line bg-white text-teal'}`}
        >
          {copy.requestsTab}
        </Link>
        <Link
          aria-current={waitingView ? 'page' : undefined}
          href={`/${locale}/teacher/requests?view=waiting${filters ? `&${filters}` : ''}`}
          className={`inline-flex min-h-11 items-center rounded-xl px-4 font-bold ${waitingView ? 'bg-teal text-white' : 'border border-line bg-white text-teal'}`}
        >
          {copy.waitingTab}
        </Link>
      </nav>
      {data.error ? (
        <>
          <TeacherRosterFilterForm
            locale={locale}
            path="requests"
            query={data.query}
            groupId={data.groupId}
            groups={data.groups}
            view={waitingView ? 'waiting' : 'requests'}
          />
          <Panel>
            <p role="alert" className="text-sm text-danger">
              {copy.failed}
            </p>
            <Link
              href={`/${locale}/teacher/requests?page=${data.page}${waitingView ? '&view=waiting' : ''}${filters ? `&${filters}` : ''}`}
              className="mt-3 inline-flex font-bold text-orange underline"
            >
              {copy.retry}
            </Link>
          </Panel>
        </>
      ) : (
        <>
          <TeacherRosterFilterForm
            locale={locale}
            path="requests"
            query={data.query}
            groupId={data.groupId}
            groups={data.groups}
            view={waitingView ? 'waiting' : 'requests'}
          />
          {data.rows.length ? (
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {data.view === 'waiting'
                ? data.rows.map(row => (
                    <Panel key={row.id} className="min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words font-bold text-teal [overflow-wrap:anywhere]">
                            {row.student_name || (ar ? 'طالب' : 'Student')}
                          </h2>
                          <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
                            {row.group_name || (ar ? 'مجموعة غير متاحة' : 'Unavailable group')}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {ar ? 'تاريخ دخول قائمة الانتظار: ' : 'Joined waitlist: '}
                            {new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
                              dateStyle: 'medium',
                            }).format(new Date(row.created_at))}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-teal">
                          {ar ? 'في الانتظار' : 'Waiting'}
                        </span>
                      </div>
                      <WaitlistPromoteForm
                        locale={locale}
                        entryId={row.id}
                        canPromote={row.can_promote}
                      />
                      {!row.can_promote && (
                        <p className="text-xs text-muted">
                          {ar
                            ? 'النقل متاح عندما يكون المعلم والمجموعة نشطين ويتوفر مقعد.'
                            : 'Move to review is available when the teacher and group are active and a seat is open.'}
                        </p>
                      )}
                    </Panel>
                  ))
                : data.rows.map(row => (
                    <Panel key={row.enrollment_id} className="min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words font-bold text-teal [overflow-wrap:anywhere]">
                            {row.full_name}
                          </h2>
                          <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
                            {row.group_name}
                          </p>
                        </div>
                        <div className="shrink-0">
                          <Status value={row.status} locale={locale} />
                        </div>
                      </div>
                      <EnrollmentDecisionButtons
                        locale={locale}
                        id={row.enrollment_id}
                        status={row.status}
                      />
                    </Panel>
                  ))}
            </div>
          ) : (
            <EmptyState
              title={waitingView ? copy.waitingEmpty : copy.empty}
              action={
                data.query || data.groupId
                  ? undefined
                  : {
                      href: `/${locale}/teacher/groups`,
                      label: ar ? 'افتح مجموعاتك' : 'Open your groups',
                    }
              }
            >
              {data.query || data.groupId
                ? ar
                  ? 'جرّب بحثًا أوسع أو امسح عامل التصفية.'
                  : 'Try a broader search or clear the group filter.'
                : waitingView
                  ? ar
                    ? 'تظهر هنا إدخالات الطلاب الذين اختاروا قائمة الانتظار لمجموعاتك.'
                    : 'Students who opt in to your groups’ waitlists appear here.'
                  : ar
                    ? 'تظهر هنا طلبات الطلاب على مجموعاتك المنشورة.'
                    : 'Requests appear here when students ask to join your published groups.'}
            </EmptyState>
          )}
          <StudentPagination
            locale={locale}
            href={`/${locale}/teacher/requests`}
            page={data.page}
            pageCount={data.pageCount}
            labels={copy}
            preserve={{
              q: data.query || undefined,
              group_id: data.groupId || undefined,
              view: waitingView ? 'waiting' : undefined,
            }}
          />
        </>
      )}
    </>
  );
}
