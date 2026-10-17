import type { Metadata } from 'next';
import Link from 'next/link';
import { TEACHER_PLANS } from '@/features/subscriptions/plans';
import { pricingCopy } from '@/features/subscriptions/pricing-copy';
import { currentUser } from '@/features/platform/data';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return locale === 'ar'
    ? { title: 'خطط المعلمين | DarSak', description: 'الخطط الشهرية القادمة للمعلمين على DarSak.' }
    : { title: 'Teacher plans | DarSak', description: 'Upcoming monthly plans for teachers on DarSak.' };
}

function PlanCard({ plan, title, copy, locale }: { plan: typeof TEACHER_PLANS.standard | typeof TEACHER_PLANS.pro; title: string; copy: ReturnType<typeof pricingCopy>; locale: string }) {
  const rows = [
    [copy.groups, String(plan.activeGroups)],
    [copy.files, String(plan.storedFiles)],
    [copy.storage, plan.storageBytes === TEACHER_PLANS.standard.storageBytes ? '250 MiB' : '1 GiB'],
    [copy.perFile, '10 MiB'],
  ];
  return <article className="rounded-3xl border border-[#d8ccb8] bg-white p-6 shadow-sm">
    <h3 className="text-xl font-black text-teal">{title}</h3>
    <p className="mt-4 text-3xl font-black text-[#29251f]" dir={locale === 'ar' ? 'rtl' : 'ltr'}>{locale === 'ar' ? `${plan.monthlyEgp} جنيه ${copy.month}` : `${plan.monthlyEgp} EGP / ${copy.month}`}</p>
    <dl className="mt-6 divide-y divide-[#eee6d8]">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3"><dt className="text-sm text-[#4d473f]">{label}</dt><dd dir="ltr" className="text-end text-sm font-black text-[#29251f]">{value}</dd></div>)}</dl>
    <p className="mt-4 rounded-xl bg-[#f6f0e4] px-3 py-2 text-xs font-bold text-[#62594d]">{copy.availability}</p>
  </article>;
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const ar = locale === 'ar';
  const copy = pricingCopy(locale);
  const me = await currentUser();
  const activeRole = me?.profile?.status === 'active' ? me.profile.role : null;
  const ctaHref = !me ? `/${locale}/register?role=teacher`
    : activeRole === 'teacher' ? `/${locale}/account/teaching-access`
      : activeRole === 'student' ? `/${locale}/teachers`
        : activeRole === 'admin' ? `/${locale}/admin`
          : `/${locale}/account`;
  const ctaLabel = !me ? copy.cta
    : activeRole === 'teacher' ? copy.ctaTeacher
      : activeRole === 'student' ? copy.ctaStudent
        : activeRole === 'admin' ? copy.ctaAdmin
          : copy.ctaAccount;
  return <div className="container py-10 sm:py-16">
    <header className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-black uppercase tracking-wide text-orange">{copy.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-black text-teal sm:text-5xl">{copy.title}</h1>
      <p className="mt-5 text-base leading-7 text-[#4d473f]">{copy.intro}</p>
      <div className="mt-6 rounded-2xl border border-[#d8ccb8] bg-[#fffdf8] p-5 text-start" role="note">
        <p className="font-black text-teal">{copy.free}</p><p className="mt-2 text-sm leading-6 text-[#4d473f]">{copy.start}</p>
      </div>
    </header>
    <section className="mx-auto mt-10 max-w-4xl" aria-label={ar ? 'مقارنة الخطط' : 'Plan comparison'}>
      <div className="grid gap-5 md:grid-cols-2">
        <PlanCard plan={TEACHER_PLANS.standard} title={copy.standard} copy={copy} locale={locale}/>
        <PlanCard plan={TEACHER_PLANS.pro} title={copy.pro} copy={copy} locale={locale}/>
      </div>
      <p className="mt-5 rounded-2xl bg-[#e0eeec] p-4 text-sm font-bold leading-6 text-teal">{copy.common}</p>
      <p className="mt-3 text-sm leading-6 text-[#62594d]">{copy.quota}</p>
    </section>
    <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-[#d8ccb8] bg-white p-6 sm:p-8">
      <h2 className="text-xl font-black text-teal">{copy.paymentTitle}</h2>
      <p className="mt-3 text-sm leading-7 text-[#4d473f]">{copy.payment}</p>
      <Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-orange px-5 py-3 text-sm font-black text-white hover:bg-[#c4561a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange" href={ctaHref}>{ctaLabel}</Link>
    </section>
  </div>;
}
