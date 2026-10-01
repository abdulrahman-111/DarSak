import Link from 'next/link';
import { BookOpen, Globe2, Menu } from 'lucide-react';
import { logoutAction } from '@/features/auth/actions';
import { currentUser } from '@/features/platform/data';
import { isConfigured } from '@/lib/supabase/server';

export async function Header({ locale, t }: { locale: string; t: Record<string, string> }) {
  const me = isConfigured() ? await currentUser() : null;
  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  return (
    <header className="sticky top-0 z-30 border-b border-[#e3d9c8] bg-[#f6f0e4]/95 backdrop-blur-lg">
      <div className="container flex min-h-16 items-center gap-5 py-3">
        <Link href={`/${locale}`} className="flex items-center gap-2.5 text-xl font-black text-teal" aria-label={t.home}>
          <span className="grid size-9 place-items-center rounded-[.7rem] bg-teal text-lg font-black text-cream">
            {locale === 'ar' ? 'د' : <BookOpen size={18}/>}
          </span>
          {t.brand}
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-bold text-[#4d473f] md:flex" aria-label={t.home}>
          <Link className="transition hover:text-orange" href={`/${locale}/teachers`}>{t.discover}</Link>
          {!me && <Link className="transition hover:text-orange" href={`/${locale}/register?role=teacher`}>{t.teacherRole}</Link>}
          {me && <Link className="transition hover:text-orange" href={`/${locale}/dashboard`}>{t.dashboard}</Link>}
          {me && <Link className="transition hover:text-orange" href={`/${locale}/reports`}>{t.reports}</Link>}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <Link
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#d8ccb8] px-3 text-sm font-bold text-teal transition hover:bg-[#efe6d5]"
            href={`/${otherLocale}`}
            hrefLang={otherLocale}
          >
            <Globe2 size={16}/><span className="hidden sm:inline">{locale === 'ar' ? 'English' : 'العربية'}</span>
          </Link>
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
          <Link className="rounded-lg p-2 text-teal md:hidden" href={`/${locale}/teachers`} aria-label={t.discover}><Menu size={20}/></Link>
        </div>
      </div>
    </header>
  );
}
