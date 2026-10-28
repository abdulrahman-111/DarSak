import { ensureLocale } from '@/i18n/config';
import Link from 'next/link';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { teacherStudents } from '@/features/teacher/data';
import { TeacherRosterFilterForm } from '@/features/teacher/roster-filter-form';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';

export default async function TeacherStudents({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
    group_id?: string | string[];
  }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const { data } = await loadWithTeachingAccess(locale, () =>
    teacherStudents(locale, query.page, query.q, query.group_id),
  );
  const copy = ar
    ? {
        eyebrow: 'المجموعات الحالية',
        title: 'طلابي',
        description: 'الطلاب المقبولون في مجموعاتك.',
        failed: 'تعذر تحميل طلابك. حاول مرة أخرى.',
        retry: 'إعادة المحاولة',
        empty: 'لا يوجد طلاب مقبولون بعد.',
        previous: 'السابق',
        next: 'التالي',
        page: 'الصفحة',
      }
    : {
        eyebrow: 'Current groups',
        title: 'My students',
        description: 'Students currently accepted into your groups.',
        failed: 'Could not load your students. Try again.',
        retry: 'Try again',
        empty: 'No accepted students yet.',
        previous: 'Previous',
        next: 'Next',
        page: 'Page',
      };
  return (
    <>
      <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      {data.error ? (
        <>
          <TeacherRosterFilterForm
            locale={locale}
            path="students"
            query={data.query}
            groupId={data.groupId}
            groups={data.groups}
          />
          <Panel>
            <p role="alert" className="text-sm text-danger">
              {copy.failed}
            </p>
            <Link
              href={`/${locale}/teacher/students?page=${data.page}${data.query ? `&q=${encodeURIComponent(data.query)}` : ''}${data.groupId ? `&group_id=${encodeURIComponent(data.groupId)}` : ''}`}
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
            path="students"
            query={data.query}
            groupId={data.groupId}
            groups={data.groups}
          />
          {data.students.length ? (
            <Panel className="min-w-0">
              <div className="grid min-w-0 gap-3">
                {data.students.map(row => (
                  <div
                    key={row.enrollment_id}
                    className="min-w-0 rounded-2xl border border-line p-3 sm:p-4"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <strong className="block break-words text-teal [overflow-wrap:anywhere]">
                          {row.full_name}
                        </strong>
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
                  </div>
                ))}
              </div>
            </Panel>
          ) : (
            <EmptyState
              title={copy.empty}
              action={{
                href: `/${locale}/teacher/requests`,
                label: ar ? 'راجع طلبات الانضمام' : 'Review enrollment requests',
              }}
            >
              {ar
                ? 'يظهر الطلاب هنا بعد قبول طلبات انضمامهم.'
                : 'Students appear here once you accept their enrollment requests.'}
            </EmptyState>
          )}
          <StudentPagination
            locale={locale}
            href={`/${locale}/teacher/students`}
            page={data.page}
            pageCount={data.pageCount}
            labels={copy}
            preserve={{ q: data.query || undefined, group_id: data.groupId || undefined }}
          />
        </>
      )}
    </>
  );
}
