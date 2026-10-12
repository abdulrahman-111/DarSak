import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { AdminForm } from '@/features/admin/forms';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { normalizeStudentPage, STUDENT_PAGE_SIZE, studentPageCount } from '@/features/student/pagination-domain';
import { StudentPagination } from '@/features/student/pagination';

export default async function AdminReports({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ page?: string }> }) {
  const { locale: raw } = await params, query = await searchParams;
  const locale = ensureLocale(raw), ar = locale === 'ar', me = await requireViewer(locale, 'admin');
  const fetchReports = (page: number) => me.db.from('reports')
    .select('id,subject,description,status,admin_note,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range((page - 1) * STUDENT_PAGE_SIZE, page * STUDENT_PAGE_SIZE - 1);
  let page = normalizeStudentPage(query?.page);
  let reports = await fetchReports(page);
  const count = reports.count ?? 0, pageCount = studentPageCount(count);
  if (!reports.error && reports.count != null && page > pageCount) { page = pageCount; reports = await fetchReports(page); }
  const failed = !!reports.error || reports.count == null;
  const copy = ar
    ? { eyebrow: 'سلامة المجتمع', title: 'البلاغات', description: 'راجع البلاغ، أضف ملاحظة داخلية، ثم حدّث حالته.', error: 'تعذر تحميل البلاغات. حدّث الصفحة وحاول مرة أخرى.', retry: 'إعادة المحاولة', empty: 'لا توجد بلاغات.', previous: 'السابق', next: 'التالي', page: 'صفحة', status: 'الحالة', open: 'مفتوح', resolved: 'تم الحل', note: 'ملاحظة المسؤول' }
    : { eyebrow: 'Community safety', title: 'Reports', description: 'Review each report, add an internal note, and update its status.', error: 'Could not load reports. Refresh and try again.', retry: 'Try again', empty: 'No reports found.', previous: 'Previous', next: 'Next', page: 'Page', status: 'Status', open: 'Open', resolved: 'Resolved', note: 'Administrator note' };
  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/>
    {failed ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p><a href={`/${locale}/admin/reports?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</a></Panel>
      : reports.data?.length ? <div className="grid gap-4">{reports.data.map(report => <Panel key={report.id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-teal">{report.subject}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted">{report.description}</p></div><Status value={report.status} locale={locale}/></div><div className="mt-5"><AdminForm locale={locale} operation="report" id={report.id} fields={[{ name: 'status', label: copy.status, value: report.status, options: [{ value: 'open', label: copy.open }, { value: 'resolved', label: copy.resolved }] }, { name: 'admin_note', label: copy.note, value: report.admin_note, type: 'textarea' }]}/></div></Panel>)}</div>
        : <EmptyState>{copy.empty}</EmptyState>}
    {!failed && <StudentPagination locale={locale} href={`/${locale}/admin/reports`} page={page} pageCount={pageCount} labels={copy}/>}
  </>;
}
