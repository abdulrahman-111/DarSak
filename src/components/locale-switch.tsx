'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Globe2 } from 'lucide-react';
import { discoverySearchParams, normalizeDiscoveryFilters, preserveTeacherSearch } from '@/features/platform/discovery-domain';
import { switchLocaleReturnParams } from '@/features/auth/return-path';
import type { Locale } from '@/i18n/config';

export function LocaleSwitch({ otherLocale, label, ariaLabel }: {
  otherLocale: Locale;
  label: string;
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
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d8ccb8] px-2.5 text-xs font-bold text-teal transition hover:bg-[#efe6d5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:px-3 sm:text-sm"
      href={href}
      hrefLang={otherLocale}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Globe2 size={16}/><span>{label}</span>
    </Link>
  );
}
