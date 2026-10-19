import { reportProgress } from '@/features/reports/domain';
import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { ScreenTitle, Panel, EmptyState, cairoDate } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { normalizeStudentPage, STUDENT_PAGE_SIZE, studentPageCount } from '@/features/student/pagination-domain';
import { ProblemReportForm } from '@/features/reports/form';
import { PlatformShell } from '@/components/platform/shell';
import { readCountedPage } from '@/lib/supabase/counted-page';

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ page?: string; status?: string }> }) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams ?? Promise.resolve<{ page?: string; status?: string }>({})]);
  const locale = ensureLocale(raw), ar = locale === 'ar';
  const { db, user, profile } = await getRequestViewer();
  const copy = ar ? {
    eyebrow: 'المساعدة والدعم', title: 'الإبلاغ عن مشكلة', intro: 'أخبرنا بما كنت تتوقع حدوثه وما حدث بالفعل. لا تضف كلمات مرور أو رموز تحقق أو معلومات دفع.',
    loginTitle: 'سجّل الدخول للإبلاغ عن مشكلة', login: 'تسجيل الدخول', denied: 'يلزم حساب نشط لإرسال البلاغات.', history: 'بلاغاتي', all: 'الكل', open: 'مفتوح', resolved: 'تم الحل', empty: 'لا توجد بلاغات في هذه الصفحة.', loadError: 'تعذر تحميل بلاغاتك. حدّث الصفحة وحاول مرة أخرى.', page: 'صفحة', previous: 'السابق', next: 'التالي',
  } : {
    eyebrow: 'Help and support', title: 'Report a problem', intro: 'Tell us what you expected and what happened instead. Do not include passwords, sign-in codes, or payment details.',
    loginTitle: 'Sign in to report a problem', login: 'Sign in', denied: 'An active account is required to submit reports.', history: 'My reports', all: 'All', open: 'Open', resolved: 'Resolved', empty: 'There are no reports on this page.', loadError: 'Could not load your reports. Refresh and try again.', page: 'Page', previous: 'Previous', next: 'Next',
  };
  if (!user) return <div className="container max-w-3xl py-8"><ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.intro}/><Panel><p className="font-semibold text-teal">{copy.loginTitle}</p><Link className="mt-4 inline-flex rounded-xl bg-teal px-5 py-3 font-bold text-white" href={`/${locale}/login`}>{copy.login}</Link></Panel></div>;
  if (profile?.status !== 'active' || !['student','teacher','admin'].includes(profile.role)) return <div className="container max-w-3xl py-8"><ScreenTitle eyebrow={copy.eyebrow} title={copy.title}/><Panel><p role="alert" className="text-sm text-red-800">{copy.denied}</p></Panel></div>;

  const status = ['open','resolved'].includes(query?.status || '') ? query?.status as 'open'|'resolved' : 'all';
  const requestedPage = normalizeStudentPage(query?.page);
  const fetchHistory = (requested: number) => {
    let request = db.from('reports').select('id,subject,description,status,page_path,created_at,updated_at,public_response,reviewed_at', { count: 'exact' }).eq('reporter_id', user.id);
    if (status !== 'all') request = request.eq('status', status);
    return request.order('created_at', { ascending: false }).order('id', { ascending: false }).range((requested - 1) * STUDENT_PAGE_SIZE, requested * STUDENT_PAGE_SIZE - 1);
  };
  const { result: history, page } = await readCountedPage(requestedPage, STUDENT_PAGE_SIZE, fetchHistory);
  const total = history.count ?? 0, pageCount = studentPageCount(total);
  const failed = !!history.error || history.count == null;
  const labels = { page: copy.page, previous: copy.previous, next: copy.next };
  return <PlatformShell locale={locale} role={profile.role as 'student'|'teacher'|'admin'} name={profile.full_name}>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.intro}/>
    <Panel className="mb-7"><ProblemReportForm locale={locale}/></Panel>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black text-teal">{copy.history}</h2><nav aria-label={copy.history} className="flex flex-wrap gap-2">{(['all','open','resolved'] as const).map(value => <Link key={value} aria-current={status === value ? 'page' : undefined} href={`/${locale}/reports?status=${value}`} className={`rounded-full border px-4 py-2 text-sm font-bold ${status === value ? 'border-teal bg-teal text-white' : 'border-line text-teal'}`}>{copy[value]}</Link>)}</nav></div>
    {failed ? <Panel><p role="alert" className="text-sm text-red-800">{copy.loadError}</p></Panel> : history.data?.length ? <div className="grid gap-3">{history.data.map(report => <Panel key={report.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-words font-black text-teal [overflow-wrap:anywhere]">{report.subject}</h3><span className="rounded-full bg-teal/10 px-3 py-2 text-sm font-bold text-teal">{reportProgress(report.status,report.reviewed_at,locale)}</span></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted [overflow-wrap:anywhere]">{report.description}</p>
      {report.public_response&&<section className="mt-4 rounded-xl border border-line bg-cream p-4"><h4 className="font-bold text-teal">{ar?'رد فريق الدعم':'Support response'}</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted [overflow-wrap:anywhere]">{report.public_response}</p></section>}<p className="mt-3 break-all text-xs text-muted">{ar?'رقم المرجع: ':'Reference: '}{report.id}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><time dateTime={report.created_at}>{cairoDate(report.created_at, locale)}</time>{report.page_path && <span dir="ltr" className="break-all">{report.page_path}</span>}</div>
    </Panel>)}</div> : <EmptyState>{copy.empty}</EmptyState>}
    {!failed && <StudentPagination locale={locale} href={`/${locale}/reports?status=${status}`} page={page} pageCount={pageCount} labels={labels}/>}
  </PlatformShell>;
}
