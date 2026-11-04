import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { localeStaticParams } from '@/i18n/static-params';
import { GuidancePageView } from '@/features/help/page';
import { guidanceContent } from '@/features/help/content';
import { pageMetadata } from '@/features/seo/metadata';
import { getDictionary } from '@/i18n/config';
import { InstallControl } from '@/features/pwa/install-control';

// Public copy with no per-user data: prerendered for both locales and refreshed hourly.
export const revalidate = 3600;
export const generateStaticParams = localeStaticParams;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = ensureLocale((await params).locale);
  const { title, intro } = guidanceContent('help', locale);
  return pageMetadata({ locale, path: '/help', title, description: intro });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale = ensureLocale(locale);
  const dictionary = await getDictionary(currentLocale);
  return (
    <>
      <GuidancePageView kind="help" locale={currentLocale} />
      <section className="container mb-12 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="mb-4 text-xl font-bold text-teal">
          {currentLocale === 'ar' ? 'تثبيت درسك' : 'Install DarSak'}
        </h2>
        <InstallControl locale={currentLocale} copy={dictionary.pwa} />
      </section>
    </>
  );
}
