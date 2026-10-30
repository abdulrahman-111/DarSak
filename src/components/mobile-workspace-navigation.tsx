'use client';

import { useLiveUnreadCount } from '@/features/notifications/live-unread';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  UsersRound,
  X,
} from 'lucide-react';
import { isActivePath, isWorkspaceItemActive } from './navigation-domain';
import {
  mobileWorkspaceNavigation,
  type MobileWorkspaceRole,
  type MobileWorkspaceLink,
} from './mobile-nav-domain';

const primaryIcons = {
  home: LayoutDashboard,
  groups: UsersRound,
  calendar: CalendarDays,
  requests: ClipboardList,
  explore: Compass,
  teachers: GraduationCap,
  reports: Flag,
  people: UsersRound,
};

function secondaryIcon(href: string) {
  const path = href.split('?')[0].split('/').at(-1);
  if (path === 'notifications') return Bell;
  if (path === 'account') return LayoutDashboard;
  if (path === 'reports') return Flag;
  if (path === 'students' || path === 'users') return GraduationCap;
  if (path === 'groups' || path === 'classes') return UsersRound;
  if (path === 'lessons' || path === 'timetable') return CalendarDays;
  if (path === 'catalogue' || path === 'education') return LibraryBig;
  if (path === 'feedback') return MessageSquareText;
  if (path === 'teachers') return Compass;
  if (path === 'saved' || path === 'materials') return BookOpen;
  if (path === 'requests') return ClipboardList;
  return ArrowUpRight;
}

export function MobileWorkspaceNavigation({
  locale,
  role,
  name,
  unreadCount: serverUnreadCount,
  items,
}: {
  locale: string;
  role: MobileWorkspaceRole;
  name: string;
  unreadCount: number | null;
  items: MobileWorkspaceLink[];
}) {
  const pathname = usePathname() ?? '';
  const unreadCount = useLiveUnreadCount(serverUnreadCount);
  const { primary, secondary, moreLabel } = useMemo(
    () => mobileWorkspaceNavigation(locale, role, items),
    [locale, role, items],
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);
  const ar = locale === 'ar';
  const labels = ar
    ? {
        nav: 'التنقل الرئيسي',
        more: moreLabel,
        close: 'إغلاق',
        unread: 'غير مقروء',
        menu: 'روابط إضافية',
      }
    : {
        nav: 'Primary navigation',
        more: moreLabel,
        close: 'Close',
        unread: 'unread',
        menu: 'More workspace links',
      };

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        moreRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const activeSecondary = secondary.some(item => isWorkspaceItemActive(pathname, item));

  return (
    <nav
      ref={rootRef}
      data-mobile-workspace-nav
      className="mobile-workspace-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 shadow-[0_-8px_24px_rgba(14,74,75,.08)] backdrop-blur-lg lg:hidden"
      aria-label={labels.nav}
    >
      {open && (
        <section
          id="mobile-workspace-more"
          className="absolute inset-x-3 bottom-[calc(100%+0.5rem)] mx-auto max-h-[min(70dvh,32rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-white p-4 shadow-[0_16px_48px_rgba(14,74,75,.2)]"
          aria-label={labels.menu}
        >
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
            <p className="min-w-0 truncate text-sm font-bold text-teal">{name}</p>
            <button
              ref={closeRef}
              type="button"
              onClick={() => {
                setOpen(false);
                moreRef.current?.focus();
              }}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
              aria-label={labels.close}
            >
              <X size={17} aria-hidden="true" />
              <span>{labels.close}</span>
            </button>
          </div>
          <div className="grid gap-1">
            {secondary.map(item => {
              const Icon = secondaryIcon(item.href);
              const isNotifications = item.href.endsWith('/notifications');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={event => {
                    if (!event.defaultPrevented) setOpen(false);
                  }}
                  aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-teal hover:bg-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
                >
                  <Icon size={18} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 wrap-break-word">{item.label}</span>
                  {isNotifications && unreadCount !== null && unreadCount > 0 && (
                    <span
                      aria-label={`${unreadCount} ${labels.unread}`}
                      className="shrink-0 rounded-full bg-orange px-2 py-1 text-xs font-bold text-white"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
      <div className="grid grid-cols-5 gap-0 px-1 pt-1">
        {primary.map(item => {
          const Icon = primaryIcons[item.icon];
          const active = isWorkspaceItemActive(pathname, item, item.href === `/${locale}/${role}`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={event => {
                if (!event.defaultPrevented) setOpen(false);
              }}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange ${active ? 'text-teal' : 'text-muted hover:text-teal'}`}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="max-w-full truncate text-[11px] font-semibold leading-4">
                {item.label}
              </span>
            </Link>
          );
        })}
        <button
          ref={moreRef}
          type="button"
          aria-expanded={open}
          aria-controls="mobile-workspace-more"
          aria-current={activeSecondary ? 'page' : undefined}
          onClick={() => setOpen(value => !value)}
          className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange ${open || activeSecondary ? 'text-teal' : 'text-muted hover:text-teal'}`}
        >
          <Ellipsis size={20} aria-hidden="true" />
          <span className="max-w-full truncate text-[11px] font-semibold leading-4">
            {labels.more}
          </span>
          {unreadCount !== null && unreadCount > 0 && (
            <span className="sr-only">
              {unreadCount} {labels.unread}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
