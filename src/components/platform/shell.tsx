import Link from 'next/link';
import type { PlatformRole } from './access';

type NavItem = { href: string; label: string };

function navigation(locale: string, role: PlatformRole): NavItem[] {
  const ar = locale === 'ar';
  if (role === 'teacher') return [
    { href: `/${locale}/teacher`, label: ar ? 'نظرة عامة' : 'Overview' },
    { href: `/${locale}/teacher/profile`, label: ar ? 'الملف الشخصي' : 'Profile' },
    { href: `/${locale}/teacher/catalogue`, label: ar ? 'المواد والفئات' : 'Subjects & categories' },
    { href: `/${locale}/teacher/groups`, label: ar ? 'المجموعات' : 'Groups' },
    { href: `/${locale}/teacher/requests`, label: ar ? 'طلبات الانضمام' : 'Requests' },
    { href: `/${locale}/teacher/students`, label: ar ? 'الطلاب' : 'Students' },
    { href: `/${locale}/teacher/lessons`, label: ar ? 'الحصص' : 'Lessons' },
  ];
  if (role === 'admin') return [
    { href: `/${locale}/admin`, label: ar ? 'نظرة عامة' : 'Overview' },
    { href: `/${locale}/admin/users`, label: ar ? 'المستخدمون' : 'People' },
    { href: `/${locale}/admin/teachers`, label: ar ? 'طلبات المعلمين' : 'Teacher requests' },
    { href: `/${locale}/admin/education`, label: ar ? 'الدليل التعليمي' : 'Education' },
    { href: `/${locale}/admin/groups`, label: ar ? 'المجموعات' : 'Groups' },
    { href: `/${locale}/admin/reports`, label: ar ? 'البلاغات' : 'Reports' },
    { href: `/${locale}/admin/settings`, label: ar ? 'الإعدادات' : 'Settings' },
  ];
  return [
    { href: `/${locale}/student`, label: ar ? 'نظرة عامة' : 'Overview' },
    { href: `/${locale}/student/classes`, label: ar ? 'مجموعاتي' : 'My classes' },
    { href: `/${locale}/timetable`, label: ar ? 'الجدول الأسبوعي' : 'Weekly timetable' },
    { href: `/${locale}/student/materials`, label: ar ? 'المواد' : 'Materials' },
    { href: `/${locale}/teachers`, label: ar ? 'اكتشف' : 'Discover' },
  ];
}

export function PlatformShell({ locale, role, name, children }: { locale: string; role: PlatformRole; name: string; children: React.ReactNode }) {
  const ar = locale === 'ar';
  const items = navigation(locale, role);
  return <div className="container grid grid-cols-1 gap-7 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
    <aside className="min-w-0 rounded-[1.75rem] bg-teal p-4 text-cream lg:sticky lg:top-24">
      <Link href={`/${locale}/${role}`} className="flex items-center gap-3 px-3 py-3">
        <span className="grid size-10 place-items-center rounded-xl bg-cream font-black text-teal">د</span>
        <span><strong className="block text-lg">{ar ? 'درس' : 'Dars'}</strong><small className="text-cream/65">{role === 'teacher' ? (ar ? 'مساحة المعلم' : 'Teacher space') : role === 'admin' ? (ar ? 'الإدارة' : 'Administration') : (ar ? 'مساحة الطالب' : 'Student space')}</small></span>
      </Link>
      <nav className="mt-5 flex gap-2 overflow-x-auto pb-2 lg:flex-col" aria-label={ar ? 'تنقل الحساب' : 'Account navigation'}>
        {items.map(item => <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-bold text-cream/80 hover:bg-white/10 hover:text-white">{item.label}</Link>)}
      </nav>
      <div className="mt-5 rounded-2xl bg-black/10 px-3 py-3 text-sm"><span className="block truncate font-bold">{name}</span><span className="text-cream/60">{ar ? 'توقيت القاهرة' : 'Africa/Cairo'}</span></div>
    </aside>
    <div className="min-w-0">{children}</div>
  </div>;
}

export function RoleLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
