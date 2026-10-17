import type { Metadata } from 'next';
import '../globals.css';
import { ensureLocale, getDictionary, getDirection } from '@/i18n/config';
import { Header } from '@/components/header';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  const t = await getDictionary(ensureLocale(raw));
  return { title: t.brand, description: t.tagline, icons: { icon: '/brand/darsak/favicon.svg' } };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const t = await getDictionary(locale);

  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body>
        <a className="skip-link" href="#main-content">{locale === 'ar' ? 'انتقل إلى المحتوى الرئيسي' : 'Skip to main content'}</a>
        <Header locale={locale} t={t} />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="mt-20 border-t border-line py-8">
          <div className="container flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-sm text-muted">
            <span>{t.brand} · {t.tagline}</span>
            <span>© 2026</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
