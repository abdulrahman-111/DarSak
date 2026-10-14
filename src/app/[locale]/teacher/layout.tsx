import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { TeacherReviewPanel } from '@/features/teacher/review-panel';
import { parseTeacherReviewStatus } from '@/features/teacher/review-data';
import { unreadNotificationCount } from '@/features/notifications/data';

export default async function TeacherLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params; const locale = ensureLocale(raw); const me = await requireViewer(locale, 'teacher');
  const [result,unreadCount]=await Promise.all([me.db.rpc('teacher_review_status',{p_teacher_id:me.id}),unreadNotificationCount(me.db)]);
  const status=result.error?null:parseTeacherReviewStatus(result.data);
  return <PlatformShell locale={locale} role="teacher" name={me.fullName} unreadCount={unreadCount}><TeacherReviewPanel locale={locale} status={status} error={result.error?.message||(!status?'unavailable':null)}/>{children}</PlatformShell>;
}
