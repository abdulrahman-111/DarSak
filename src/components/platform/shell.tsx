import Link from 'next/link';
import Image from 'next/image';
import {LayoutDashboard,BookOpen,CalendarDays,FolderOpen,Compass,Bookmark,Bell,UserRound,Flag,UsersRound,ClipboardList,GraduationCap,LibraryBig,MessageSquareText} from 'lucide-react';
import { ActiveLink, MobileNavigationSummary } from '@/components/active-link';
import type { PlatformRole } from './access';

type NavItem = { href: string; label: string };

export function platformNavigation(locale: string, role: PlatformRole): NavItem[] {
  const ar = locale === 'ar';
  const notifications={href:`/${locale}/notifications`,label:ar?'الإشعارات':'Notifications'};
  const reportProblem={href:`/${locale}/reports`,label:ar?'الإبلاغ عن مشكلة':'Report a problem'};
  if (role === 'teacher') return [
    { href: `/${locale}/teacher`, label: ar ? 'الرئيسية التعليمية' : 'Teaching home' },
    { href: `/${locale}/teacher/groups`, label: ar ? 'المجموعات' : 'Groups' },
    { href: `/${locale}/teacher/lessons`, label: ar ? 'تقويم الحصص' : 'Lesson calendar' },
    { href: `/${locale}/teacher/requests`, label: ar ? 'طلبات الانضمام' : 'Enrollment requests' },
    { href: `/${locale}/teacher/students`, label: ar ? 'الطلاب' : 'Students' },
    { href: `/${locale}/teacher/catalogue`, label: ar ? 'المواد والفئات' : 'Subjects & categories' },
    { href: `/${locale}/teacher/feedback`, label: ar ? 'آراء الطلاب' : 'Feedback' },
    notifications,
    { href: `/${locale}/account`, label: ar ? 'حسابي' : 'My account' },
    reportProblem,
  ];
  if (role === 'admin') return [
    { href: `/${locale}/admin`, label: ar ? 'نظرة عامة' : 'Overview' },
    { href: `/${locale}/admin/users`, label: ar ? 'المستخدمون' : 'People' },
    { href: `/${locale}/admin/teachers`, label: ar ? 'طلبات المعلمين' : 'Teacher requests' },
    { href: `/${locale}/admin/email`, label: ar ? 'حالة البريد' : 'Email delivery' },
    { href: `/${locale}/admin/education`, label: ar ? 'الدليل التعليمي' : 'Education' },
    { href: `/${locale}/admin/groups`, label: ar ? 'المجموعات' : 'Groups' },
    { href: `/${locale}/admin/reports`, label: ar ? 'البلاغات' : 'Reports' },
    { href: `/${locale}/admin/health`, label: ar ? 'حالة التشغيل' : 'Operational health' },
    { href: `/${locale}/admin/feedback`, label: ar ? 'آراء الطلاب' : 'Student feedback' },
    { href: `/${locale}/admin/settings`, label: ar ? 'الإعدادات' : 'Settings' },
    { href: `/${locale}/account`, label: ar ? 'حسابي' : 'My account' },
    reportProblem,
    notifications,
  ];
  return [
    { href: `/${locale}/student`, label: ar ? 'مساحة التعلم' : 'Learning home' },
    { href: `/${locale}/student/classes`, label: ar ? 'مجموعاتي' : 'My classes' },
    { href: `/${locale}/timetable`, label: ar ? 'الجدول الدراسي' : 'Timetable' },
    { href: `/${locale}/student/materials`, label: ar ? 'مكتبة التعلم' : 'Learning library' },
    { href: `/${locale}/teachers`, label: ar ? 'اكتشف' : 'Explore' },
    { href: `/${locale}/student/saved`, label: ar ? 'المحفوظات' : 'Saved groups' },
    notifications,
    { href: `/${locale}/account`, label: ar ? 'حسابي' : 'My account' },
    reportProblem,
  ];
}

function itemLabel(item: NavItem, unreadCount: number|null, locale:string,role?:PlatformRole) {
  const ar=locale==='ar';
  const path=item.href.split('/').at(-1);
  const icons:Record<string,typeof BookOpen>={student:LayoutDashboard,classes:BookOpen,timetable:CalendarDays,materials:FolderOpen,teachers:Compass,saved:Bookmark,notifications:Bell,account:UserRound,reports:Flag,teacher:LayoutDashboard,groups:UsersRound,lessons:CalendarDays,requests:ClipboardList,students:GraduationCap,catalogue:LibraryBig,feedback:MessageSquareText};
  const Icon=role==='admin'?null:icons[path??''];
  return <span className="flex w-full min-w-0 items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-3">{Icon&&<Icon size={17} aria-hidden="true" className="shrink-0"/>}<span className={role === 'teacher' ? 'whitespace-normal break-words leading-5' : 'truncate'}>{item.label}</span></span>{item.href.endsWith('/notifications') && unreadCount!==null && unreadCount>0 && <span aria-label={ar?`${unreadCount} غير مقروء`:`${unreadCount} unread`} className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-xs font-black text-white">{unreadCount>99?'99+':unreadCount}</span>}</span>;
}

export function PlatformShell({ locale, role, name, unreadCount=null, children }: { locale: string; role: PlatformRole; name: string; unreadCount?: number|null; children: React.ReactNode }) {
  const ar = locale === 'ar';
  const items = platformNavigation(locale, role);
  const roleName = role === 'teacher' ? (ar ? 'مساحة المعلم' : 'Teacher workspace') : role === 'admin' ? (ar ? 'الإدارة' : 'Administration') : (ar ? 'مساحة الطالب' : 'Student workspace');
  return <div className="container grid grid-cols-1 gap-7 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
    <aside className="min-w-0 rounded-[1.75rem] bg-teal p-3 text-cream lg:sticky lg:top-24 lg:p-4">
      <Link href={`/${locale}/${role}`} aria-label={ar ? 'درسك' : 'DarSak'} className="hidden items-center gap-3 px-3 py-3 lg:flex">
        <Image src="/brand/darsak/favicon.svg" alt={ar ? 'درسك' : 'DarSak'} width={40} height={40} className="size-10 rounded-xl" />
        <span><strong className="block text-lg">{ar ? 'درسك' : 'DarSak'}</strong><small className="text-cream/65">{role === 'teacher' ? (ar ? 'مساحة المعلم' : 'Teacher space') : role === 'admin' ? (ar ? 'الإدارة' : 'Administration') : (ar ? 'مساحة الطالب' : 'Student space')}</small></span>
      </Link>
      <details className="group lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream [&::-webkit-details-marker]:hidden">
          <MobileNavigationSummary items={items} role={role} roleLabel={roleName} name={name} locale={locale} unreadCount={unreadCount}/>
        </summary>
        <nav className="grid gap-1 px-1 pb-1 pt-2" aria-label={ar ? `تنقل ${role === 'admin' ? 'الإدارة' : role === 'teacher' ? 'المعلم' : 'الطالب'}` : `${role === 'admin' ? 'Administration' : role === 'teacher' ? 'Teacher' : 'Student'} navigation`}>
          {items.map(item => <ActiveLink key={item.href} href={item.href} exact={item.href===`/${locale}/${role}`} className="flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2.5 text-sm font-bold text-cream/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream" activeClassName="bg-cream text-teal hover:bg-cream hover:text-teal">{itemLabel(item,unreadCount,locale,role)}</ActiveLink>)}
        </nav>
      </details>
      <nav className="mt-5 hidden gap-2 pb-2 lg:grid" aria-label={ar ? `تنقل ${role === 'admin' ? 'الإدارة' : role === 'teacher' ? 'المعلم' : 'الطالب'}` : `${role === 'admin' ? 'Administration' : role === 'teacher' ? 'Teacher' : 'Student'} navigation`}>
        {items.map(item => <ActiveLink key={item.href} href={item.href} exact={item.href===`/${locale}/${role}`} className="flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2.5 text-sm font-bold text-cream/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream" activeClassName="bg-cream text-teal hover:bg-cream hover:text-teal">{itemLabel(item,unreadCount,locale,role)}</ActiveLink>)}
      </nav>
      <div className="mt-5 hidden rounded-2xl bg-black/10 px-3 py-3 text-sm lg:block"><span className="block truncate font-bold">{name}</span><span className="text-cream/60">{ar ? 'توقيت القاهرة' : 'Africa/Cairo'}</span></div>
    </aside>
    <div className="min-w-0">{children}</div>
  </div>;
}

export function RoleLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
