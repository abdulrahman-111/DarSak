import 'server-only';
import { redirect } from 'next/navigation';
import { createClient,isConfigured } from '@/lib/supabase/server';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { idSchema,type Locale } from './domain';
import { catalogue, publicGroupDetail, publicGroups, publicTeachers } from '@/features/platform/data';
import { normalizeDiscoveryFilters } from '@/features/platform/discovery-domain';
export type Named={id:string;name_ar:string;name_en:string;parent_id?:string|null};
export type Teacher={id:string;full_name:string;headline:string;bio:string};
export type Group={id:string;teacher_id:string;name:string;description:string;capacity:number;status:string;location:string;available_seats?:number;accepted_count?:number;next_lesson_at?:string|null;offering:{id:string;subject:Named;node:Named}|null};
export type Slot={id:string;group_id:string;weekday:number;start_time:string;end_time:string;timezone:string};
export type Enrollment={id:string;group_id:string;status:string;group:Group|null};
export type Lesson={id:string;group_id:string;title:string;starts_at:string;ends_at:string;status:string;notes:string};
export type Material={id:string;lesson_id:string;kind:string;title:string;url:string|null;content:string|null;storage_path:string|null};
const groupFields='id,teacher_id,name,description,capacity,status,location,offering:offerings(id,subject:subjects(id,name_ar,name_en),node:education_nodes(id,name_ar,name_en))';
export async function viewer(){if(!isConfigured())return null;const {db,user,profile}=await getRequestViewer();return user&&profile?{db,id:user.id,role:profile.role as string,status:profile.status as string}:null}
export async function student(locale:Locale){const me=await viewer();if(!me)redirect(`/${locale}/login`);if(me.role!=='student'||me.status!=='active')redirect(`/${locale}/dashboard`);return me}
export async function discovery(filters:{subject?:string;education?:string;teacher?:string;page?:number}={}){
 const [groups,catalogueResult,teacherResult]=await Promise.all([
  publicGroups(normalizeDiscoveryFilters({subject_id:filters.subject, node_id:filters.education, teacher_id:filters.teacher, page:String(filters.page||1)})),
  catalogue(),
  publicTeachers(),
 ]);
 return {groups:groups.data.slice(0,12) as unknown as Group[],subjects:catalogueResult.subjects as Named[],nodes:catalogueResult.nodes as Named[],teachers:teacherResult.data as Teacher[],error:!!(groups.error||catalogueResult.error||teacherResult.error),more:groups.data.length>12};
}
export async function classDetail(id:string){
 if(!idSchema.safeParse(id).success)return null;

 // Public visitors must use the narrow projection. Reading `groups` directly can
 // invoke policies that depend on private profile data, which anonymous users
 // cannot access.
 const {db,user}=await getRequestViewer();
 const publicDetail=await publicGroupDetail(id);
 if(publicDetail.error)throw new Error('Class lookup failed');
 const visibleGroup=publicDetail.data;

 // Authenticated students with historical membership, group owners, and admins
 // may still have RLS access to a group that is no longer in public discovery.
 // Let those existing policies decide whether the fallback row is visible.
 let groupRow:Group|null=null;
 if(!visibleGroup&&user){
  const {data,error}=await db.from('groups').select(groupFields).eq('id',id).maybeSingle();
  if(error)throw new Error('Class lookup failed');
  groupRow=data as unknown as Group|null;
 }
 const base=visibleGroup??groupRow;
 if(!base)return null;

 const [teachers,slots]=await Promise.all([
  publicTeachers(),
  db.from('group_schedule_slots').select('*').eq('group_id',id).order('weekday').order('start_time'),
 ]);
 if(teachers.error||slots.error)throw new Error('Class lookup failed');
 const merged:Group={...base,available_seats:visibleGroup?.available_seats,accepted_count:visibleGroup?.accepted_count,next_lesson_at:visibleGroup?.next_lesson_at,offering:(visibleGroup?.offering as unknown as Group['offering'])??groupRow?.offering??null};
 return {group:merged,teacher:((teachers.data||[]) as Teacher[]).find(t=>t.id===merged.teacher_id),slots:(slots.data||[]) as Slot[],publiclyEligible:!!visibleGroup};
}
export async function enrollmentForGroup(id:string){const me=await viewer();if(!me||me.role!=='student')return null;const {data,error}=await me.db.from('enrollments').select('id,status').eq('group_id',id).eq('student_id',me.id).maybeSingle();if(error)throw new Error('Enrollment lookup failed');return data as {id:string;status:string}|null}
export async function learning(locale:Locale){const me=await student(locale);const enrollments=await me.db.from('enrollments').select(`id,group_id,status,group:groups(${groupFields})`).eq('student_id',me.id).order('updated_at',{ascending:false});const rows=(enrollments.data||[]) as unknown as Enrollment[];const ids=rows.filter(e=>e.status==='accepted').map(e=>e.group_id);if(!ids.length)return {enrollments:rows,lessons:[] as Lesson[],slots:[] as Slot[],error:!!enrollments.error};const [lessons,slots]=await Promise.all([me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,notes').in('group_id',ids).order('starts_at').limit(500),me.db.from('group_schedule_slots').select('*').in('group_id',ids).order('weekday').order('start_time')]);return {enrollments:rows,lessons:(lessons.data||[]) as Lesson[],slots:(slots.data||[]) as Slot[],error:!!(enrollments.error||lessons.error||slots.error)}}
export async function lessonDetail(locale:Locale,id:string){const me=await student(locale);if(!idSchema.safeParse(id).success)return null;const lesson=await me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,notes').eq('id',id).maybeSingle();if(lesson.error)throw new Error('Lesson lookup failed');if(!lesson.data)return null;const membership=await me.db.from('enrollments').select('id').eq('student_id',me.id).eq('group_id',lesson.data.group_id).eq('status','accepted').maybeSingle();if(membership.error||!membership.data)return null;const materials=await me.db.from('lesson_materials').select('id,lesson_id,kind,title,url,content,storage_path').eq('lesson_id',id).order('created_at');return {lesson:lesson.data as Lesson,materials:(materials.data||[]) as Material[],error:!!materials.error}}
