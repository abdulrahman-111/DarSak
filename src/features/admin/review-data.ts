export type AdminTeacherReviewRow={teacher_id:string;full_name:string;headline:string|null;account_status:'active'|'suspended';status:'pending'|'approved'|'declined';request_id:string|null;requested_at:string;reviewed_at:string|null};
export type ReviewPage={rows:AdminTeacherReviewRow[];total:number;error:string|null};

export function normalizeReviewPage(value:unknown):{rows:AdminTeacherReviewRow[];total:number}|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as {rows?:unknown;total?:unknown};
 if(!Array.isArray(raw.rows)||typeof raw.total!=='number'||!Number.isSafeInteger(raw.total)||raw.total<0)return null;
 const rows=raw.rows.filter((row):row is AdminTeacherReviewRow=>{
  if(!row||typeof row!=='object')return false;const item=row as Record<string,unknown>;
  return typeof item.teacher_id==='string'&&typeof item.full_name==='string'&&['pending','approved','declined'].includes(String(item.status))&&typeof item.requested_at==='string';
 });
 if(rows.length!==raw.rows.length)return null;
 return {rows,total:raw.total};
}

export async function adminTeacherReviews(db:any,filters:{status:string;query:string;offset:number;limit:number}):Promise<ReviewPage>{
 const {data,error}=await db.rpc('admin_teacher_reviews',{p_status:filters.status,p_query:filters.query,p_offset:filters.offset,p_limit:filters.limit});
 if(error)return {rows:[],total:0,error:error.message};
 const normalized=normalizeReviewPage(data);
 return normalized?{...normalized,error:null}:{rows:[],total:0,error:'invalid review response'};
}

export function safeStatus(value:string){return ['active','suspended','all'].includes(value)?value:'all';}
export function safeRole(value:string){return ['teacher','student','admin','all'].includes(value)?value:'all';}
export function pageOffset(pageValue:string|undefined,pageSize:number){const value=Number(pageValue||'1');return Number.isInteger(value)&&value>=1&&value<=100000?(value-1)*pageSize:0;}
