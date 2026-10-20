import Link from 'next/link';
import Image from 'next/image';
import { ActiveLink } from './active-link';
import { StudentHeaderNavigation } from './student-header-navigation';
import { Suspense } from 'react';
import { Globe2, LogOut, Menu, Search } from 'lucide-react';
import { logoutAction } from '@/features/auth/actions';
import { currentUser } from '@/features/platform/data';
import { isConfigured } from '@/lib/supabase/server';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { LocaleSwitch } from './locale-switch';
import { shouldShowDiscoveryNavigation } from '@/features/platform/discovery-access';
import { platformNavigation } from './platform/shell';
import { MobileWorkspaceNavigation } from './mobile-workspace-navigation';
import { unreadNotificationCount } from '@/features/notifications/data';
import type { PlatformRole } from './platform/access';

export function globalReportsHref(locale: string, activeRole: string | null) {
  if (activeRole === 'admin') return `/${locale}/admin/reports`;
  if (activeRole === 'student' || activeRole === 'teacher') return `/${locale}/reports`;
  return null;
}

export async function Header({ locale, t }: { locale: string; t: Record<string, string> }) {
  const me = isConfigured() ? await currentUser() : null;
  const otherLocale = locale === 'ar' ? 'en' : 'ar';
  const role = me?.profile?.role;
  const activeRole: PlatformRole | null =
    me?.profile?.status === 'active' &&
    (role === 'teacher' || role === 'admin' || role === 'student')
      ? role
      : null;
  const dashboardHref = activeRole ? `/${locale}/${activeRole}` : `/${locale}/dashboard`;
  const homeHref = activeRole ? dashboardHref : `/${locale}`;
  const reportsHref = globalReportsHref(locale, activeRole);
  const showDiscovery = shouldShowDiscoveryNavigation(activeRole);
  const reportsLabel =
    activeRole === 'admin'
      ? locale === 'ar'
        ? 'البلاغات'
        : 'Reports'
      : locale === 'ar'
        ? 'الإبلاغ عن مشكلة'
        : 'Report a problem';
  const workspaceItems = activeRole ? platformNavigation(locale, activeRole) : [];
  const unreadCount = activeRole
    ? await unreadNotificationCount((await getRequestViewer()).db)
    : null;
  const navRole = activeRole ?? 'student';
  const localeSwitch = (compact: boolean) => (
    <Suspense
      fallback={
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-xl border border-line-strong text-teal"
        >
          <Globe2 size={16} />
        </span>
      }
    >
      <LocaleSwitch
        otherLocale={otherLocale}
        label={locale === 'ar' ? 'English' : 'العربية'}
        shortLabel={
          compact ? (locale === 'ar' ? 'EN' : 'عربي') : locale === 'ar' ? 'English' : 'العربية'
        }
        ariaLabel={locale === 'ar' ? 'Switch language to English' : 'تغيير اللغة إلى العربية'}
      />
    </Suspense>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur-lg">
        <div className="container relative flex min-h-16 flex-nowrap items-center gap-1 py-2 md:gap-5">
          <Link
            href={homeHref}
            className="flex min-w-0 shrink items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            aria-label={`${t.brand} · ${t.home}`}
          >
            <Image
              src={
                locale === 'ar'
                  ? '/brand/darsak/the-header-logo-arabic.svg'
                  : '/brand/darsak/english-header-lockup.svg'
              }
              alt={t.brand}
              width={180}
              height={44}
              priority
              className="h-9 w-auto max-w-[118px] object-contain sm:h-11 sm:max-w-[min(45vw,180px)]"
            />
          </Link>

          <StudentHeaderNavigation locale={locale} enabled={activeRole !== null} role={navRole}>
            <nav
              className="hidden items-center gap-6 text-sm font-bold text-ink-soft lg:flex"
              aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Primary navigation'}
            >
              {showDiscovery && (
                <ActiveLink
                  className="inline-flex min-h-11 items-center rounded-lg px-1 transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  activeClassName="text-orange underline underline-offset-4"
                  href={`/${locale}/teachers`}
                >
                  {t.discover}
                </ActiveLink>
              )}
              {/* A call to action, not a section: it never shows as the current page (it used to light up on every /register page). */}
              {!me && (
                <Link
                  className="inline-flex min-h-11 items-center rounded-lg px-1 transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  href={`/${locale}/register?role=teacher`}
                >
                  {t.teachOnDarsak}
                </Link>
              )}
              {activeRole && (
                <ActiveLink
                  exact
                  className="inline-flex min-h-11 items-center rounded-lg px-1 transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  activeClassName="text-orange underline underline-offset-4"
                  href={dashboardHref}
                >
                  {t.dashboard}
                </ActiveLink>
              )}
              {me && (
                <ActiveLink
                  className="inline-flex min-h-11 items-center rounded-lg px-1 transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  activeClassName="text-orange underline underline-offset-4"
                  href={`/${locale}/account`}
                >
                  {t.account}
                </ActiveLink>
              )}
              {reportsHref && (
                <ActiveLink
                  className="inline-flex min-h-11 items-center rounded-lg px-1 transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  activeClassName="text-orange underline underline-offset-4"
                  href={reportsHref}
                >
                  {reportsLabel}
                </ActiveLink>
              )}
            </nav>
          </StudentHeaderNavigation>

          <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <span className={me ? 'contents' : 'hidden sm:contents'}>{localeSwitch(true)}</span>
            {!activeRole && (
              <details className={`relative lg:hidden ${me ? '' : 'order-last'}`}>
                <summary
                  aria-label={locale === 'ar' ? 'القائمة' : 'Menu'}
                  className="grid size-11 cursor-pointer list-none place-items-center rounded-xl border border-line-strong text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange [&::-webkit-details-marker]:hidden"
                >
                  <Menu size={17} aria-hidden="true" />
                </summary>
                <nav
                  className="absolute end-0 top-[calc(100%+0.5rem)] z-40 grid min-w-48 gap-1 rounded-2xl border border-line bg-white p-2 shadow-lg"
                  aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Primary navigation'}
                >
                  {me && (
                    <Link
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-teal hover:bg-cream"
                      href={dashboardHref}
                    >
                      {t.dashboard}
                    </Link>
                  )}
                  {showDiscovery && (
                    <Link
                      className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-teal hover:bg-cream"
                      href={`/${locale}/teachers`}
                    >
                      <Search size={16} aria-hidden="true" />
                      {t.discover}
                    </Link>
                  )}
                  {!me && (
                    <Link
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-teal hover:bg-cream"
                      href={`/${locale}/register?role=teacher`}
                    >
                      {t.teachOnDarsak}
                    </Link>
                  )}
                  {me && (
                    <Link
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-teal hover:bg-cream"
                      href={`/${locale}/account`}
                    >
                      {t.account}
                    </Link>
                  )}
                  {reportsHref && (
                    <Link
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-teal hover:bg-cream"
                      href={reportsHref}
                    >
                      {reportsLabel}
                    </Link>
                  )}
                  {!me && (
                    <div className="mt-1 border-t border-line pt-2 sm:hidden [&_a]:w-full [&_a]:justify-start [&_a]:border-0 [&_a]:px-3 [&_a]:text-sm">
                      {localeSwitch(false)}
                    </div>
                  )}
                </nav>
              </details>
            )}
            {me ? (
              <form action={logoutAction} data-confirm-unsaved-navigation>
                <button
                  aria-label={t.logout}
                  title={t.logout}
                  className="grid size-11 place-items-center rounded-xl border border-line-strong text-sm font-bold text-teal transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:inline-flex sm:h-11 sm:w-auto sm:min-w-0 sm:items-center sm:gap-2 sm:px-3"
                >
                  <LogOut size={17} aria-hidden="true" className="sm:hidden" />
                  <span className="sr-only sm:not-sr-only">{t.logout}</span>
                </button>
              </form>
            ) : (
              <>
                <Link
                  className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl px-2 text-sm font-bold text-teal transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  href={`/${locale}/login`}
                >
                  <span className="sm:hidden">{locale === 'ar' ? 'دخول' : 'Log in'}</span>
                  <span className="hidden sm:inline">{t.login}</span>
                </Link>
                <Link
                  aria-label={t.register}
                  className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-orange px-3 text-sm font-bold text-white transition-colors hover:bg-orange-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:px-4 sm:text-sm"
                  href={`/${locale}/register`}
                >
                  <span className="sm:hidden">{locale === 'ar' ? 'ابدأ' : 'Join'}</span>
                  <span className="hidden sm:inline">{t.register}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {activeRole && (
        <MobileWorkspaceNavigation
          locale={locale}
          role={activeRole}
          name={me?.profile?.full_name ?? ''}
          unreadCount={unreadCount}
          items={workspaceItems}
        />
      )}
    </>
  );
}
