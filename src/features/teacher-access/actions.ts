'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseRenewalResult } from './domain';
import type { Locale } from '@/features/student/domain';
export type AccessActionState={error?:string;success?:string}|null;
const msg=(l:Locale,en:string,ar:string)=>l==='ar'?ar:en;
export async function renewTeacherAccess(locale:Locale,_state:AccessActionState,_form:FormData):Promise<AccessActionState>{
 if(locale!=='en'&&locale!=='ar')return {error:'Unsupported language.'};
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return {error:msg(locale,'Sign in to continue.','سجل الدخول للمتابعة.')};
 const {data:profile}=await db.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
 if(profile?.role!=='teacher'||profile.status!=='active')return {error:msg(locale,'An active teacher account is required.','يلزم حساب معلم نشط.')};
 const result=await db.rpc('renew_teacher_access');const parsed=result.error?null:parseRenewalResult(result.data);
 if(!parsed)return {error:msg(locale,'Could not process renewal. Refresh and try again.','تعذرت معالجة التجديد. حدّث الصفحة وحاول مرة أخرى.')};
 const success=parsed.outcome==='renewed'?msg(locale,'Teaching access renewed.','تم تجديد صلاحية التدريس.'):
  parsed.outcome==='requested'?(parsed.access.has_access?msg(locale,'Your request is awaiting review. Your current access remains active.','طلبك بانتظار المراجعة. وتظل صلاحيتك الحالية فعالة.'):msg(locale,'Your renewal request is awaiting review. Teaching remains paused until access is approved.','طلب التجديد بانتظار المراجعة. يظل التدريس متوقفاً حتى اعتماد الصلاحية.')):
  parsed.outcome==='pending'?msg(locale,'A renewal request is already awaiting review.','طلب التجديد بانتظار المراجعة بالفعل.'):
  msg(locale,'Renewal opens seven Cairo calendar days before expiry.','يفتح التجديد قبل انتهاء الصلاحية بسبعة أيام حسب توقيت القاهرة.');
 for(const l of ['en','ar']){revalidatePath(`/${l}/teacher/access`);revalidatePath(`/${l}/teacher`,'layout');}
 return {success};
}
