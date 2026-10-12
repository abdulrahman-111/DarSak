import Link from 'next/link';
import { getDictionary } from '@/i18n/config';
import { AuthAside } from '@/components/auth/auth-aside';
import { authCopy } from '@/components/auth/copy';
import { ResendConfirmationForm } from '@/components/auth/password-forms';

export default async function CheckEmail({ params, searchParams }: {
  params: Promise<{ locale: 'ar' | 'en' }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const labels = await getDictionary(locale);
  const copy = authCopy[locale];
  const raw = Array.isArray(query.email) ? query.email[0] : query.email;
  const email = raw && raw.length <= 254 ? raw : undefined;

  return (
    <div className="bg-[#f6f0e4]">
      <div className="container grid min-h-[calc(100vh-9rem)] gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(19rem,.72fr)] md:items-stretch md:py-16">
        <section className="flex items-center">
          <div className="w-full max-w-xl rounded-[1.4rem] border border-[#e3d9c8] bg-[#fffdf8] p-6 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{copy.checkEyebrow}</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.03em] text-teal md:text-5xl">{copy.checkTitle}</h1>
            <p className="mt-4 max-w-lg leading-7 text-[#4d473f]">
              {email ? <>{copy.checkSentTo} <bdi dir="ltr" className="font-bold text-ink">{email}</bdi>. </> : null}
              {copy.checkBody}
            </p>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted">{copy.resendHint}</p>
            <div className="mt-8"><ResendConfirmationForm locale={locale} emailLabel={labels.email} email={email}/></div>
            <p className="mt-6 text-center text-sm"><Link className="font-bold text-orange" href={`/${locale}/login`}>{copy.backToLogin}</Link></p>
          </div>
        </section>
        <AuthAside locale={locale}/>
      </div>
    </div>
  );
}
