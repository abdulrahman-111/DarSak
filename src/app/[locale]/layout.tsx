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
        <Header locale={locale} t={t} />
        <main>{children}</main>
        <footer className="mt-20 border-t border-line py-8">
          <div className="container flex justify-between text-sm text-muted">
            <span>{t.brand} · {t.tagline}</span>
            <span>© 2026</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
