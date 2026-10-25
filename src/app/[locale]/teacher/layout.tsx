import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { unreadNotificationCount } from '@/features/notifications/data';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';
export const maxDuration = 40;

export default async function TeacherLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const me = await requireViewer(locale, 'teacher');
  const [unreadCount, teachingAccess] = await Promise.all([
    unreadNotificationCount(me.db),
    readTeacherAccessStatus(me.db).catch(() => null),
  ]);
  return (
    <PlatformShell
      locale={locale}
      role="teacher"
      name={me.fullName}
      unreadCount={unreadCount}
      canTeach={!!teachingAccess?.status?.has_access && !teachingAccess?.error}
    >
      <TeacherSubscriptionNotice locale={locale} signedInTeacher compact />
      {children}
    </PlatformShell>
  );
}
