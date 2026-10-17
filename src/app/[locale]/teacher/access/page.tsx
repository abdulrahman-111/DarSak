import { redirect } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';

export default async function LegacyTeacherAccessPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const search = new URLSearchParams();
  if (query.error === 'unavailable') search.set('error', 'unavailable');
  if (query.retry === '1') search.set('retry', '1');
  const suffix = search.size ? `?${search.toString()}` : '';
  redirect(`/${locale}/account/teaching-access${suffix}`);
}
