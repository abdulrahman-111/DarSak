import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Metric, Panel, QuickAction, ScreenTitle, UnavailableMetric } from '@/components/platform/ui';

export default async function AdminOverview({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=ensureLocale(raw),ar=locale==='ar',me=await requireViewer(locale,'admin');
 const [students,teachers,reviews,groups,reports,enrollments]=await Promise.all([
  me.db.from('profiles').select('id',{count:'exact',head:true}).eq('role','student'),
  me.db.from('profiles').select('id',{count:'exact',head:true}).eq('role','teacher'),
  me.db.rpc('admin_teacher_reviews',{p_status:'pending',p_query:'',p_offset:0,p_limit:1}),
  me.db.from('groups').select('id',{count:'exact',head:true}),
  me.db.from('reports').select('id',{count:'exact',head:true}).eq('status','open'),
  me.db.from('enrollments').select('id',{count:'exact',head:true}).eq('status','accepted'),
 ]);
 const response=reviews.data as {total?:unknown}|null,pendingTotal=typeof response?.total==='number'?response.total:null,reviewsFailed=!!reviews.error||pendingTotal===null;
 const t=ar?{eyebrow:'إدارة المنصة',title:'نظرة عامة',description:'ابدأ بمراجعة طلبات المعلمين والبلاغات المفتوحة، ثم انتقل إلى بقية أقسام الإدارة.',students:'الطلاب',teachers:'المعلمون',pending:'طلبات معلمين بانتظار المراجعة',groups:'المجموعات',enrollments:'طلبات التحاق مقبولة',reports:'بلاغات مفتوحة',queue:'مراجعة طلبات المعلمين',error:'تعذر تحميل هذا العدد. حدّث الصفحة وحاول مرة أخرى.',intro:'راجع طلبات المعلمين والبلاغات المفتوحة.',users:'المستخدمون',groupsLink:'المجموعات',catalogue:'الدليل التعليمي',reportsLink:'مراجعة البلاغات المفتوحة',settings:'الإعدادات',retry:'إعادة المحاولة'}:{eyebrow:'Platform administration',title:'Overview',description:'Start by reviewing teacher applications and open reports, then use the other administration areas as needed.',students:'Students',teachers:'Teachers',pending:'Teacher applications awaiting review',groups:'Groups',enrollments:'Accepted enrollments',reports:'Open reports',queue:'Review teacher applications',error:'Could not load this count. Refresh and try again.',intro:'Review teacher applications and open reports.',users:'People',groupsLink:'Groups',catalogue:'Education catalogue',reportsLink:'Review open reports',settings:'Settings',retry:'Try again'};
 const stats=[
  {label:t.pending,result:reviewsFailed?{error:true,count:null}: {error:null,count:pendingTotal},href:`/${locale}/admin/teachers`},
  {label:t.reports,result:reports,href:`/${locale}/admin/reports`},
  {label:t.students,result:students,href:`/${locale}/admin/users`},
  {label:t.teachers,result:teachers,href:`/${locale}/admin/users?role=teacher`},
  {label:t.groups,result:groups,href:`/${locale}/admin/groups`},
  {label:t.enrollments,result:enrollments,href:`/${locale}/admin/groups`},
 ];
 return <><ScreenTitle eyebrow={t.eyebrow} title={t.title} description={t.description}/>
  <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3"><QuickAction href={`/${locale}/admin/teachers`}>{t.queue}</QuickAction><QuickAction href={`/${locale}/admin/reports`}>{t.reportsLink}</QuickAction><QuickAction href={`/${locale}/admin/users`}>{t.users}</QuickAction><QuickAction href={`/${locale}/admin/groups`}>{t.groupsLink}</QuickAction><QuickAction href={`/${locale}/admin/education`}>{t.catalogue}</QuickAction><QuickAction href={`/${locale}/admin/settings`}>{t.settings}</QuickAction></div>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{stats.map(item=>item.result.error||item.result.count===null?<UnavailableMetric key={item.label} label={item.label} message={t.error} href={`/${locale}/admin?retry=1`} retry={t.retry}/>:<Link key={item.label} href={item.href}><Metric label={item.label} value={item.result.count}/></Link>)}</div>
  <Panel className="mt-6"><h2 className="text-xl font-black text-teal">{t.intro}</h2><div className="mt-4 flex flex-wrap gap-3"><Link href={`/${locale}/admin/teachers`} className="inline-flex rounded-xl bg-teal px-5 py-3 font-bold text-white">{t.queue}</Link><Link href={`/${locale}/admin/reports`} className="inline-flex rounded-xl border border-line px-5 py-3 font-bold text-teal">{t.reportsLink}</Link></div></Panel>
 </>;
}
