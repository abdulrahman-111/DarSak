import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import { ReviewDecisionForm } from '@/features/admin/review-form';
import { idSchema } from '@/features/student/domain';
import { teacherReviewListSchema } from '@/features/admin/domain';
import { richProfileSchema, localizedProfileText } from '@/features/teacher/profile-details-domain';

type ReviewStatus={teacher_id:string;status:'pending'|'approved'|'declined';request_id:string|null;requested_at:string;reviewed_at:string|null;decline_reason:string|null;events:Array<{id:string;kind:string;reason:string|null;created_at:string}>};
function readStatus(value:unknown):ReviewStatus|null{
 if(!value||typeof value!=='object')return null;const data=value as Record<string,unknown>;
 if(typeof data.teacher_id!=='string'||!['pending','approved','declined'].includes(String(data.status))||typeof data.requested_at!=='string'||!Array.isArray(data.events))return null;
 return data as ReviewStatus;
}

export default async function AdminTeacherReviewDetail({params,searchParams}:{params:Promise<{locale:string;id:string}>;searchParams:Promise<{q?:string;status?:string;page?:string}>}){
 const [{locale:raw,id},query]=await Promise.all([params,searchParams]),locale=ensureLocale(raw),ar=locale==='ar';if(!idSchema.safeParse(id).success)notFound();
 const me=await requireViewer(locale,'admin');
 const listFilters=teacherReviewListSchema.safeParse({query:typeof query.q==='string'?query.q:'',status:query.status,offset:((typeof query.page==='string'&&/^[1-9]\d{0,5}$/.test(query.page)?Number(query.page):1)-1)*30,limit:30});
 const preserved=listFilters.success?listFilters.data:{query:'',status:'pending' as const,offset:0,limit:30};
 const backParams=new URLSearchParams();if(preserved.query)backParams.set('q',preserved.query);backParams.set('status',preserved.status);if(preserved.offset>0)backParams.set('page',String(Math.floor(preserved.offset/30)+1));
 const backHref=`/${locale}/admin/teachers?${backParams}`;
 const [profile,teacher,reviewResult,specializations]=await Promise.all([
  me.db.from('profiles').select('id,full_name,status').eq('id',id).maybeSingle(),
  me.db.from('teacher_profiles').select('headline,bio,approved').eq('id',id).maybeSingle(),
  me.db.rpc('teacher_review_status',{p_teacher_id:id}),
  me.db.from('teacher_specializations').select('offering_id').eq('teacher_id',id),
 ]);
 if(profile.error||teacher.error){
  const copy=ar
   ?{title:'تعذر تحميل مراجعة المعلم',error:'تعذر تحميل بيانات الحساب والملف التعريفي. حاول إعادة تحميل الصفحة.',back:'العودة إلى الطلبات',retry:'إعادة المحاولة'}
   :{title:'Teacher review could not be loaded',error:'The account and profile could not be loaded. Refresh and try again.',back:'Back to requests',retry:'Retry'};
  return <><ScreenTitle eyebrow={ar?'مراجعة المعلم':'Teacher review'} title={copy.title} action={<Link href={backHref} className="rounded-xl border border-line px-4 py-2 font-bold text-teal">{copy.back}</Link>}/><Panel><p role="alert" className="text-red-800">{copy.error}</p><form action={`/${locale}/admin/teachers/${encodeURIComponent(id)}`} method="get" className="mt-4"><input type="hidden" name="q" value={preserved.query}/><input type="hidden" name="status" value={preserved.status}/>{preserved.offset>0&&<input type="hidden" name="page" value={Math.floor(preserved.offset/30)+1}/>}<button type="submit" className="min-h-11 touch-manipulation rounded-xl bg-teal px-4 py-2 font-bold text-white">{copy.retry}</button></form></Panel></>;
 }
 if(!profile.data||!teacher.data)notFound();
 const review=readStatus(reviewResult.data);
 const ids=(specializations.data||[]).map(row=>row.offering_id);
 const offerings=ids.length?await me.db.from('offerings').select('id,node_id,subject_id').in('id',ids):{data:[],error:null};
 const subjectIds=[...new Set((offerings.data||[]).map(row=>row.subject_id))],nodeIds=[...new Set((offerings.data||[]).map(row=>row.node_id))];
 const [subjects,nodes,detailsResult]=await Promise.all([
  subjectIds.length?me.db.from('subjects').select('id,name_ar,name_en').in('id',subjectIds):Promise.resolve({data:[],error:null}),
  nodeIds.length?me.db.from('education_nodes').select('id,parent_id,name_ar,name_en').in('id',nodeIds):Promise.resolve({data:[],error:null}),
  me.db.from('teacher_profile_details').select('details').eq('teacher_id',id).maybeSingle(),
 ]);
 const failed=profile.error||teacher.error||reviewResult.error||specializations.error||offerings.error||subjects.error||nodes.error||detailsResult.error;
 const details=detailsResult.data?richProfileSchema.safeParse(detailsResult.data.details):null;
 const text=ar?{back:'العودة إلى الطلبات',eyebrow:'مراجعة المعلم',account:'حالة الحساب',status:'حالة المراجعة',requested:'تاريخ الطلب',reviewed:'تاريخ القرار',headline:'العنوان التعريفي',bio:'نبذة سابقة',specializations:'المواد والسياقات',profile:'الملف التعريفي',missing:'معلومات إعداد غير مكتملة',missingHeadline:'لا يوجد عنوان تعريفي بعد.',missingSpecialization:'لم يحدد المعلم مواد أو سياقات بعد.',missingDetails:'لم تكتمل التفاصيل الاختيارية للملف.',about:'نبذة',qualifications:'المؤهلات التي ذكرها المعلم',experience:'الخبرة التي ذكرها المعلم',approach:'أسلوب التدريس',goals:'الأهداف',languages:'اللغات',decision:'قرار المراجعة',history:'سجل الطلبات والقرارات',retry:'أعد تحميل الصفحة لمراجعة الحالة الحالية.',error:'تعذر تحميل بعض معلومات المراجعة. حاول إعادة تحميل الصفحة.',noHistory:'لا يوجد سجل سابق.',noSpecializations:'لم تُضف مواد بعد.'}:{back:'Back to requests',eyebrow:'Teacher review',account:'Account status',status:'Review status',requested:'Requested',reviewed:'Decision date',headline:'Headline',bio:'Previous bio',specializations:'Subjects and contexts',profile:'Profile details',missing:'Setup information to consider',missingHeadline:'No headline has been added.',missingSpecialization:'No subjects or contexts have been selected.',missingDetails:'Optional profile details are incomplete.',about:'About',qualifications:'Self-reported qualifications',experience:'Self-reported experience',approach:'Teaching approach',goals:'Goals',languages:'Languages',decision:'Review decision',history:'Request and decision history',retry:'Refresh this page to see the current status.',error:'Some review details could not be loaded. Refresh and try again.',noHistory:'No previous history.',noSpecializations:'No subjects have been added.'};
 const subjectRows=subjects.data||[],nodeRows=nodes.data||[];
 const labels=(offerings.data||[]).map(offering=>{
  const subject=subjectRows.find(row=>row.id===offering.subject_id),node=nodeRows.find(row=>row.id===offering.node_id);
  const trail:string[]=[];let cursor=node;const visited=new Set<string>();while(cursor&&!visited.has(cursor.id)){visited.add(cursor.id);trail.unshift(ar?cursor.name_ar:cursor.name_en);cursor=cursor.parent_id?nodeRows.find(row=>row.id===cursor?.parent_id):undefined;}
  return [subject&&(ar?subject.name_ar:subject.name_en),trail.join(' › ')].filter(Boolean).join(' · ');
 }).filter(Boolean);
 return <><ScreenTitle eyebrow={text.eyebrow} title={profile.data.full_name} description={teacher.data.headline||undefined} action={<Link href={backHref} className="rounded-xl border border-line px-4 py-2 font-bold text-teal">{text.back}</Link>}/>
  {failed?<Panel className="mb-5"><p role="alert" className="text-red-800">{text.error}</p></Panel>:null}
  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.9fr)]">
   <div className="grid content-start gap-5">
    <Panel><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-black text-teal">{text.status}</h2>{review&&<Status value={review.status} locale={locale}/>}</div><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted">{text.account}</dt><dd className="mt-1"><Status value={profile.data.status} locale={locale}/></dd></div><div><dt className="text-sm text-muted">{text.requested}</dt><dd className="mt-1 font-semibold">{review?cairoDate(review.requested_at,locale):'—'}</dd></div><div><dt className="text-sm text-muted">{text.reviewed}</dt><dd className="mt-1 font-semibold">{review?.reviewed_at?cairoDate(review.reviewed_at,locale):'—'}</dd></div></dl>
     {review?.status==='declined'&&review.decline_reason&&<div className="mt-4 rounded-xl bg-red-50 p-4"><h3 className="font-bold text-red-900">{ar?'سبب الرفض':'Decline reason'}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-red-900">{review.decline_reason}</p></div>}
    </Panel>
    <Panel><h2 className="text-xl font-black text-teal">{text.profile}</h2><div className="mt-4 grid gap-4"><div><h3 className="font-bold">{text.headline}</h3><p className="mt-1 text-sm text-muted">{teacher.data.headline||'—'}</p></div>{teacher.data.bio&&<div><h3 className="font-bold">{text.bio}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{teacher.data.bio}</p></div>}<div><h3 className="font-bold">{text.specializations}</h3>{labels.length?<ul className="mt-2 flex flex-wrap gap-2">{labels.map((label,index)=><li key={`${label}-${index}`} className="rounded-lg bg-cream px-3 py-2 text-sm">{label}</li>)}</ul>:<p className="mt-1 text-sm text-muted">{text.noSpecializations}</p>}</div>
     {details?.success&&<>{(['about','approach','goals'] as const).map(key=>{const label=({about:text.about,approach:text.approach,goals:text.goals})[key],value=localizedProfileText(details.data[key],locale);return value?<div key={key}><h3 className="font-bold">{label}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{value}</p></div>:null;})}
      {(['qualifications','experience'] as const).map(key=>details.data[key].length?<div key={key}><h3 className="font-bold">{key==='qualifications'?text.qualifications:text.experience}</h3><ul className="mt-2 grid gap-2">{details.data[key].map(entry=><li key={entry.id} className="rounded-xl bg-cream p-3"><strong>{localizedProfileText(entry.title,locale)}</strong>{localizedProfileText(entry.organization,locale)&&<span className="text-muted"> · {localizedProfileText(entry.organization,locale)}</span>}<p className="mt-1 whitespace-pre-wrap text-sm text-muted">{localizedProfileText(entry.description,locale)}</p></li>)}</ul></div>:null)}
      {details.data.languages.length>0&&<div><h3 className="font-bold">{text.languages}</h3><p className="mt-1 text-sm text-muted">{details.data.languages.join(' · ')}</p></div>}</>}
    </div></Panel>
    <Panel><h2 className="text-xl font-black text-teal">{text.missing}</h2><ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted">{!teacher.data.headline&&<li>{text.missingHeadline}</li>}{labels.length===0&&<li>{text.missingSpecialization}</li>}{!details?.success&&<li>{text.missingDetails}</li>}</ul></Panel>
   </div>
   <aside className="grid content-start gap-5"><Panel><h2 className="mb-4 text-xl font-black text-teal">{text.decision}</h2>{review?.status==='pending'&&review.request_id?<ReviewDecisionForm locale={locale} teacherId={id} requestId={review.request_id}/>:<p className="text-sm text-muted">{text.retry}</p>}</Panel>
    <Panel><h2 className="text-xl font-black text-teal">{text.history}</h2>{review?.events.length?<ol className="mt-4 grid gap-4">{review.events.map(event=><li key={event.id} className="border-s-2 border-line ps-3"><div className="flex flex-wrap justify-between gap-2"><Status value={event.kind} locale={locale}/><time className="text-xs text-muted">{cairoDate(event.created_at,locale)}</time></div>{event.reason&&<p className="mt-2 whitespace-pre-wrap text-sm">{event.reason}</p>}</li>)}</ol>:<p className="mt-3 text-sm text-muted">{text.noHistory}</p>}</Panel></aside>
  </div>
 </>;
}
