import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Metric, Panel, ScreenTitle } from '@/components/platform/ui';

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
 const t=ar?{eyebrow:'إدارة المنصة',title:'نظرة عامة',description:'تابع المجتمع وراجع المعلمين والبلاغات والدليل التعليمي.',students:'الطلاب',teachers:'المعلمون',pending:'طلبات معلمين بانتظار المراجعة',groups:'المجموعات',enrollments:'طلبات التحاق مقبولة',reports:'بلاغات مفتوحة',queue:'فتح طلبات المعلمين',error:'تعذر تحميل عدد الطلبات. حاول إعادة تحميل الصفحة.',intro:'ابدأ بمراجعة طلبات المعلمين والبلاغات المفتوحة.'}:{eyebrow:'Platform administration',title:'Overview',description:'Monitor the community and manage teacher reviews, reports, and the education catalogue.',students:'Students',teachers:'Teachers',pending:'Teacher requests awaiting review',groups:'Groups',enrollments:'Accepted enrollments',reports:'Open reports',queue:'Open teacher requests',error:'Could not load the teacher request count. Refresh and try again.',intro:'Start with teacher requests and open reports.'};
 return <><ScreenTitle eyebrow={t.eyebrow} title={t.title} description={t.description}/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label={t.students} value={students.count||0}/><Metric label={t.teachers} value={teachers.count||0}/>{reviewsFailed?<Panel><p className="text-sm text-muted">{t.pending}</p><p role="alert" className="mt-2 text-sm text-red-800">{t.error}</p><Link className="mt-3 inline-block font-bold text-orange underline" href={`/${locale}/admin/teachers`}>{t.queue}</Link></Panel>:<Link href={`/${locale}/admin/teachers`}><Metric label={t.pending} value={pendingTotal!}/></Link>}<Metric label={t.groups} value={groups.count||0}/><Metric label={t.enrollments} value={enrollments.count||0}/><Metric label={t.reports} value={reports.count||0}/></div>
  <Panel className="mt-6"><h2 className="text-xl font-black text-teal">{t.queue}</h2><p className="mt-2 text-muted">{t.intro}</p><Link href={`/${locale}/admin/teachers`} className="mt-4 inline-flex rounded-xl bg-teal px-5 py-3 font-bold text-white">{t.queue}</Link></Panel>
 </>;
}
