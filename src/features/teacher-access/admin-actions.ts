'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { flushEmailOutbox } from '@/features/email/worker';
import { createClient } from '@/lib/supabase/server';
import { cairoLocalToIso } from './domain';
import { idSchema } from '@/features/student/domain';
type State={error?:string;success?:string}|null;
const msg=(locale:string,en:string,ar:string)=>locale==='ar'?ar:en;
async function admin(locale:string){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return null;const {data:p}=await db.from('profiles').select('role,status').eq('id',user.id).maybeSingle();return p?.role==='admin'&&p.status==='active'?db:null;}
export async function decideTeacherAccess(locale:string,_state:State,form:FormData):Promise<State>{
 if(locale!=='en'&&locale!=='ar')return {error:'Unsupported language.'};
 const db=await admin(locale);if(!db)return {error:msg(locale,'An active administrator account is required.','يلزم حساب مسؤول نشط.')};
 const id=form.get('request_id'), decision=form.get('decision');if(typeof id!=='string'||!idSchema.safeParse(id).success||!['approve','decline'].includes(String(decision)))return {error:msg(locale,'Invalid access request. Refresh and try again.','طلب الصلاحية غير صالح. حدّث الصفحة وحاول مرة أخرى.')};
 const {error}=await db.rpc('decide_teacher_access_request',{p_request_id:id,p_approve:decision==='approve'});if(error){if(error.code==='PT409')return {error:msg(locale,'This request has already been reviewed. Refresh the page to see the saved decision.','تمت مراجعة هذا الطلب بالفعل. حدّث الصفحة لعرض القرار المحفوظ.')};return {error:msg(locale,'Could not save the review decision. Refresh and try again.','تعذر حفظ قرار المراجعة. حدّث الصفحة وحاول مرة أخرى.')}};
 if(decision==='approve')after(async()=>{try{await flushEmailOutbox(1);}catch{/* Transactional outbox recovery handles delivery. */}});
 revalidatePath(`/${locale}/admin/access`);revalidatePath(`/${locale}/teacher/access`);return {success:msg(locale,'Decision saved.','تم حفظ القرار.')};
}
export async function saveTeacherFeePolicy(locale:string,_state:State,form:FormData):Promise<State>{
 if(locale!=='en'&&locale!=='ar')return {error:'Unsupported language.'};
 const db=await admin(locale);if(!db)return {error:msg(locale,'An active administrator account is required.','يلزم حساب مسؤول نشط.')};
 const enabled=form.get('enabled')==='true',confirmed=form.get('confirm')==='on';if(!confirmed)return {error:msg(locale,'Confirm the policy change before saving.','أكد تغيير السياسة قبل الحفظ.')};
 const effectiveLocal=form.get('effective_at'),en=form.get('announcement_en'),ar=form.get('announcement_ar');
 const effective=typeof effectiveLocal==='string'?cairoLocalToIso(effectiveLocal):null;
 if(enabled&&(!effective||!en||!ar||typeof en!=='string'||typeof ar!=='string'||!en.trim()||!ar.trim()||en.length>1000||ar.length>1000||Date.parse(effective)<=Date.now()))return {error:msg(locale,'Enabling fees needs a future Cairo date and announcements up to 1,000 characters in both languages.','يتطلب تفعيل الرسوم تاريخاً مستقبلياً بتوقيت القاهرة وإعلاناً باللغتين لا يتجاوز ١٠٠٠ حرف.')};
 const {error}=await db.rpc('set_teacher_access_fee_policy',{p_enabled:enabled,p_effective_at:enabled?effective:null,p_announcement_en:enabled?(en as string).trim():null,p_announcement_ar:enabled?(ar as string).trim():null,p_confirm:true});
 if(error)return {error:msg(locale,'Could not save the fee policy. Refresh and try again.','تعذر حفظ سياسة الرسوم. حدّث الصفحة وحاول مرة أخرى.')};
 if(enabled)after(async()=>{try{await flushEmailOutbox(1);}catch{/* Transactional outbox recovery handles delivery. */}});
 revalidatePath(`/${locale}/admin/access`);return {success:msg(locale,'Fee policy saved. No charges are collected by this setting.','تم حفظ سياسة الرسوم. لا تُحصّل هذه السياسة أي مبالغ.')};
}
