import Link from 'next/link';
import { getDictionary } from '@/i18n/config';
import { AuthAside } from '@/components/auth/auth-aside';
import { authCopy } from '@/components/auth/copy';
import { ForgotPasswordForm } from '@/components/auth/password-forms';

export default async function ForgotPassword({
  params,
}: {
  params: Promise<{ locale: 'ar' | 'en' }>;
}) {
  const { locale } = await params;
  const labels = await getDictionary(locale);
  const copy = authCopy[locale];

  return (
    <div className="bg-cream">
      <div className="container grid min-h-[calc(100vh-9rem)] gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(19rem,.72fr)] md:items-center md:py-16">
        <section className="flex items-center">
          <div className="w-full max-w-xl rounded-[1.4rem] border border-line bg-surface p-6 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">
              {copy.forgotEyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.03em] text-teal md:text-5xl">
              {copy.forgotTitle}
            </h1>
            <p className="mt-4 max-w-lg leading-7 text-ink-soft">{copy.forgotBody}</p>
            <div className="mt-8">
              <ForgotPasswordForm locale={locale} emailLabel={labels.email} />
            </div>
            <p className="mt-6 text-center text-sm">
              <Link className="font-bold text-orange" href={`/${locale}/login`}>
                {copy.backToLogin}
              </Link>
            </p>
          </div>
        </section>
        <AuthAside locale={locale} />
      </div>
    </div>
  );
}
