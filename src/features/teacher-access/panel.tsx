import Link from 'next/link';
import { Panel } from '@/components/platform/ui';
import type { TeacherAccessStatus } from './domain';
import { cairoDateTime } from './domain';
export function TeacherAccessPanel({locale,status,error,compact=false}:{locale:string;status:TeacherAccessStatus|null;error:boolean;compact?:boolean}){
 const ar=locale==='ar';
 if(error||!status)return <Panel className={compact?'mb-4':''}><h2 className="font-black text-teal">{ar?'صلاحية التدريس':'Teaching access'}</h2><p role="alert" className="mt-2 text-sm text-red-800">{ar?'تعذر تحميل حالة صلاحية التدريس. حدّث الصفحة وحاول مرة أخرى.':'Could not load teaching access. Refresh and try again.'}</p><Link href={`/${locale}/account/teaching-access?retry=1`} className="mt-2 inline-flex font-bold text-orange underline">{ar?'إعادة المحاولة':'Try again'}</Link></Panel>;
 const until=cairoDateTime(status.expires_at,locale);
 if(compact&&status.has_access&&!status.can_renew&&!status.pending_request_id)return <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-white px-4 py-2 text-sm"><span className="font-bold text-teal">{ar?'صلاحية التدريس فعالة':'Teaching access is active'}</span>{until&&<span className="text-muted">{ar?'تنتهي في':'Expires'} <time dir="auto">{until}</time></span>}<Link href={`/${locale}/account/teaching-access`} className="font-bold text-teal underline">{ar?'إدارة الوصول':'Manage access'}</Link></div>;
 return <Panel className={compact?'mb-4':''}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black text-teal">{status.has_access?(ar?'صلاحية التدريس فعالة':'Teaching access is active'):(ar?'صلاحية التدريس منتهية':'Teaching access has expired')}</h2><Link href={`/${locale}/account/teaching-access`} className="font-bold text-teal underline">{ar?'إدارة الوصول':'Manage access'}</Link></div>
 {status.has_access&&until&&<p className="mt-2 text-sm text-muted">{ar?'تنتهي في':'Expires'} <time dir="auto">{until}</time> {ar?'بتوقيت القاهرة':'Africa/Cairo'}.</p>}
 </Panel>;
}
