import type { Metadata } from 'next';
import { pageMetadata } from '@/features/seo/metadata';
import { seoCopy } from '@/features/seo/copy';
import Link from 'next/link';
import { ensureLocale, getDictionary } from '@/i18n/config';
import { AuthAside } from '@/components/auth/auth-aside';
import { AuthForm } from '@/components/auth/auth-form';
import { authCopy } from '@/components/auth/copy';
import { safeLoginReturnPath } from '@/features/auth/return-path';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = ensureLocale((await params).locale);
  return pageMetadata({ locale, path: '/login', ...seoCopy[locale].login });
}

export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ locale: 'ar' | 'en' }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const { next, error, google_role: googleRole, actual } = await searchParams;
  const labels = await getDictionary(locale);
  const copy = authCopy[locale];
  const returnPath = safeLoginReturnPath(locale, next);
  const linkFailed = error === 'link';
  const setupFailed = error === 'setup';
  const roleMismatch = error === 'role-mismatch';
  const adminSignInRejected = error === 'admin-portal';
  const actualRole =
    actual === 'student' || actual === 'teacher' || actual === 'admin' ? actual : null;
  const actualRoleLabel =
    actualRole === 'student'
      ? copy.studentRole
      : actualRole === 'teacher'
        ? copy.teacherRole
        : actualRole === 'admin'
          ? copy.adminRole
          : '';
  const googleRetryRole =
    setupFailed && (googleRole === 'student' || googleRole === 'teacher') ? googleRole : null;

  return (
    <div className="bg-cream">
      <div className="container grid min-h-[calc(100vh-9rem)] gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(19rem,.72fr)] md:items-center md:py-16">
        <section className="flex items-center">
          <div className="w-full max-w-xl rounded-[1.4rem] border border-line bg-surface p-6 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">
              {copy.loginEyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.03em] text-teal md:text-5xl">
              {copy.loginTitle}
            </h1>
            <p className="mt-4 max-w-lg leading-7 text-ink-soft">{copy.loginBody}</p>
            {adminSignInRejected && (
              <p role="alert" className="mt-6 rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]">
                {copy.adminSignInRejected}
              </p>
            )}
            {linkFailed && (
              <p role="alert" className="mt-6 rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]">
                {copy.linkInvalid}
              </p>
            )}
            {setupFailed && (
              <p role="alert" className="mt-6 rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]">
                {copy.googleSetupFailed}
              </p>
            )}
            {roleMismatch && (
              <div
                role="status"
                className="mt-6 rounded-xl bg-cream p-4 text-sm leading-6 text-ink-soft"
              >
                <p>{copy.googleRoleMismatch.replace('{role}', actualRoleLabel)}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-bold text-teal underline">
                  {actualRole && (
                    <Link href={`/${locale}/${actualRole}`}>{copy.existingAccount}</Link>
                  )}
                  <Link href={`/${locale}/reports`}>{copy.reportProblem}</Link>
                </div>
              </div>
            )}
            <div className="mt-8">
              <AuthForm
                locale={locale}
                mode="login"
                labels={labels}
                returnPath={returnPath}
                googleRetryRole={googleRetryRole}
              />
            </div>
            <p className="mt-6 text-center text-sm text-muted">
              {copy.needAccount}{' '}
              <Link className="font-bold text-orange" href={`/${locale}/register`}>
                {labels.register}
              </Link>
            </p>
            <p className="mt-3 text-center text-sm">
              <Link className="font-bold text-teal" href={`/${locale}/teachers`}>
                {copy.explore}
              </Link>
            </p>
          </div>
        </section>
        <AuthAside locale={locale} />
      </div>
    </div>
  );
}
