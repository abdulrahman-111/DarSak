import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { GuidancePageView } from '@/features/help/page';
import { guidanceContent } from '@/features/help/content';
import { pageMetadata } from '@/features/seo/metadata';

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
  return <GuidancePageView kind="help" locale={ensureLocale(locale)} />;
}
