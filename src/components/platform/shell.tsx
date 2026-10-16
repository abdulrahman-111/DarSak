import Link from 'next/link';
import { ActiveLink } from '@/components/active-link';
import type { PlatformRole } from './access';

type NavItem = { href: string; label: string };

function navigation(locale: string, role: PlatformRole): NavItem[] {
  const ar = locale === 'ar';
  const notifications={href:`/${locale}/notifications`,label:ar?'الإشعارات':'Notifications'};
  if (role === 'teacher') return [
    { href: `/${locale}/teacher`, label: ar ? 'نظرة عامة' : 'Overview' },
    { href: `/${locale}/teacher/profile`, label: ar ? 'الملف الشخصي' : 'Profile' },
    { href: `/${locale}/teacher/application`, label: ar ? 'طلب اعتماد المعلم' : 'Teacher application' },
    { href: `/${locale}/teacher/catalogue`, label: ar ? 'المواد والفئات' : 'Subjects & categories' },
    { href: `/${locale}/teacher/groups`, label: ar ? 'المجموعات' : 'Groups' },
    { href: `/${locale}/teacher/requests`, label: ar ? 'طلبات الانضمام' : 'Requests' },
    { href: `/${locale}/teacher/students`, label: ar ? 'الطلاب' : 'Students' },
    { href: `/${locale}/teacher/lessons`, label: ar ? 'الحصص' : 'Lessons' },
    { href: `/${locale}/teacher/access`, label: ar ? 'صلاحية التدريس' : 'Teaching access' },
    notifications,
  ];
  if (role === 'admin') return [
    { href: `/${locale}/admin`, label: ar ? 'نظرة عامة' : 'Overview' },
    { href: `/${locale}/admin/users`, label: ar ? 'المستخدمون' : 'People' },
    { href: `/${locale}/admin/teachers`, label: ar ? 'طلبات المعلمين' : 'Teacher requests' },
    { href: `/${locale}/admin/access`, label: ar ? 'صلاحية المعلمين' : 'Teacher access' },
    { href: `/${locale}/admin/email`, label: ar ? 'حالة البريد' : 'Email delivery' },
    { href: `/${locale}/admin/education`, label: ar ? 'الدليل التعليمي' : 'Education' },
    { href: `/${locale}/admin/groups`, label: ar ? 'المجموعات' : 'Groups' },
    { href: `/${locale}/admin/reports`, label: ar ? 'البلاغات' : 'Reports' },
    { href: `/${locale}/admin/settings`, label: ar ? 'الإعدادات' : 'Settings' },
    notifications,
  ];
  return [
    { href: `/${locale}/student`, label: ar ? 'نظرة عامة' : 'Overview' },
    { href: `/${locale}/student/classes`, label: ar ? 'مجموعاتي' : 'My classes' },
    { href: `/${locale}/student/saved`, label: ar ? 'المجموعات المحفوظة' : 'Saved groups' },
    { href: `/${locale}/student/profile`, label: ar ? 'ملف التعلم' : 'Learning profile' },
    { href: `/${locale}/timetable`, label: ar ? 'الجدول الأسبوعي' : 'Weekly timetable' },
    { href: `/${locale}/student/materials`, label: ar ? 'المواد' : 'Materials' },
    { href: `/${locale}/teachers`, label: ar ? 'اكتشف' : 'Discover' },
    notifications,
  ];
}

function itemLabel(item: NavItem, unreadCount: number|null, locale:string) {
  const ar=locale==='ar';
  return <span className="flex min-w-0 items-center justify-between gap-2"><span className="truncate">{item.label}</span>{item.href.endsWith('/notifications') && unreadCount!==null && unreadCount>0 && <span aria-label={ar?`${unreadCount} غير مقروء`:`${unreadCount} unread`} className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-xs font-black text-white">{unreadCount>99?'99+':unreadCount}</span>}</span>;
}

export function PlatformShell({ locale, role, name, unreadCount=null, children }: { locale: string; role: PlatformRole; name: string; unreadCount?: number|null; children: React.ReactNode }) {
  const ar = locale === 'ar';
  const items = navigation(locale, role);
  const accountMenu = ar ? 'قائمة الحساب' : 'Account menu';
  const roleName = role === 'teacher' ? (ar ? 'معلم' : 'Teacher') : role === 'admin' ? (ar ? 'مسؤول' : 'Administrator') : (ar ? 'طالب' : 'Student');
  return <div className="container grid grid-cols-1 gap-7 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
    <aside className="min-w-0 rounded-[1.75rem] bg-teal p-3 text-cream lg:sticky lg:top-24 lg:p-4">
      <Link href={`/${locale}/${role}`} className="hidden items-center gap-3 px-3 py-3 lg:flex">
        <span className="grid size-10 place-items-center rounded-xl bg-cream font-black text-teal">د</span>
        <span><strong className="block text-lg">{ar ? 'درس' : 'Dars'}</strong><small className="text-cream/65">{role === 'teacher' ? (ar ? 'مساحة المعلم' : 'Teacher space') : role === 'admin' ? (ar ? 'الإدارة' : 'Administration') : (ar ? 'مساحة الطالب' : 'Student space')}</small></span>
      </Link>
      <details className="group lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream [&::-webkit-details-marker]:hidden">
          <span className="min-w-0"><span className="block truncate text-xs font-semibold text-cream/70">{roleName} · {accountMenu}</span><span className="block truncate font-bold">{name}</span></span>
          <span aria-hidden="true" className="shrink-0 text-sm text-cream/80 group-open:rotate-180">⌄</span>
          {unreadCount!==null&&unreadCount>0&&<span aria-hidden="true" className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-xs font-black text-white">{unreadCount>99?'99+':unreadCount}</span>}
          {unreadCount!==null&&unreadCount>0&&<span className="sr-only">{ar?`${unreadCount} إشعارات غير مقروءة`:`${unreadCount} unread notifications`}</span>}
        </summary>
        <nav className="grid gap-1 px-1 pb-1 pt-2" aria-label={ar ? 'تنقل الحساب' : 'Account navigation'}>
          {items.map(item => <ActiveLink key={item.href} href={item.href} exact={item.href===`/${locale}/${role}`} className="min-w-0 rounded-xl px-3 py-2.5 text-sm font-bold text-cream/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream" activeClassName="bg-cream text-teal hover:bg-cream hover:text-teal">{itemLabel(item,unreadCount,locale)}</ActiveLink>)}
        </nav>
      </details>
      <nav className="mt-5 hidden gap-2 pb-2 lg:grid" aria-label={ar ? 'تنقل الحساب' : 'Account navigation'}>
        {items.map(item => <ActiveLink key={item.href} href={item.href} exact={item.href===`/${locale}/${role}`} className="min-w-0 rounded-xl px-3 py-2.5 text-sm font-bold text-cream/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream" activeClassName="bg-cream text-teal hover:bg-cream hover:text-teal">{itemLabel(item,unreadCount,locale)}</ActiveLink>)}
      </nav>
      <div className="mt-5 hidden rounded-2xl bg-black/10 px-3 py-3 text-sm lg:block"><span className="block truncate font-bold">{name}</span><span className="text-cream/60">{ar ? 'توقيت القاهرة' : 'Africa/Cairo'}</span></div>
    </aside>
    <div className="min-w-0">{children}</div>
  </div>;
}

export function RoleLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
