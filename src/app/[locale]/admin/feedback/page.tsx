import {ensureLocale} from '@/i18n/config';
import {ManageFeedbackPage} from '@/features/feedback/manage-page';
export default async function Page({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){const [p,q]=await Promise.all([params,searchParams]);const n=Number(q.page);return <ManageFeedbackPage locale={ensureLocale(p.locale)} role="admin" page={Number.isSafeInteger(n)&&n>0?n:1}/>;}
