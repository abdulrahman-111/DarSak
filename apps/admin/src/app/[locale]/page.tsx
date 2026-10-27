import { redirect } from 'next/navigation';
import { isLocale } from '@admin/lib/i18n';

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect('/ar/login');
  redirect(`/${locale}/admin`);
}
