import '../globals.css';
import { notFound } from 'next/navigation';
import { direction, isLocale } from '@admin/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div lang={locale} dir={direction(locale)}>
      {children}
    </div>
  );
}
