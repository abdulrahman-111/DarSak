import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { TeacherPlanPanel } from '@/features/subscriptions/panels';
import { parseTeacherPlanStatus } from '@/features/subscriptions/domain';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';
import { AccountBackLink } from '@/features/account/account-back-link';
import { AccountPageFrame } from '@/features/account/account-page-frame';
export default async function TeacherAccessPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;const locale=ensureLocale(raw),ar=locale==='ar';const me=await requireViewer(locale,'teacher');
 const result=await me.db.rpc('teacher_plan_status');
 const plan=result.error?null:parseTeacherPlanStatus(result.data);
 return <AccountPageFrame><><AccountBackLink locale={locale}/><ScreenTitle eyebrow={ar?'الحساب والصلاحية':'Account access'} title={ar?'الخطة والاستخدام':'Teaching plan and usage'} description={ar?'راجع خطتك واستخدامك الحاليين.':'Review your current plan and usage.'}/>
  <TeacherSubscriptionNotice locale={locale} signedInTeacher/>
  <TeacherPlanPanel locale={locale} status={plan} error={!!result.error||!plan}/>
  <Panel className="mt-4"><h2 className="font-black text-teal">{ar?'روابط حسابك':'Your account links'}</h2><div className="mt-3 flex flex-wrap gap-4 font-bold text-teal underline"><Link href={`/${locale}/account/profile`}>{ar?'الملف الشخصي':'Profile'}</Link><Link href={`/${locale}/notifications`}>{ar?'الإشعارات':'Notifications'}</Link><Link href={`/${locale}/teacher`}>{ar?'مساحة المعلم':'Teacher space'}</Link></div><p className="mt-3 text-sm text-muted">{ar?'حالة المراجعة وقرار الإدارة متاحان في لوحة حساب المعلم.':'Account review status and administrator decisions remain available in your teacher account panel.'}</p></Panel>
 </>
  </AccountPageFrame>;
}
