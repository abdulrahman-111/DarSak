import Link from 'next/link';
import { Suspense } from 'react';
import { BookOpen, Globe2, Search } from 'lucide-react';
import { logoutAction } from '@/features/auth/actions';
import { currentUser } from '@/features/platform/data';
import { isConfigured } from '@/lib/supabase/server';
import { LocaleSwitch } from './locale-switch';

export async function Header({ locale, t }: { locale: string; t: Record<string, string> }) {
  const me = isConfigured() ? await currentUser() : null;
  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  return (
    <header className="sticky top-0 z-30 border-b border-[#e3d9c8] bg-[#f6f0e4]/95 backdrop-blur-lg">
      <div className="container flex min-h-16 flex-wrap items-center gap-4 py-3 md:gap-5">
        <Link href={`/${locale}`} className="flex items-center gap-2.5 text-xl font-black text-teal" aria-label={t.home}>
          <span className="grid size-9 place-items-center rounded-[.7rem] bg-teal text-lg font-black text-cream">
            {locale === 'ar' ? 'د' : <BookOpen size={18}/>}
          </span>
          {t.brand}
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-bold text-[#4d473f] md:flex" aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Primary navigation'}>
          <Link className="transition hover:text-orange" href={`/${locale}/teachers`}>{t.discover}</Link>
          {!me && <Link className="transition hover:text-orange" href={`/${locale}/register?role=teacher`}>{t.teacherRole}</Link>}
          {me && <Link className="transition hover:text-orange" href={`/${locale}/dashboard`}>{t.dashboard}</Link>}
          {me && <Link className="transition hover:text-orange" href={`/${locale}/reports`}>{t.reports}</Link>}
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
            <form action={logoutAction}>
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
          <Link className="inline-flex items-center gap-1.5 py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={`/${locale}/teachers`}><Search size={16}/>{t.discover}</Link>
          {!me && <Link className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={`/${locale}/register?role=teacher`}>{t.teacherRole}</Link>}
          {me && <Link className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={`/${locale}/dashboard`}>{t.dashboard}</Link>}
          {me && <Link className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={`/${locale}/reports`}>{t.reports}</Link>}
          {!me && <Link className="py-1 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={`/${locale}/login`}>{t.login}</Link>}
        </nav>
      </div>
    </header>
  );
}
