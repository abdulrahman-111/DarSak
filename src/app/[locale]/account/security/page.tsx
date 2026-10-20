import { requireViewer } from '@/components/platform/access';
import { ScreenTitle } from '@/components/platform/ui';
import { ensureLocale } from '@/i18n/config';
import { authCopy } from '@/components/auth/copy';
import { ResetPasswordForm } from '@/components/auth/password-forms';
import { AccountBackLink } from '@/features/account/account-back-link';
import { AccountPageFrame } from '@/features/account/account-page-frame';

export default async function AccountSecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const viewer = await requireViewer(locale);
  const copy = authCopy[locale];
  const ar = locale === 'ar';
  return (
    <AccountPageFrame>
      <>
        <AccountBackLink locale={locale} />
        <ScreenTitle
          eyebrow={ar ? 'حسابك' : 'Your account'}
          title={ar ? 'الأمان' : 'Security'}
          description={ar ? 'حدّث كلمة مرور حسابك.' : 'Update your account password.'}
        />
        <section className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-5 sm:p-8">
          <dl className="mb-6 grid gap-4 border-b border-line pb-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">{ar ? 'البريد الإلكتروني' : 'Email address'}</dt>
              <dd className="mt-1 break-all font-bold" dir="auto">
                {viewer.email ?? (ar ? 'غير متاح' : 'Unavailable')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{ar ? 'طرق تسجيل الدخول' : 'Sign-in methods'}</dt>
              <dd className="mt-1 font-bold">
                {viewer.signInMethods.length
                  ? viewer.signInMethods
                      .map(method =>
                        method === 'google'
                          ? 'Google'
                          : method === 'email'
                            ? ar
                              ? 'البريد الإلكتروني'
                              : 'Email'
                            : method,
                      )
                      .join(', ')
                  : ar
                    ? 'غير متاحة'
                    : 'Unavailable'}
              </dd>
            </div>
          </dl>
          <h2 className="text-xl font-black text-teal">
            {ar ? 'تغيير كلمة المرور' : 'Change your password'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {ar
              ? 'أدخل كلمة مرورك الحالية للتحقق من هويتك، ثم اختر كلمة مرور جديدة.'
              : 'Enter your current password to verify your identity, then choose a new password.'}
          </p>
          <div className="mt-6">
            <ResetPasswordForm locale={locale} requireCurrentPassword />
          </div>
        </section>
      </>
    </AccountPageFrame>
  );
}
