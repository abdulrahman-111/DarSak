import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { localeStaticParams } from '@/i18n/static-params';
import { GuidancePageView } from '@/features/help/page';
import { guidanceContent } from '@/features/help/content';
import { pageMetadata } from '@/features/seo/metadata';

// Public copy with no per-user data: prerendered for both locales and refreshed hourly.
export const revalidate = 3600;
export const generateStaticParams = localeStaticParams;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = ensureLocale((await params).locale);
  const { title, intro } = guidanceContent('privacy', locale);
  return pageMetadata({ locale, path: '/privacy', title, description: intro });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <GuidancePageView kind="privacy" locale={ensureLocale(locale)} />;
}
