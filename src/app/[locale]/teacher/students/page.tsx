import { ensureLocale } from '@/i18n/config';
import Link from 'next/link';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { teacherStudents } from '@/features/teacher/data';
import { TeacherRosterFilterForm } from '@/features/teacher/roster-filter-form';

export default async function TeacherStudents({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string|string[];q?:string|string[];group_id?:string|string[]}>}){
  const [{locale:raw},query]=await Promise.all([params,searchParams]);
  const locale=ensureLocale(raw),ar=locale==='ar';
  const data=await teacherStudents(locale,query.page,query.q,query.group_id);
  const copy=ar
    ?{eyebrow:'المجموعات الحالية',title:'طلابي',description:'الطلاب المقبولون في مجموعاتك.',failed:'تعذر تحميل طلابك. حاول مرة أخرى.',retry:'إعادة المحاولة',empty:'لا يوجد طلاب مقبولون بعد.',previous:'السابق',next:'التالي',page:'الصفحة'}
    :{eyebrow:'Current groups',title:'My students',description:'Students currently accepted into your groups.',failed:'Could not load your students. Try again.',retry:'Try again',empty:'No accepted students yet.',previous:'Previous',next:'Next',page:'Page'};
  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/>
    {data.error
      ? <><TeacherRosterFilterForm locale={locale} path="students" query={data.query} groupId={data.groupId} groups={data.groups}/><Panel><p role="alert" className="text-sm text-red-800">{copy.failed}</p><Link href={`/${locale}/teacher/students?page=${data.page}${data.query ? `&q=${encodeURIComponent(data.query)}` : ''}${data.groupId ? `&group_id=${encodeURIComponent(data.groupId)}` : ''}`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</Link></Panel></>
      : <>
        <TeacherRosterFilterForm locale={locale} path="students" query={data.query} groupId={data.groupId} groups={data.groups}/>
        {data.students.length
          ? <Panel><div className="grid gap-3">{data.students.map(row=><div key={row.enrollment_id} className="rounded-2xl border border-line p-4"><div className="flex items-center justify-between gap-3"><div><strong className="text-teal">{row.full_name}</strong><p className="mt-1 text-sm text-muted">{row.group_name}</p></div><Status value={row.status} locale={locale}/></div><EnrollmentDecisionButtons locale={locale} id={row.enrollment_id} status={row.status}/></div>)}</div></Panel>
          : <EmptyState>{copy.empty}</EmptyState>}
        <StudentPagination locale={locale} href={`/${locale}/teacher/students`} page={data.page} pageCount={data.pageCount} labels={copy} preserve={{q:data.query||undefined,group_id:data.groupId||undefined}}/>
      </>}
  </>;
}
