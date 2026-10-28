import { redirect } from 'next/navigation';
import { getAdminAccess } from '@admin/lib/access';
import { isLocale } from '@admin/lib/i18n';
import { logoutAction } from '@admin/app/[locale]/login/actions';
import { CodeField } from '../code-field';
import { mfaCopy } from '../copy';
import { verifyMfaAction } from '../actions';

export default async function VerifyMfaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) redirect('/ar/login');
  const locale = rawLocale;
  const access = await getAdminAccess();
  if (access.status === 'ok') redirect(`/${locale}/admin`);
  if (access.status === 'mfa-enroll') redirect(`/${locale}/mfa/enroll`);
  if (access.status !== 'mfa-verify') redirect(`/${locale}/login`);

  const copy = mfaCopy[locale];
  const { error } = await searchParams;
  const message = error === 'code' ? copy.badCode : error ? copy.unavailable : '';

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <section className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 shadow-xl sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-orange">{copy.brand}</p>
        <h1 className="mt-3 text-3xl font-black text-teal">{copy.verifyTitle}</h1>
        <p className="mt-3 leading-7 text-muted">{copy.verifyIntro}</p>
        {message && (
          <p
            className="mt-5 rounded-xl bg-[#f3e1db] p-3 text-sm leading-6 text-[#6e2414]"
            role="alert"
          >
            {message}
          </p>
        )}
        <form action={verifyMfaAction} className="mt-6 grid gap-4">
          <input type="hidden" name="locale" value={locale} />
          <CodeField label={copy.code} />
          <button
            className="min-h-11 rounded-lg bg-teal px-4 py-3 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            type="submit"
          >
            {copy.submitVerify}
          </button>
        </form>
        <p className="mt-5 text-xs leading-5 text-muted">{copy.lost}</p>
        <form action={logoutAction} className="mt-3">
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="min-h-11 rounded-lg px-3 text-sm font-bold text-orange hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            {copy.logout}
          </button>
        </form>
      </section>
    </main>
  );
}
