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
    ?{eyebrow:'طلبات الطلاب',title:'طلبات الانضمام',description:'راجع كل طلب، ثم اقبل الطالب أو ارفضه. تطبق السعة داخل قاعدة البيانات.',failed:'تعذر تحميل طلبات الطلاب. حاول مرة أخرى.',retry:'إعادة المحاولة',empty:'لا توجد طلبات تنتظر المراجعة.',previous:'السابق',next:'التالي',page:'الصفحة'}
    :{eyebrow:'Student requests',title:'Enrollment requests',description:'Review each request, then accept or decline it. Capacity is enforced in the database.',failed:'Could not load student requests. Try again.',retry:'Try again',empty:'No requests are waiting for review.',previous:'Previous',next:'Next',page:'Page'};
  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/>
    {data.error
      ? <><TeacherRosterFilterForm locale={locale} path="requests" query={data.query} groupId={data.groupId} groups={data.groups}/><Panel><p role="alert" className="text-sm text-red-800">{copy.failed}</p><Link href={`/${locale}/teacher/requests?page=${data.page}${data.query ? `&q=${encodeURIComponent(data.query)}` : ''}${data.groupId ? `&group_id=${encodeURIComponent(data.groupId)}` : ''}`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</Link></Panel></>
      : <>
        <TeacherRosterFilterForm locale={locale} path="requests" query={data.query} groupId={data.groupId} groups={data.groups}/>
        {data.requests.length
          ? <div className="grid gap-4 md:grid-cols-2">{data.requests.map(row=><Panel key={row.enrollment_id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-teal">{row.full_name}</h2><p className="mt-1 text-sm text-muted">{row.group_name}</p></div><Status value={row.status} locale={locale}/></div><EnrollmentDecisionButtons locale={locale} id={row.enrollment_id} status={row.status}/></Panel>)}</div>
          : <EmptyState>{copy.empty}</EmptyState>}
        <StudentPagination locale={locale} href={`/${locale}/teacher/requests`} page={data.page} pageCount={data.pageCount} labels={copy} preserve={{q:data.query||undefined,group_id:data.groupId||undefined}}/>
      </>}
  </>;
}
