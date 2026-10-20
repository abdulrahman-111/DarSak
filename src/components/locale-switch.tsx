'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Globe2 } from 'lucide-react';
import { discoverySearchParams, normalizeDiscoveryFilters, preserveTeacherSearch } from '@/features/platform/discovery-domain';
import { switchLocaleReturnParams } from '@/features/auth/return-path';
import type { Locale } from '@/i18n/config';

export function LocaleSwitch({ otherLocale, label, shortLabel, ariaLabel }: {
  otherLocale: Locale;
  label: string;
  shortLabel: string;
  ariaLabel: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathWithoutLocale = (pathname ?? '').replace(/^\/(?:ar|en)(?=\/|$)/, '');
  const currentParams = new URLSearchParams(searchParams.toString());
  const queryParams = pathWithoutLocale === '/teachers'
    ? discoverySearchParams(normalizeDiscoveryFilters(currentParams))
    : currentParams;
  if (pathWithoutLocale === '/teachers') {
    for (const [key, value] of preserveTeacherSearch(currentParams)) queryParams.set(key, value);
  }
  const switchedParams = switchLocaleReturnParams(queryParams, otherLocale === 'ar' ? 'en' : 'ar', otherLocale);
  const query = switchedParams.toString();
  const href = `/${otherLocale}${pathWithoutLocale}${query ? `?${query}` : ''}`;

  return (
    <Link
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-line-strong px-2 text-xs font-bold text-teal transition hover:bg-[#efe6d5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:gap-1.5 sm:px-3 sm:text-sm"
      href={href}
      hrefLang={otherLocale}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Globe2 size={16}/><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
