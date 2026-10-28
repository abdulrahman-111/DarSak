import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { unreadNotificationCount } from '@/features/notifications/data';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const me = await requireViewer(locale, 'student');
  const unreadCount = await unreadNotificationCount(me.db);
  return (
    <PlatformShell locale={locale} role="student" name={me.fullName} unreadCount={unreadCount}>
      {children}
    </PlatformShell>
  );
}
