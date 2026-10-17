import Link from 'next/link';
import Image from 'next/image';
import { ActiveLink } from './active-link';
import { Suspense } from 'react';
import { Globe2, Search } from 'lucide-react';
import { logoutAction } from '@/features/auth/actions';
import { currentUser } from '@/features/platform/data';
import { isConfigured } from '@/lib/supabase/server';
import { LocaleSwitch } from './locale-switch';
import { shouldShowDiscoveryNavigation } from '@/features/platform/discovery-access';

export function globalReportsHref(locale: string, activeRole: string | null) {
  if (activeRole === 'admin') return `/${locale}/admin/reports`;
  if (activeRole === 'student' || activeRole === 'teacher') return `/${locale}/reports`;
  return null;
}

export async function Header({ locale, t }: { locale: string; t: Record<string, string> }) {
  const me = isConfigured() ? await currentUser() : null;
  const otherLocale = locale === 'ar' ? 'en' : 'ar';
  const role = me?.profile?.role;
  const activeRole = me?.profile?.status === 'active' && (role === 'teacher' || role === 'admin' || role === 'student') ? role : null;
  const dashboardHref = activeRole ? `/${locale}/${activeRole}` : `/${locale}/dashboard`;
  const homeHref = activeRole ? dashboardHref : `/${locale}`;
  const reportsHref = globalReportsHref(locale, activeRole);
  const showDiscovery = shouldShowDiscoveryNavigation(activeRole);
  const showPricing = !me;
  const pricingLabel = locale === 'ar' ? 'الأسعار' : 'Pricing';
  const reportsLabel = activeRole === 'admin' ? (locale === 'ar' ? 'البلاغات' : 'Reports') : locale === 'ar' ? 'الإبلاغ عن مشكلة' : 'Report a problem';

  return (
    <header className="sticky top-0 z-30 border-b border-[#e3d9c8] bg-[#f6f0e4]/95 backdrop-blur-lg">
      <div className="container flex min-h-16 flex-wrap items-center gap-4 py-3 md:gap-5">
        <Link href={homeHref} className="flex min-w-0 items-center" aria-label={`${t.brand} · ${t.home}`}>
          <Image src={locale === 'ar' ? '/brand/darsak/the-header-logo-arabic.svg' : '/brand/darsak/english-header-lockup.svg'} alt={t.brand} width={180} height={44} priority className="h-11 w-auto max-w-[min(45vw,180px)] object-contain" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-bold text-[#4d473f] md:flex" aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Primary navigation'}>
          {showDiscovery && <ActiveLink className="transition hover:text-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/teachers`}>{t.discover}</ActiveLink>}
          {!me && <ActiveLink className="transition hover:text-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/register?role=teacher`}>{t.teacherRole}</ActiveLink>}
          {showPricing && <ActiveLink className="transition hover:text-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/pricing`}>{pricingLabel}</ActiveLink>}
          {activeRole && <ActiveLink exact className="transition hover:text-orange" activeClassName="text-orange underline underline-offset-4" href={dashboardHref}>{t.dashboard}</ActiveLink>}
          {me && <ActiveLink className="transition hover:text-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/account`}>{t.account}</ActiveLink>}
          {reportsHref && <ActiveLink className="transition hover:text-orange" activeClassName="text-orange underline underline-offset-4" href={reportsHref}>{reportsLabel}</ActiveLink>}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <Suspense fallback={<span aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-[#d8ccb8] text-teal"><Globe2 size={16}/></span>}>
            <LocaleSwitch
              otherLocale={otherLocale}
              label={locale === 'ar' ? 'English' : 'العربية'}
              ariaLabel={locale === 'ar' ? 'Switch language to English' : 'تغيير اللغة إلى العربية'}
            />
          </Suspense>
          {me ? (
            <form action={logoutAction} data-confirm-unsaved-navigation>
              <button className="h-10 rounded-xl border border-[#d8ccb8] px-3 text-sm font-bold text-teal transition hover:bg-white">{t.logout}</button>
            </form>
          ) : (
            <>
              <Link className="hidden px-2 text-sm font-bold text-teal sm:block" href={`/${locale}/login`}>{t.login}</Link>
              <Link className="rounded-xl bg-orange px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#c4561a]" href={`/${locale}/register`}>{t.register}</Link>
            </>
          )}
        </div>
        <nav className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#e3d9c8] pt-3 text-sm font-bold text-[#4d473f] md:hidden" aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Primary navigation'}>
          {showDiscovery && <ActiveLink className="inline-flex items-center gap-1.5 py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/teachers`}><Search size={16}/>{t.discover}</ActiveLink>}
          {!me && <ActiveLink className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/register?role=teacher`}>{t.teacherRole}</ActiveLink>}
          {showPricing && <ActiveLink className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/pricing`}>{pricingLabel}</ActiveLink>}
          {activeRole && <ActiveLink exact className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" activeClassName="text-orange underline underline-offset-4" href={dashboardHref}>{t.dashboard}</ActiveLink>}
          {me && <ActiveLink className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/account`}>{t.account}</ActiveLink>}
          {reportsHref && <ActiveLink className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" activeClassName="text-orange underline underline-offset-4" href={reportsHref}>{reportsLabel}</ActiveLink>}
          {!me && <ActiveLink className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" activeClassName="text-orange underline underline-offset-4" href={`/${locale}/login`}>{t.login}</ActiveLink>}
        </nav>
      </div>
    </header>
  );
}
