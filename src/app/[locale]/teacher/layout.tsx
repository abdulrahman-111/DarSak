import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { unreadNotificationCount } from '@/features/notifications/data';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';
export const maxDuration = 40;

export const metadata: Metadata = { robots: { index: false, follow: false } };

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
  const unreadCount = await unreadNotificationCount(me.db);
  return (
    <PlatformShell locale={locale} role="teacher" name={me.fullName} unreadCount={unreadCount}>
      <TeacherSubscriptionNotice locale={locale} signedInTeacher compact />
      {children}
    </PlatformShell>
  );
}
