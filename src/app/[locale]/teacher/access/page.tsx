import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { cairoDateTime } from '@/features/teacher-access/domain';
import { TeacherAccessPanel } from '@/features/teacher-access/panel';
import { RenewalForm } from '@/features/teacher-access/forms';
export default async function TeacherAccessPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;const locale=ensureLocale(raw),ar=locale==='ar';const me=await requireViewer(locale,'teacher');
 const access=await readTeacherAccessStatus(me.db);
 return <><ScreenTitle eyebrow={ar?'الحساب والصلاحية':'Account access'} title={ar?'صلاحية التدريس والتجديد':'Teaching access and renewal'} description={ar?'إدارة صلاحية التدريس مع استمرار الوصول إلى حسابك وملفك ومراجعة الحساب والإشعارات.':'Manage teaching access while keeping your account, profile, review, and notifications available.'}/>
  <TeacherAccessPanel locale={locale} status={access.status} error={access.error}/>
  {access.status&&<Panel className="mt-4"><h2 className="text-lg font-black text-teal">{ar?'فترة الصلاحية':'Access period'}</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">{ar?'بدأت الصلاحية':'Access since'}</dt><dd>{cairoDateTime(access.status.starts_at,locale)??'—'} · Africa/Cairo</dd></div><div><dt className="text-muted">{ar?'تنتهي الصلاحية':'Expires'}</dt><dd>{cairoDateTime(access.status.expires_at,locale)??'—'} · Africa/Cairo</dd></div><div><dt className="text-muted">{ar?'يفتح التجديد':'Renewal opens'}</dt><dd>{cairoDateTime(access.status.renewal_opens_at,locale)??(ar?'متاح الآن':'Available now')}</dd></div></dl><div className="mt-5 border-t border-line pt-5"><RenewalForm locale={locale} canRenew={access.status.can_renew} feesEnabled={access.status.fees_enabled&&(!access.status.fee_effective_at||Date.parse(access.status.fee_effective_at)<=Date.now())} pendingRequest={!!access.status.pending_request_id} hasAccess={access.status.has_access}/></div></Panel>}
  <Panel className="mt-4"><h2 className="font-black text-teal">{ar?'روابط حسابك':'Your account links'}</h2><div className="mt-3 flex flex-wrap gap-4 font-bold text-teal underline"><Link href={`/${locale}/teacher/profile`}>{ar?'الملف الشخصي':'Profile'}</Link><Link href={`/${locale}/notifications`}>{ar?'الإشعارات':'Notifications'}</Link><Link href={`/${locale}/teacher`}>{ar?'مساحة المعلم':'Teacher space'}</Link></div><p className="mt-3 text-sm text-muted">{ar?'حالة المراجعة وقرار الإدارة متاحان في لوحة حساب المعلم.':'Account review status and administrator decisions remain available in your teacher account panel.'}</p></Panel>
 </>;
}
