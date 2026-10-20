import { redirect } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';

export default async function LegacyStudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const suffix = query.onboarding_error === 'load' ? '?onboarding_error=load' : '';
  redirect(`/${locale}/account/learning-profile${suffix}`);
}
