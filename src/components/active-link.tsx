'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath } from './navigation-domain';

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
