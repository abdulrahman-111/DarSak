import Link from 'next/link';
import { getDictionary } from '@/i18n/config';
import { AuthAside } from '@/components/auth/auth-aside';
import { AuthForm } from '@/components/auth/auth-form';
import { authCopy } from '@/components/auth/copy';
import { safeLoginReturnPath } from '@/features/auth/return-path';

export default async function Login({ params, searchParams }: {
  params: Promise<{ locale: 'ar' | 'en' }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const { next, error } = await searchParams;
  const labels = await getDictionary(locale);
  const copy = authCopy[locale];
  const returnPath = safeLoginReturnPath(locale, next);
  const linkFailed = error === 'link';

  return (
    <div className="bg-[#f6f0e4]">
      <div className="container grid min-h-[calc(100vh-9rem)] gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(19rem,.72fr)] md:items-stretch md:py-16">
        <section className="flex items-center">
          <div className="w-full max-w-xl rounded-[1.4rem] border border-[#e3d9c8] bg-[#fffdf8] p-6 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{copy.loginEyebrow}</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.03em] text-teal md:text-5xl">{copy.loginTitle}</h1>
            <p className="mt-4 max-w-lg leading-7 text-[#4d473f]">{copy.loginBody}</p>
            {linkFailed && <p role="alert" className="mt-6 rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]">{copy.linkInvalid}</p>}
            <div className="mt-8"><AuthForm locale={locale} mode="login" labels={labels} returnPath={returnPath}/></div>
            <p className="mt-6 text-center text-sm text-muted">{copy.needAccount} <Link className="font-bold text-orange" href={`/${locale}/register`}>{labels.register}</Link></p>
            <p className="mt-3 text-center text-sm"><Link className="font-bold text-teal" href={`/${locale}/teachers`}>{copy.explore}</Link></p>
          </div>
        </section>
        <AuthAside locale={locale}/>
      </div>
    </div>
  );
}
