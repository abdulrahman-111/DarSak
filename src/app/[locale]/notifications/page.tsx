import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import {
  markAllNotificationsRead,
  markNotificationRead,
  openNotification,
} from '@/features/notifications/actions';
import { NotificationSubmit } from '@/features/notifications/notification-actions';
import {
  notificationHref,
  notificationSummary,
  parseNotificationsPage,
} from '@/features/notifications/domain';

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ offset?: string | string[] }>;
}) {
  const [{ locale: raw }, { offset: rawOffset }] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar',
    me = await requireViewer(locale);
  const offsetValue = Array.isArray(rawOffset) ? rawOffset[0] : rawOffset;
  const requestedOffset =
    typeof offsetValue === 'string' && /^\d{1,7}$/.test(offsetValue)
      ? Math.min(Number(offsetValue), 1_000_000)
      : 0;
  let offset = requestedOffset;
  let result = await me.db.rpc('notifications_page', { p_offset: offset, p_limit: 20 });
  let page = result.error ? null : parseNotificationsPage(result.data);
  if (page && offset > 0 && offset >= page.total) {
    offset = page.total === 0 ? 0 : Math.floor((page.total - 1) / 20) * 20;
    result = await me.db.rpc('notifications_page', { p_offset: offset, p_limit: 20 });
    page = result.error ? null : parseNotificationsPage(result.data);
  }
  const unreadCount = page?.unread ?? null;
  const retry = `/${locale}/notifications${offset ? `?offset=${offset}` : ''}`;
  return (
    <PlatformShell locale={locale} role={me.role} name={me.fullName} unreadCount={unreadCount}>
      <div className="grid min-w-0 gap-6">
        <ScreenTitle
          eyebrow={ar ? 'حسابك' : 'Your account'}
          title={ar ? 'الإشعارات' : 'Notifications'}
          description={
            ar
              ? 'إشعارات خاصة بحسابك وتحديثات مجموعاتك.'
              : 'Private updates about your account and groups.'
          }
          action={
            page?.unread ? (
              <NotificationSubmit
                action={markAllNotificationsRead.bind(null, locale)}
                pending={ar ? 'جارٍ التحديث…' : 'Updating…'}
              >
                {ar ? 'تحديد الكل كمقروء' : 'Mark all read'}
              </NotificationSubmit>
            ) : undefined
          }
        />
        {!page ? (
          <Panel>
            <p role="alert" className="text-sm text-danger">
              {ar
                ? 'تعذر تحميل الإشعارات. حدّث الصفحة وحاول مرة أخرى.'
                : 'Could not load notifications. Refresh and try again.'}
            </p>
            <Link className="mt-3 inline-flex font-bold text-orange underline" href={retry}>
              {ar ? 'إعادة المحاولة' : 'Try again'}
            </Link>
          </Panel>
        ) : page.rows.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted">
              {ar ? 'لا توجد إشعارات حتى الآن.' : 'You have no notifications yet.'}
            </p>
          </Panel>
        ) : (
          <>
            <Panel>
              <div className="grid min-w-0 gap-3">
                {page.rows.map(row => {
                  const summary = notificationSummary(row.kind, row.payload, locale);
                  const href = notificationHref(me.role, row.kind, row.payload, locale);
                  return (
                    <article
                      key={row.id}
                      className={`min-w-0 rounded-2xl border p-4 ${row.read_at ? 'border-line' : 'border-orange/50 bg-orange/5'}`}
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-semibold text-ink">
                            {summary ?? (ar ? 'تحديث جديد' : 'New update')}
                          </p>
                          <time className="mt-2 block text-sm text-muted" dateTime={row.created_at}>
                            {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                              timeZone: 'Africa/Cairo',
                            }).format(new Date(row.created_at))}
                          </time>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {href && row.read_at ? (
                            <Link
                              href={href}
                              className="inline-flex min-h-11 items-center rounded-lg bg-teal px-3 py-2 text-sm font-bold text-white"
                            >
                              {ar ? 'فتح' : 'Open'}
                            </Link>
                          ) : href ? (
                            <NotificationSubmit
                              action={openNotification.bind(null, locale, row.id)}
                              pending={ar ? 'جارٍ الفتح…' : 'Opening…'}
                              variant="primary"
                            >
                              {ar ? 'فتح' : 'Open'}
                            </NotificationSubmit>
                          ) : null}
                          {!row.read_at && (
                            <NotificationSubmit
                              action={markNotificationRead.bind(null, locale, row.id)}
                              pending={ar ? 'جارٍ التحديث…' : 'Updating…'}
                            >
                              {ar ? 'تحديد كمقروء' : 'Mark read'}
                            </NotificationSubmit>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </Panel>
            {page.total > 20 && (
              <nav
                className="flex flex-wrap justify-between gap-3"
                aria-label={ar ? 'صفحات الإشعارات' : 'Notification pages'}
              >
                {offset > 0 ? (
                  <Link
                    className="rounded-xl border border-line px-4 py-3 font-bold text-teal"
                    href={`/${locale}/notifications?offset=${Math.max(0, offset - 20)}`}
                  >
                    {ar ? 'الأحدث' : 'Newer'}
                  </Link>
                ) : (
                  <span />
                )}
                {offset + 20 < page.total && (
                  <Link
                    className="rounded-xl border border-line px-4 py-3 font-bold text-teal"
                    href={`/${locale}/notifications?offset=${offset + 20}`}
                  >
                    {ar ? 'الأقدم' : 'Older'}
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </PlatformShell>
  );
}
