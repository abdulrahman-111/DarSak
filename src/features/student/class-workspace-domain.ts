import type {GroupLearningDetails} from '@/features/teacher/group-learning-domain';
export const CLASS_VIEWS=['overview','lessons','materials','teacher','progress'] as const;
export type ClassView=typeof CLASS_VIEWS[number];
export function classView(value:unknown):ClassView{return CLASS_VIEWS.includes(value as ClassView)?value as ClassView:'overview';}
export function classPage(value:unknown):number{const n=Number(value??1);return Number.isSafeInteger(n)&&n>0?Math.min(n,50000):1;}
export function classLessonView(value:unknown){return value==='history'?'history':'upcoming';}
export type StudentClassDetail={id:string;name:string;description:string;status:string;location:string|null;teacher_id:string;teacher_name:string;teacher_headline:string;teacher_available:boolean;enrollment_id:string;subject:{name_en:string;name_ar:string};category:{name_en:string;name_ar:string};learning:GroupLearningDetails|null;attendance:{present:number;late:number;absent:number;excused:number}};
export function parseClassDetail(value:unknown):StudentClassDetail|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as StudentClassDetail;
 return typeof v.id==='string'&&typeof v.name==='string'&&typeof v.teacher_id==='string'&&typeof v.enrollment_id==='string'&&!!v.subject&&!!v.category&&!!v.attendance?v:null;
}
export function classHref(locale:string,id:string,view:ClassView='overview'){return `/${locale}/student/classes/${id}${view==='overview'?'':`?view=${view}`}`;}
