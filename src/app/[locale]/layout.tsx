import Link from 'next/link';
import type { Metadata } from 'next';
import '../globals.css';
import { fontVariables } from '../fonts';
import { ensureLocale, getDictionary, getDirection } from '@/i18n/config';
import { Header } from '@/components/header';
import { siteUrl } from '@/lib/supabase/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const t = await getDictionary(ensureLocale(raw));
  return {
    metadataBase: new URL(siteUrl()),
    title: t.brand,
    description: t.tagline,
    icons: { icon: '/brand/darsak/favicon.svg' },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const t = await getDictionary(locale);

  return (
    <html lang={locale} dir={getDirection(locale)} className={fontVariables}>
      <body className="flex min-h-screen flex-col">
        <a className="skip-link" href="#main-content">
          {locale === 'ar' ? 'انتقل إلى المحتوى الرئيسي' : 'Skip to main content'}
        </a>
        <Header locale={locale} t={t} />
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <footer className="mt-20 border-t border-line py-8">
          <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-muted">
            <span>
              {t.brand} · {t.tagline}
            </span>
            <nav
              aria-label={locale === 'ar' ? 'المساعدة والمعلومات' : 'Help and information'}
              className="flex flex-wrap gap-x-5 gap-y-2"
            >
              {[
                ['help', locale === 'ar' ? 'المساعدة' : 'Help'],
                ['privacy', locale === 'ar' ? 'الخصوصية' : 'Privacy'],
                ['terms', locale === 'ar' ? 'إرشادات الاستخدام' : 'Terms'],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={`/${locale}/${href}`}
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 transition-colors hover:text-orange"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <span>
              © {new Date().getFullYear()} {t.brand}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
