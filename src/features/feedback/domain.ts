import {z} from 'zod';
export const feedbackInput=z.object({rating:z.coerce.number().int().min(1).max(5),comment:z.string().trim().min(20).max(1500)});
export type FeedbackRow={id:string;group_id?:string;group_name?:string;rating:number;comment:string;reply_public?:string;reply_pending?:string;status?:string;version:number;admin_note?:string|null};
export function feedbackStatus(value:string,ar:boolean){return (ar?{pending:'بانتظار المراجعة',approved:'منشور',hidden:'غير منشور',withdrawn:'مسحوب'}:{pending:'Awaiting review',approved:'Published',hidden:'Not published',withdrawn:'Withdrawn'})[value]??value;}
