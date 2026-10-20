import { redirect } from 'next/navigation';
import { AuthAside } from '@/components/auth/auth-aside';
import { authCopy } from '@/components/auth/copy';
import { ResetPasswordForm } from '@/components/auth/password-forms';
import { getVerifiedRecoveryUser } from '@/lib/supabase/server';

export default async function ResetPassword({
  params,
}: {
  params: Promise<{ locale: 'ar' | 'en' }>;
}) {
  const { locale } = await params;
  // The callback issues short-lived proof only for a verified recovery session.
  if (!(await getVerifiedRecoveryUser())) redirect(`/${locale}/forgot-password`);
  const copy = authCopy[locale];

  return (
    <div className="bg-cream">
      <div className="container grid min-h-[calc(100vh-9rem)] gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(19rem,.72fr)] md:items-center md:py-16">
        <section className="flex items-center">
          <div className="w-full max-w-xl rounded-[1.4rem] border border-line bg-surface p-6 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">
              {copy.resetEyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.03em] text-teal md:text-5xl">
              {copy.resetTitle}
            </h1>
            <p className="mt-4 max-w-lg leading-7 text-ink-soft">{copy.resetBody}</p>
            <div className="mt-8">
              <ResetPasswordForm locale={locale} />
            </div>
          </div>
        </section>
        <AuthAside locale={locale} />
      </div>
    </div>
  );
}
