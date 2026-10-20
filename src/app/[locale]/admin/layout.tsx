import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { unreadNotificationCount } from '@/features/notifications/data';
export const maxDuration = 40;
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const me = await requireViewer(locale, 'admin');
  const unreadCount = await unreadNotificationCount(me.db);
  return (
    <PlatformShell locale={locale} role="admin" name={me.fullName} unreadCount={unreadCount}>
      {children}
    </PlatformShell>
  );
}
