import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { AdminForm } from '@/features/admin/forms';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { canonicalTeacherReviewStatus, pageOffset, peopleTeacherMetadata, safeRole, safeStatus } from '@/features/admin/review-data';

const PAGE_SIZE=30;
export default async function AdminUsers({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{q?:string;role?:string;status?:string;page?:string}>}){
 const [{locale:raw},{q='',role:roleInput='all',status:statusInput='all',page}]=await Promise.all([params,searchParams]);
 const locale=ensureLocale(raw),ar=locale==='ar',me=await requireViewer(locale,'admin');
 const query=q.trim().slice(0,120),role=safeRole(roleInput),status=safeStatus(statusInput),offset=pageOffset(page,PAGE_SIZE);
 let request=me.db.from('profiles').select('id,full_name,role,status,created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(offset,offset+PAGE_SIZE-1);
 if(query)request=request.ilike('full_name',`%${query}%`);if(role!=='all')request=request.eq('role',role);if(status!=='all')request=request.eq('status',status);
 const profiles=await request;const teacherIds=(profiles.data||[]).filter(profile=>profile.role==='teacher').map(profile=>profile.id);
 const metadata=await peopleTeacherMetadata(me.db,teacherIds);
 const teacherMap=new Map(metadata.teachers.map(x=>[x.id,x]));const reviewMap=new Map(metadata.reviews.map(x=>[x.teacher_id,canonicalTeacherReviewStatus(x.status)]));const total=profiles.count??0,currentPage=Math.floor(offset/PAGE_SIZE)+1,lastPage=Math.max(1,Math.ceil(total/PAGE_SIZE));
 const href=(next:number)=>{const params=new URLSearchParams();if(query)params.set('q',query);if(role!=='all')params.set('role',role);if(status!=='all')params.set('status',status);if(next>1)params.set('page',String(next));return `/${locale}/admin/users${params.size?`?${params}`:''}`;};
 const copy=ar?{title:'المستخدمون',eyebrow:'الحسابات والصلاحيات',description:'ابحث في جميع الحسابات وصفِّها. حالة الحساب منفصلة عن مراجعة طلب المعلم.',search:'البحث بالاسم',role:'الدور',status:'حالة الحساب',all:'الكل',teachers:'المعلمون',students:'الطلاب',admins:'المسؤولون',active:'نشط',suspended:'موقوف',apply:'تطبيق',page:'صفحة',of:'من',prev:'السابق',next:'التالي',review:'مراجعة الطلب',approval:'حالة المراجعة',unavailable:'غير متاح',noResults:'لا توجد حسابات تطابق هذه المرشحات.',error:'تعذر تحميل الحسابات. حاول مرة أخرى.'}:{title:'People',eyebrow:'Accounts and access',description:'Search and filter every account. Account status is separate from teacher review.',search:'Search by name',role:'Role',status:'Account status',all:'All',teachers:'Teachers',students:'Students',admins:'Administrators',active:'Active',suspended:'Suspended',apply:'Apply',page:'Page',of:'of',prev:'Previous',next:'Next',review:'Review request',approval:'Review status',unavailable:'Unavailable',noResults:'No accounts match these filters.',error:'Could not load accounts. Please try again.'};
 const roleLabels:Record<string,string>={teacher:copy.teachers,student:copy.students,admin:copy.admins};
 return <>
  <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/>
  <Panel className="mb-5"><form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]">
   <label className="grid gap-1 text-sm font-semibold">{copy.search}<input name="q" maxLength={120} defaultValue={query} className="rounded-xl border border-line bg-cream p-3"/></label>
   <label className="grid gap-1 text-sm font-semibold">{copy.role}<select name="role" defaultValue={role} className="rounded-xl border border-line bg-cream p-3"><option value="all">{copy.all}</option><option value="teacher">{copy.teachers}</option><option value="student">{copy.students}</option><option value="admin">{copy.admins}</option></select></label>
   <label className="grid gap-1 text-sm font-semibold">{copy.status}<select name="status" defaultValue={status} className="rounded-xl border border-line bg-cream p-3"><option value="all">{copy.all}</option><option value="active">{copy.active}</option><option value="suspended">{copy.suspended}</option></select></label>
   <button className="self-end rounded-xl bg-teal px-5 py-3 font-bold text-white">{copy.apply}</button>
  </form></Panel>
  {profiles.error||metadata.error?<Panel><p role="alert" className="text-red-800">{copy.error}</p></Panel>:profiles.data?.length?<><div className="grid gap-4 lg:grid-cols-2">{profiles.data.map(profile=>{
   const teacher=teacherMap.get(profile.id);return <Panel key={profile.id}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-teal">{profile.full_name}</h2><p className="mt-1 text-sm text-muted">{roleLabels[profile.role]||profile.role}{teacher?.headline?` · ${teacher.headline}`:''}</p></div><Status value={profile.status} locale={locale}/></div>
    {profile.role==='teacher'&&<div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>{copy.approval}: {reviewMap.get(profile.id)?<Status value={reviewMap.get(profile.id)!} locale={locale}/>:copy.unavailable}</span><Link className="font-bold text-orange underline" href={`/${locale}/admin/teachers/${profile.id}`}>{copy.review}</Link></div>}
    {profile.role!=='admin'&&<div className="mt-5"><AdminForm locale={locale} operation="user" id={profile.id} fields={[{name:'status',label:copy.status,value:profile.status,options:[{value:'active',label:copy.active},{value:'suspended',label:copy.suspended}]}]}/></div>}
   </Panel>;
  })}</div><nav aria-label={ar?'صفحات الحسابات':'People pages'} className="mt-6 flex items-center justify-between gap-4"><span className="text-sm text-muted">{copy.page} {currentPage} {copy.of} {lastPage} · {total}</span><div className="flex gap-3">{currentPage>1&&<Link className="rounded-xl border border-line px-4 py-2 font-bold" href={href(currentPage-1)}>{copy.prev}</Link>}{currentPage<lastPage&&<Link className="rounded-xl border border-line px-4 py-2 font-bold" href={href(currentPage+1)}>{copy.next}</Link>}</div></nav></>:<EmptyState>{copy.noResults}</EmptyState>}
 </>;
}
