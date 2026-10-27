import Link from 'next/link';
import Image from 'next/image';
import { WorkspaceNavigationSidebar } from '@/components/workspace-navigation-sidebar';
import type { PlatformRole } from './access';

export type NavItem = {
  href: string;
  label: string;
  primary?: { key: string; icon: string };
  activePaths?: string[];
};

export function platformNavigation(locale: string, role: PlatformRole): NavItem[] {
  const ar = locale === 'ar';
  const notifications = {
    href: `/${locale}/notifications`,
    label: ar ? 'الإشعارات' : 'Notifications',
  };
  const reportProblem = {
    href: `/${locale}/reports`,
    label: ar ? 'الإبلاغ عن مشكلة' : 'Report a problem',
  };
  if (role === 'teacher')
    return [
      {
        href: `/${locale}/teacher`,
        label: ar ? 'الرئيسية' : 'Home',
        primary: { key: 'home', icon: 'home' },
      },
      {
        href: `/${locale}/teacher/groups`,
        label: ar ? 'المجموعات' : 'Groups',
        primary: { key: 'groups', icon: 'groups' },
      },
      {
        href: `/${locale}/teacher/lessons`,
        label: ar ? 'الحصص' : 'Calendar',
        primary: { key: 'calendar', icon: 'calendar' },
        activePaths: [`/${locale}/teacher/bookings`],
      },
      {
        href: `/${locale}/teacher/requests`,
        label: ar ? 'الطلبات' : 'Requests',
        primary: { key: 'requests', icon: 'requests' },
      },
      { href: `/${locale}/teacher/students`, label: ar ? 'الطلاب' : 'Students' },
      {
        href: `/${locale}/teacher/catalogue`,
        label: ar ? 'المواد والفئات' : 'Subjects & categories',
      },
      { href: `/${locale}/teacher/feedback`, label: ar ? 'آراء الطلاب' : 'Feedback' },
      notifications,
      { href: `/${locale}/account`, label: ar ? 'حسابي' : 'My account' },
      reportProblem,
    ];
  if (role === 'admin')
    return [
      {
        href: `/${locale}/admin`,
        label: ar ? 'الرئيسية' : 'Home',
        primary: { key: 'home', icon: 'home' },
      },
      {
        href: `/${locale}/admin/teachers`,
        label: ar ? 'المعلمون' : 'Teachers',
        primary: { key: 'teachers', icon: 'teachers' },
      },
      {
        href: `/${locale}/admin/reports`,
        label: ar ? 'البلاغات' : 'Reports',
        primary: { key: 'reports', icon: 'reports' },
      },
      {
        href: `/${locale}/admin/users`,
        label: ar ? 'الأشخاص' : 'People',
        primary: { key: 'people', icon: 'people' },
      },
      { href: `/${locale}/admin/email`, label: ar ? 'حالة البريد' : 'Email delivery' },
      { href: `/${locale}/admin/education`, label: ar ? 'الدليل التعليمي' : 'Education' },
      { href: `/${locale}/admin/groups`, label: ar ? 'المجموعات' : 'Groups' },
      { href: `/${locale}/admin/health`, label: ar ? 'حالة التشغيل' : 'Operational health' },
      { href: `/${locale}/admin/feedback`, label: ar ? 'آراء الطلاب' : 'Student feedback' },
      { href: `/${locale}/admin/settings`, label: ar ? 'الإعدادات' : 'Settings' },
      { href: `/${locale}/account`, label: ar ? 'حسابي' : 'My account' },
      reportProblem,
      notifications,
    ];
  return [
    {
      href: `/${locale}/student`,
      label: ar ? 'الرئيسية' : 'Home',
      primary: { key: 'home', icon: 'home' },
    },
    {
      href: `/${locale}/student/classes`,
      label: ar ? 'مجموعاتي' : 'Classes',
      primary: { key: 'classes', icon: 'groups' },
    },
    {
      href: `/${locale}/timetable`,
      label: ar ? 'الجدول' : 'Timetable',
      primary: { key: 'timetable', icon: 'calendar' },
      activePaths: [`/${locale}/student/bookings`],
    },
    { href: `/${locale}/student/materials`, label: ar ? 'مكتبة التعلم' : 'Learning library' },
    {
      href: `/${locale}/teachers`,
      label: ar ? 'اكتشف' : 'Explore',
      primary: { key: 'explore', icon: 'explore' },
      activePaths: [`/${locale}/student/recommendations`],
    },
    { href: `/${locale}/student/saved`, label: ar ? 'المحفوظات' : 'Saved groups' },
    notifications,
    { href: `/${locale}/account`, label: ar ? 'حسابي' : 'My account' },
    reportProblem,
  ];
}

export function PlatformShell({
  locale,
  role,
  name,
  unreadCount = null,
  canTeach = false,
  children,
}: {
  locale: string;
  role: PlatformRole;
  name: string;
  unreadCount?: number | null;
  canTeach?: boolean;
  children: React.ReactNode;
}) {
  const ar = locale === 'ar';
  const items = platformNavigation(locale, role);
  return (
    <div className="container grid grid-cols-1 gap-3 py-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-7 lg:py-8">
      <aside className="hidden max-h-[calc(100dvh-8rem)] min-w-0 overflow-y-auto rounded-[1.75rem] bg-teal p-3 text-cream lg:sticky lg:top-24 lg:block lg:p-4">
        <Link
          href={`/${locale}/${role}`}
          aria-label={ar ? 'درسك' : 'DarSak'}
          className="hidden items-center gap-3 px-3 py-3 lg:flex"
        >
          <Image
            src="/brand/darsak/favicon.svg"
            alt={ar ? 'درسك' : 'DarSak'}
            width={40}
            height={40}
            className="size-10 rounded-xl"
          />
          <span>
            <strong className="block text-lg">{ar ? 'درسك' : 'DarSak'}</strong>
            <small className="text-cream/65">
              {role === 'teacher'
                ? ar
                  ? 'مساحة المعلم'
                  : 'Teacher space'
                : role === 'admin'
                  ? ar
                    ? 'الإدارة'
                    : 'Administration'
                  : ar
                    ? 'مساحة الطالب'
                    : 'Student space'}
            </small>
          </span>
        </Link>
        <WorkspaceNavigationSidebar
          locale={locale}
          role={role}
          unreadCount={unreadCount}
          items={items}
        />
        <div className="mt-5 hidden rounded-2xl bg-black/10 px-3 py-3 text-sm lg:block">
          <span className="block truncate font-bold">{name}</span>
          <span className="text-cream/60">{ar ? 'توقيت القاهرة' : 'Africa/Cairo'}</span>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function RoleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
