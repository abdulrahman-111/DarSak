import Link from 'next/link';
import { getDictionary } from '@/i18n/config';
import { AuthAside } from '@/components/auth/auth-aside';
import { AuthForm } from '@/components/auth/auth-form';
import { authCopy } from '@/components/auth/copy';
export const maxDuration = 40;

type SearchValue = string | string[] | undefined;

export default async function Register({
  params,
  searchParams,
}: {
  params: Promise<{ locale: 'ar' | 'en' }>;
  searchParams: Promise<{ role?: SearchValue }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const labels = await getDictionary(locale);
  const copy = authCopy[locale];
  const requestedRole = Array.isArray(query.role) ? query.role[0] : query.role;
  const initialRole = requestedRole === 'teacher' ? 'teacher' : 'student';

  return (
    <div className="bg-cream">
      <div className="container grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(19rem,.72fr)] md:items-start md:py-16">
        <section className="min-w-0 rounded-[1.4rem] border border-line bg-surface p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{copy.createEyebrow}</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-.03em] text-teal md:text-5xl">{copy.createTitle}</h1>
          <p className="mt-4 max-w-xl leading-7 text-ink-soft">{copy.createBody}</p>
          <div className="mt-8"><AuthForm locale={locale} mode="signup" labels={labels} initialRole={initialRole}/></div>
          <p className="mt-6 text-center text-sm text-muted">{copy.haveAccount} <Link className="font-bold text-orange" href={`/${locale}/login`}>{copy.signIn}</Link></p>
        </section>
        <div className="md:sticky md:top-24"><AuthAside locale={locale}/></div>
      </div>
    </div>
  );
}
