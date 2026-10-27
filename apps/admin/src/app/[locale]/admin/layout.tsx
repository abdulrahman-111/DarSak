import { ensureLocale } from '@/i18n/config';
import { requireAdminActor } from '@admin/lib/access';
import { AdminShell } from '@admin/components/admin-shell';
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const me = await requireAdminActor(locale);
  const count = await me.db.rpc('notifications_unread_count');
  const notificationCount =
    !count.error && Number.isSafeInteger(count.data) && (count.data as number) >= 0
      ? (count.data as number)
      : null;
  return (
    <AdminShell locale={locale} name={me.fullName} notificationCount={notificationCount}>
      {children}
    </AdminShell>
  );
}
