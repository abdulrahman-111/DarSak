import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { TeacherReviewPanel } from '@/features/teacher/review-panel';
import { parseTeacherReviewStatus } from '@/features/teacher/review-data';
import { unreadNotificationCount } from '@/features/notifications/data';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { TeacherAccessPanel } from '@/features/teacher-access/panel';
import { parseTeacherApplicationReadResponse } from '@/features/teacher/application-domain';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';
export const maxDuration = 40;

export default async function TeacherLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params; const locale = ensureLocale(raw); const me = await requireViewer(locale, 'teacher');
  const [result,unreadCount,access,applicationResult]=await Promise.all([me.db.rpc('teacher_review_status',{p_teacher_id:me.id}),unreadNotificationCount(me.db),readTeacherAccessStatus(me.db),me.db.rpc('read_teacher_application',{p_teacher_id:me.id})]);
  const status=result.error?null:parseTeacherReviewStatus(result.data);
  const applicationStatus=applicationResult.error?null:parseTeacherApplicationReadResponse(applicationResult.data).application?.status??null;
  return <PlatformShell locale={locale} role="teacher" name={me.fullName} unreadCount={unreadCount}><TeacherSubscriptionNotice locale={locale}/><TeacherAccessPanel locale={locale} status={access.status} error={access.error} compact/><TeacherReviewPanel locale={locale} status={status} applicationStatus={applicationStatus} error={result.error?.message||(!status?'unavailable':null)}/>{children}</PlatformShell>;
}
