'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isActivePath } from './navigation-domain';

export function MobileNavigationSummary({ items, role, roleLabel, name, locale, unreadCount }: {
  items: Array<{ href: string; label: string }>;
  role: string;
  roleLabel: string;
  name: string;
  locale: string;
  unreadCount: number | null;
}) {
  const pathname = usePathname();
  const summaryContentRef = useRef<HTMLSpanElement>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;
    if (!previous || !pathname || previous === pathname) return;

    const summary = summaryContentRef.current?.closest('summary');
    const details = summary?.closest('details');
    if (!summary || !details?.open) return;

    const activeElement = document.activeElement;
    if (activeElement && activeElement !== summary && details.contains(activeElement) && summary.getClientRects().length > 0) {
      summary.focus({ preventScroll: true });
    }
    details.open = false;
  }, [pathname]);

  const activeItem = items.find(item => isActivePath(pathname, item.href, item.href.endsWith(`/${role}`)));
  const ar = locale === 'ar';
  return <>
    <span ref={summaryContentRef} className="min-w-0 flex-1">
      <span className="block truncate text-xs font-semibold text-cream/70">{roleLabel} · {activeItem?.label || (ar ? 'التنقل' : 'Navigation')}</span>
      <span className="block truncate font-bold">{name}</span>
    </span>
    <span aria-hidden="true" className="shrink-0 text-sm text-cream/80 transition-transform group-open:rotate-180">⌄</span>
    {unreadCount !== null && unreadCount > 0 && <span aria-hidden="true" className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-xs font-black text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    {unreadCount !== null && unreadCount > 0 && <span className="sr-only">{ar ? `${unreadCount} إشعارات غير مقروءة` : `${unreadCount} unread notifications`}</span>}
  </>;
}

export function ActiveLink({ href, className = '', activeClassName = '', exact = false, children }: {
  href: string;
  className?: string;
  activeClassName?: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href, exact);
  return <Link href={href} aria-current={active ? 'page' : undefined} className={`${className}${active ? ` ${activeClassName}` : ''}`}>{children}</Link>;
}
