import Link from 'next/link';
import { logoutAction } from '@admin/app/[locale]/login/actions';
import type { Locale } from '@admin/lib/i18n';

const labels = {
  ar: {
    home: 'الرئيسية',
    teachers: 'المعلمون',
    users: 'المستخدمون',
    education: 'التعليم',
    groups: 'المجموعات',
    feedback: 'التقييمات',
    reports: 'البلاغات',
    settings: 'الإعدادات',
    email: 'البريد',
    health: 'حالة النظام',
    notifications: 'الإشعارات',
    logout: 'تسجيل الخروج',
  },
  en: {
    home: 'Overview',
    teachers: 'Teachers',
    users: 'Users',
    education: 'Education',
    groups: 'Groups',
    feedback: 'Feedback',
    reports: 'Reports',
    settings: 'Settings',
    email: 'Email',
    health: 'Health',
    notifications: 'Notifications',
    logout: 'Sign out',
  },
};

const links = [
  ['admin', 'home'],
  ['admin/teachers', 'teachers'],
  ['admin/users', 'users'],
  ['admin/education', 'education'],
  ['admin/groups', 'groups'],
  ['admin/feedback', 'feedback'],
  ['admin/reports', 'reports'],
  ['admin/settings', 'settings'],
  ['admin/email', 'email'],
  ['admin/health', 'health'],
  ['notifications', 'notifications'],
] as const;

export function AdminShell({
  locale,
  name,
  notificationCount,
  children,
}: {
  locale: Locale;
  name: string;
  notificationCount?: number | null;
  children: React.ReactNode;
}) {
  const copy = labels[locale];
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-line bg-surface p-4 md:min-h-screen md:border-b-0 md:border-e md:p-5">
        <Link href={`/${locale}/admin`} className="block text-lg font-black text-teal">
          DarSak <span className="text-orange">Admin</span>
        </Link>
        <p className="mt-2 truncate text-sm text-muted">{name}</p>
        <nav
          aria-label="Administrator navigation"
          className="mt-5 flex gap-2 overflow-x-auto pb-1 md:grid md:overflow-visible"
        >
          {links.map(([path, label]) => (
            <Link
              key={path}
              href={`/${locale}/${path}`}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-cream"
            >
              <span className="inline-flex items-center gap-2">
                {copy[label]}
                {label === 'notifications' &&
                  notificationCount !== null &&
                  notificationCount !== undefined &&
                  notificationCount > 0 && (
                    <span
                      className="rounded-full bg-orange px-2 py-0.5 text-xs font-bold text-white"
                      aria-label={`${notificationCount} unread`}
                    >
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
              </span>
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="mt-5">
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm font-bold text-orange hover:bg-cream"
          >
            {copy.logout}
          </button>
        </form>
      </aside>
      <main className="min-w-0 p-4 sm:p-7 lg:p-9">{children}</main>
    </div>
  );
}
