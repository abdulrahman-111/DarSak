import { redirect } from 'next/navigation';
import { localeStaticParams } from '@/i18n/static-params';

// Static per locale and refreshed hourly: the page only redirects to the localized home.
export const revalidate = 3600;
export const generateStaticParams = localeStaticParams;

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}`);
}
