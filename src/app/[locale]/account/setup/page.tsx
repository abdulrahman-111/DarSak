import { ensureLocale } from '@/i18n/config';
import { AccountPageFrame } from '@/features/account/account-page-frame';
import { accountSetupData } from '@/features/setup/data';
import { SetupWizard } from '@/features/setup/wizard';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';
import { getRequestViewer } from '@/features/platform/request-viewer';

export default async function AccountSetupPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const unavailable = <AccountPageFrame><p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{locale === 'ar' ? 'تعذر تحميل الإعداد المحفوظ. حاول مجدداً.' : 'We could not load your saved setup. Please try again.'}</p><a className="mt-4 inline-flex min-h-12 items-center rounded-xl border border-teal px-5 font-bold text-teal" href={`/${locale}/account/setup`}>{locale === 'ar' ? 'إعادة المحاولة' : 'Try again'}</a></AccountPageFrame>;
  const viewer = await getRequestViewer();
  if (viewer.user && !viewer.profile) return unavailable;
  const candidate = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  const data = await accountSetupData(locale, candidate);
  if (data.error || !data.draft) return unavailable;
  return <AccountPageFrame>{data.role === 'teacher' && <TeacherSubscriptionNotice locale={locale} signedInTeacher/>}<SetupWizard locale={locale} role={data.role} draft={data.draft} offerings={data.offerings} subjects={data.subjects} nodes={data.nodes} returnTo={data.draft.return_to} hasAvatar={data.hasAvatar} loadError={false}/></AccountPageFrame>;
}
