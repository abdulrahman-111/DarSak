import { ensureLocale } from '@/i18n/config';
import Link from 'next/link';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { teacherRequests } from '@/features/teacher/data';
import { StudentPagination } from '@/features/student/pagination';
import { TeacherRosterFilterForm } from '@/features/teacher/roster-filter-form';
import { requireTeachingAccess } from '@/components/platform/access';

export default async function TeacherRequests({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string|string[];q?:string|string[];group_id?:string|string[]}>}){
  const [{locale:raw},query]=await Promise.all([params,searchParams]);
  const locale=ensureLocale(raw),ar=locale==='ar';
  await requireTeachingAccess(locale);
  const data=await teacherRequests(locale,query.page,query.q,query.group_id);
  const copy=ar
    ?{eyebrow:'طلبات الطلاب',title:'طلبات الانضمام',description:'راجع الطلبات واقبل الطلاب عند توفر أماكن في المجموعة.',failed:'تعذر تحميل طلبات الطلاب. حاول مرة أخرى.',retry:'إعادة المحاولة',empty:'لا توجد طلبات تنتظر المراجعة.',previous:'السابق',next:'التالي',page:'الصفحة'}
    :{eyebrow:'Student requests',title:'Enrollment requests',description:'Review requests and offer places while seats are available.',failed:'Could not load student requests. Try again.',retry:'Try again',empty:'No requests are waiting for review.',previous:'Previous',next:'Next',page:'Page'};
  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/>
    {data.error
      ? <><TeacherRosterFilterForm locale={locale} path="requests" query={data.query} groupId={data.groupId} groups={data.groups}/><Panel><p role="alert" className="text-sm text-red-800">{copy.failed}</p><Link href={`/${locale}/teacher/requests?page=${data.page}${data.query ? `&q=${encodeURIComponent(data.query)}` : ''}${data.groupId ? `&group_id=${encodeURIComponent(data.groupId)}` : ''}`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</Link></Panel></>
      : <>
        <TeacherRosterFilterForm locale={locale} path="requests" query={data.query} groupId={data.groupId} groups={data.groups}/>
        {data.requests.length
          ? <div className="grid min-w-0 gap-4 md:grid-cols-2">{data.requests.map(row=><Panel key={row.enrollment_id} className="min-w-0"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words font-black text-teal [overflow-wrap:anywhere]">{row.full_name}</h2><p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">{row.group_name}</p></div><div className="shrink-0"><Status value={row.status} locale={locale}/></div></div><EnrollmentDecisionButtons locale={locale} id={row.enrollment_id} status={row.status}/></Panel>)}</div>
          : <EmptyState>{copy.empty}</EmptyState>}
        <StudentPagination locale={locale} href={`/${locale}/teacher/requests`} page={data.page} pageCount={data.pageCount} labels={copy} preserve={{q:data.query||undefined,group_id:data.groupId||undefined}}/>
      </>}
  </>;
}
