'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { words } from './labels';
import { nodeSchema,subjectSchema,offeringSchema,userSchema,validHierarchy,canManageUser,safeSetting,type Node } from './domain';
export type AdminState={error?:string;success?:string}|null;
export async function adminAction(locale:string,operation:string,_state:AdminState,form:FormData):Promise<AdminState>{
 const l=locale==='ar'?'ar':'en',t=words(l);const db=await createClient();
 try{
 const {data:{user}}=await db.auth.getUser();if(!user)return {error:t.denied};
 const {data:actor}=await db.from('profiles').select('role,status').eq('id',user.id).single();if(actor?.role!=='admin'||actor.status!=='active')return {error:t.denied};
 const value=(key:string)=>String(form.get(key)||'');const id=value('id');let result:{error:unknown}|undefined;
 if(operation==='user'){
 const payload=userSchema.parse({id,status:value('status'),approved:form.has('approved')?value('approved')==='true':undefined});
 const {data:target}=await db.from('profiles').select('id,role').eq('id',id).single();if(!target||!canManageUser(user.id,target))return {error:t.self};
 result=await db.rpc('admin_update_user',{p_user_id:payload.id,p_status:payload.status,p_approved:target.role==='teacher'?payload.approved??null:null});
 }else if(operation==='node'){
 const payload=nodeSchema.parse({...Object.fromEntries(form),id:id||undefined,parent_id:value('parent_id')||null});
 const {data:nodes,error}=await db.from('education_nodes').select('*');if(error)return {error:t.failed};if(!validHierarchy(payload as Node,(nodes||[]) as Node[]))return {error:t.blocked};
 result=id?await db.from('education_nodes').update(payload).eq('id',id).select('id').single():await db.from('education_nodes').insert(payload).select('id').single();
 }else if(operation==='subject'){
 const payload=subjectSchema.parse({...Object.fromEntries(form),id:id||undefined});
 result=id?await db.from('subjects').update(payload).eq('id',id).select('id').single():await db.from('subjects').insert(payload).select('id').single();
 }else if(operation==='offering'){
 const payload=offeringSchema.parse({...Object.fromEntries(form),id:id||undefined});
 result=id?await db.from('offerings').update(payload).eq('id',id).select('id').single():await db.from('offerings').insert(payload).select('id').single();
 }else if(operation.startsWith('delete-')){
 if(value('confirm')!=='yes')return {error:t.invalid};const table={'delete-node':'education_nodes','delete-subject':'subjects','delete-offering':'offerings'}[operation];if(!table)return {error:t.invalid};z.uuid().parse(id);result=await db.from(table).delete().eq('id',id).select('id').single();
 }else if(operation==='group'){
 z.uuid().parse(id);const status=z.enum(['draft','published','archived']).parse(value('status'));result=await db.from('groups').update({status}).eq('id',id).select('id').single();
 }else if(operation==='report'){
 z.uuid().parse(id);const status=z.enum(['open','resolved']).parse(value('status'));const admin_note=z.string().trim().max(3000).parse(value('admin_note'));result=await db.from('reports').update({status,admin_note}).eq('id',id).select('id').single();
 }else if(operation==='setting'){
 const key=z.string().regex(/^[a-z][a-z0-9_]{1,79}$/).parse(value('key'));const parsed=safeSetting(value('value'));result=await db.from('platform_settings').upsert({key,value:parsed}).select('key').single();
 }else return {error:t.invalid};
 if(result?.error)return {error:t.error};revalidatePath(`/${l}/admin`,'layout');return {success:t.saved};
 }catch(error){return {error:error instanceof z.ZodError||error instanceof SyntaxError?t.invalid:t.error};}
}
