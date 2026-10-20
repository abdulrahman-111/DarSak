import { redirect } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';

export default async function LegacyTeacherProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const search = new URLSearchParams();
  if (query.onboarding === '1') search.set('onboarding', '1');
  if (query.onboarding_error === 'load') search.set('onboarding_error', 'load');
  const suffix = search.size ? `?${search.toString()}` : '';
  redirect(`/${locale}/account/profile${suffix}`);
}
