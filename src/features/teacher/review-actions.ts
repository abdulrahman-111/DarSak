'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { parseTeacherReviewStatus } from './review-data';

export type TeacherReviewActionState={error?:string;success?:string}|null;
const message=(locale:Locale,en:string,ar:string)=>locale==='ar'?ar:en;

export async function requestTeacherReview(locale:Locale,_previous:TeacherReviewActionState,_form:FormData):Promise<TeacherReviewActionState>{
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return {error:message(locale,'Sign in as an active teacher to request a review.','سجل الدخول بحساب معلم نشط لطلب المراجعة.')};
 const {data:profile,error:profileError}=await db.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
 if(profileError||profile?.role!=='teacher'||profile.status!=='active')return {error:message(locale,'Only an active teacher can request a review.','يمكن للمعلم النشط فقط طلب المراجعة.')};
 const {data:current,error:statusError}=await db.rpc('teacher_review_status',{p_teacher_id:user.id});
 const status=parseTeacherReviewStatus(current);
 if(statusError||!status)return {error:message(locale,'Could not load your review status. Refresh and try again.','تعذر تحميل حالة المراجعة. حدّث الصفحة وحاول مرة أخرى.')};
 if(status.status==='pending')return {success:message(locale,'Your request is already awaiting review.','طلبك بانتظار المراجعة بالفعل.')};
 if(status.status==='approved')return {error:message(locale,'Your teacher account is already approved.','حسابك معتمد بالفعل.')};
 const {error}=await db.rpc('request_teacher_review');
 if(error){const raw=error.message.toLowerCase();return {error:raw.includes('suspend')||raw.includes('active')?message(locale,'An active teacher account is required. Refresh your account status and try again.','يلزم حساب معلم نشط. حدّث حالة الحساب وحاول مرة أخرى.'):message(locale,'The request could not be sent. Refresh and try again.','تعذر إرسال الطلب. حدّث الصفحة وحاول مرة أخرى.')};}
 for(const currentLocale of ['en','ar']){revalidatePath(`/${currentLocale}/teacher`,'layout');revalidatePath(`/${currentLocale}/admin/teachers`);revalidatePath(`/${currentLocale}/admin`);}
 return {success:message(locale,'Your review request was submitted.','تم إرسال طلب المراجعة.')};
}
