import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { AdminForm } from '@/features/admin/forms';
import { EmptyState, Panel, ScreenTitle, cairoDate } from '@/components/platform/ui';
import {
  normalizeStudentPage,
  studentPageCount,
  STUDENT_PAGE_SIZE,
} from '@/features/student/pagination-domain';
import { StudentPagination } from '@/features/student/pagination';
import { reportProgress, parseAdminReportPage } from '@/features/reports/domain';

export default async function AdminReports({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; status?: string }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ page?: string; status?: string }>({}),
  ]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar',
    me = await requireViewer(locale, 'admin');
  const status = ['open', 'resolved'].includes(query?.status || '')
    ? (query?.status as 'open' | 'resolved')
    : 'all';
  let page = normalizeStudentPage(query?.page),
    offset = (page - 1) * STUDENT_PAGE_SIZE;
  let result = await me.db.rpc('admin_problem_report_page', {
    p_status: status,
    p_offset: offset,
    p_limit: STUDENT_PAGE_SIZE,
  });
  let parsed = result.error ? null : parseAdminReportPage(result.data);
  if (parsed && page > studentPageCount(parsed.total)) {
    page = studentPageCount(parsed.total);
    offset = (page - 1) * STUDENT_PAGE_SIZE;
    result = await me.db.rpc('admin_problem_report_page', {
      p_status: status,
      p_offset: offset,
      p_limit: STUDENT_PAGE_SIZE,
    });
    parsed = result.error ? null : parseAdminReportPage(result.data);
  }
  const failed = !parsed;
  const reportPage = parsed ?? { rows: [], total: 0 };
  const copy = ar
    ? {
        eyebrow: 'سلامة المجتمع',
        title: 'البلاغات',
        description:
          'راجع البلاغ، أضف ردًا للمبلّغ ثم احفظ الحالة. الملاحظة الداخلية لا تظهر للمبلّغ.',
        error: 'تعذر تحميل البلاغات. حدّث الصفحة وحاول مرة أخرى.',
        retry: 'إعادة المحاولة',
        empty: 'لا توجد بلاغات.',
        previous: 'السابق',
        next: 'التالي',
        page: 'صفحة',
        status: 'الحالة',
        all: 'الكل',
        open: 'مفتوح',
        resolved: 'تم الحل',
        note: 'ملاحظة داخلية خاصة (٣٠٠٠ حرف)',
        reporter: 'المبلّغ',
        date: 'تاريخ الإرسال',
        affected: 'الصفحة المتأثرة',
        role: 'الدور',
      }
    : {
        eyebrow: 'Community safety',
        title: 'Reports',
        description:
          'Review reports and reply to the reporter. Keep internal notes separate; resolving requires a clear response.',
        error: 'Could not load reports. Refresh and try again.',
        retry: 'Try again',
        empty: 'No reports found.',
        previous: 'Previous',
        next: 'Next',
        page: 'Page',
        status: 'Status',
        all: 'All',
        open: 'Open',
        resolved: 'Resolved',
        note: 'Private administrator note (3,000 characters)',
        reporter: 'Reporter',
        date: 'Submitted',
        affected: 'Affected page',
        role: 'Role',
      };
  return (
    <>
      <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <nav aria-label={copy.status} className="mb-5 flex flex-wrap gap-2">
        {(['all', 'open', 'resolved'] as const).map(value => (
          <Link
            key={value}
            aria-current={status === value ? 'page' : undefined}
            href={`/${locale}/admin/reports?status=${value}`}
            className={`rounded-full border px-4 py-2 text-sm font-bold ${status === value ? 'border-teal bg-teal text-white' : 'border-line text-teal'}`}
          >
            {copy[value]}
          </Link>
        ))}
      </nav>
      {failed ? (
        <Panel>
          <p role="alert" className="text-sm text-danger">
            {copy.error}
          </p>
          <Link
            href={`/${locale}/admin/reports?status=${status}&retry=1`}
            className="mt-3 inline-flex font-bold text-orange underline"
          >
            {copy.retry}
          </Link>
        </Panel>
      ) : reportPage.rows.length ? (
        <div className="grid gap-4">
          {reportPage.rows.map(report => (
            <Panel key={report.id}>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words font-black text-teal [overflow-wrap:anywhere]">
                    {report.subject}
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted [overflow-wrap:anywhere]">
                    {report.description}
                  </p>
                </div>
                <span className="rounded-full bg-teal/10 px-3 py-2 text-sm font-bold text-teal">
                  {reportProgress(report.status, report.reviewed_at, locale)}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                <span>
                  {copy.reporter}: <strong className="text-teal">{report.reporter_name}</strong>
                </span>
                <span>
                  {copy.role}:{' '}
                  {report.reporter_role === 'admin'
                    ? ar
                      ? 'مسؤول'
                      : 'Administrator'
                    : report.reporter_role === 'teacher'
                      ? ar
                        ? 'معلم'
                        : 'Teacher'
                      : ar
                        ? 'طالب'
                        : 'Student'}
                </span>
                <time dateTime={report.created_at}>
                  {copy.date}: {cairoDate(report.created_at, locale)}
                </time>
                {report.page_path && (
                  <span className="min-w-0 break-all" dir="ltr">
                    {copy.affected}: {report.page_path}
                  </span>
                )}
              </div>
              <div className="mt-5">
                <AdminForm
                  locale={locale}
                  operation="report"
                  id={report.id}
                  fields={[
                    {
                      name: 'expected_updated_at',
                      label: '',
                      type: 'hidden',
                      value: report.updated_at,
                    },
                    {
                      name: 'public_response',
                      label: ar
                        ? 'الرد المرئي للمبلّغ (بحد أقصى ٣٠٠٠ حرف؛ مطلوب للحل)'
                        : 'Reply visible to reporter (up to 3,000 characters; required to resolve)',
                      type: 'textarea',
                      value: report.public_response || '',
                      maxLength: 3000,
                    },
                    {
                      name: 'status',
                      label: copy.status,
                      value: report.status,
                      options: [
                        { value: 'open', label: copy.open },
                        { value: 'resolved', label: copy.resolved },
                      ],
                    },
                    {
                      name: 'admin_note',
                      label: copy.note,
                      value: report.admin_note || '',
                      type: 'textarea',
                      maxLength: 3000,
                    },
                  ]}
                />
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState>{copy.empty}</EmptyState>
      )}
      {!failed && (
        <StudentPagination
          locale={locale}
          href={`/${locale}/admin/reports?status=${status}`}
          page={page}
          pageCount={studentPageCount(reportPage.total)}
          labels={copy}
        />
      )}
    </>
  );
}
