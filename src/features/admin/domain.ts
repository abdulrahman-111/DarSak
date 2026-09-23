import { z } from 'zod';
export const nodeKinds = ['system','level','grade','university','faculty','department','year'] as const;
export const nodeSchema=z.object({id:z.uuid().optional(),name_ar:z.string().trim().min(1).max(150),name_en:z.string().trim().min(1).max(150),slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),kind:z.enum(nodeKinds),parent_id:z.uuid().nullable()});
export const subjectSchema=nodeSchema.pick({id:true,name_ar:true,name_en:true,slug:true});
export const offeringSchema=z.object({id:z.uuid().optional(),node_id:z.uuid(),subject_id:z.uuid()});
export const userSchema=z.object({id:z.uuid(),status:z.enum(['active','suspended']),approved:z.boolean().optional()});
export type Node={id:string;parent_id:string|null;kind:string;name_ar:string;name_en:string;slug:string};
export function validHierarchy(node:{id?:string;kind:string;parent_id:string|null},nodes:Node[]){
 if(node.kind==='system') return node.parent_id===null;
 const parent=nodes.find(n=>n.id===node.parent_id); if(!parent)return false;
 const allowed:Record<string,string[]>={level:['system'],grade:['level'],university:['system'],faculty:['university'],department:['faculty'],year:['university','faculty','department']};
 if(!allowed[node.kind]?.includes(parent.kind))return false;
 const seen=new Set<string>(node.id?[node.id]:[]);let cursor:Node|undefined=parent;
 while(cursor){if(seen.has(cursor.id))return false;seen.add(cursor.id);cursor=nodes.find(n=>n.id===cursor?.parent_id);}return true;
}
export function canManageUser(actorId:string,target:{id:string;role:string}){return actorId!==target.id&&target.role!=='admin';}
export function safeSetting(value:string){if(value.length>20000)throw new Error('large');return JSON.parse(value) as unknown;}
