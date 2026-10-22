'use client';

import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Compass,
  Ellipsis,
  Flag,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  MessageSquareText,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { ActiveLink } from '@/components/active-link';
import { isWorkspaceItemActive } from '@/components/navigation-domain';
import type { NavItem } from '@/components/platform/shell';
import type { PlatformRole } from '@/components/platform/access';

function navigationIcon(item: NavItem) {
  if (item.primary?.icon === 'home') return LayoutDashboard;
  if (item.primary?.icon === 'groups')
    return item.href.includes('/classes') ? BookOpen : UsersRound;
  if (item.primary?.icon === 'calendar') return CalendarDays;
  if (item.primary?.icon === 'requests') return ClipboardList;
  if (item.primary?.icon === 'explore') return Compass;
  if (item.primary?.icon === 'teachers') return GraduationCap;
  if (item.primary?.icon === 'reports') return Flag;
  if (item.primary?.icon === 'people') return UsersRound;

  const path = item.href.split('?')[0].split('/').at(-1);
  if (path === 'notifications') return Bell;
  if (path === 'account') return UserRound;
  if (path === 'reports') return Flag;
  if (path === 'students' || path === 'users' || path === 'teachers') return GraduationCap;
  if (path === 'groups' || path === 'classes') return UsersRound;
  if (path === 'lessons' || path === 'timetable') return CalendarDays;
  if (path === 'catalogue' || path === 'education') return LibraryBig;
  if (path === 'feedback') return MessageSquareText;
  if (path === 'saved' || path === 'materials') return BookOpen;
  if (path === 'requests') return ClipboardList;
  return ArrowUpRight;
}

export function WorkspaceNavigationSidebar({
  locale,
  role,
  unreadCount,
  items,
}: {
  locale: string;
  role: PlatformRole;
  unreadCount: number | null;
  items: NavItem[];
}) {
  const pathname = usePathname() ?? '';
  const primary = items.filter(item => item.primary);
  const secondary = items.filter(item => !item.primary);
  const activeSecondary = secondary.some(item => isWorkspaceItemActive(pathname, item));
  const ar = locale === 'ar';
  const roleLabel =
    role === 'admin'
      ? ar
        ? 'الإدارة'
        : 'Administration'
      : role === 'teacher'
        ? ar
          ? 'المعلم'
          : 'Teacher'
        : ar
          ? 'الطالب'
          : 'Student';

  return (
    <nav
      className="mt-5 hidden gap-2 pb-2 lg:grid"
      aria-label={ar ? `تنقل ${roleLabel}` : `${roleLabel} navigation`}
    >
      {primary.map(item => {
        const Icon = navigationIcon(item);
        return (
          <ActiveLink
            key={item.href}
            href={item.href}
            exact={item.href === `/${locale}/${role}`}
            activePaths={item.activePaths}
            className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-cream/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream"
            activeClassName="bg-cream text-teal hover:bg-cream hover:text-teal"
          >
            <Icon size={17} aria-hidden="true" className="shrink-0" />
            <span data-workspace-primary="true" className="min-w-0 truncate">
              {item.label}
            </span>
          </ActiveLink>
        );
      })}
      <details open={activeSecondary} className="group min-w-0">
        <summary
          className={`flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream [&::-webkit-details-marker]:hidden ${activeSecondary ? 'bg-white/10 text-white' : 'text-cream/80'}`}
        >
          <Ellipsis size={17} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1">{ar ? 'المزيد' : 'More'}</span>
          {unreadCount !== null && unreadCount > 0 && (
            <span
              aria-label={ar ? `${unreadCount} غير مقروء` : `${unreadCount} unread`}
              className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-xs font-black text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </summary>
        <div className="mt-2 grid gap-1 ps-2">
          {secondary.map(item => {
            const Icon = navigationIcon(item);
            const notification = item.href.endsWith('/notifications');
            return (
              <ActiveLink
                key={item.href}
                href={item.href}
                activePaths={item.activePaths}
                className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-cream/75 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream"
                activeClassName="bg-cream text-teal hover:bg-cream hover:text-teal"
              >
                <Icon size={17} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 break-words">{item.label}</span>
                {notification && unreadCount !== null && unreadCount > 0 && (
                  <span
                    aria-label={ar ? `${unreadCount} غير مقروء` : `${unreadCount} unread`}
                    className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-xs font-black text-white"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </ActiveLink>
            );
          })}
        </div>
      </details>
    </nav>
  );
}
