import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { getDictionary } from '@/i18n/config';
import { publicGroups } from '@/features/platform/data';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { roleHome } from '@/components/platform/access';
import { GroupCard, SetupCard } from '@/components/ui';
import { isConfigured } from '@/lib/supabase/server';
import { publicCopy } from '@/components/public/copy';
import { WeeklyPreview } from '@/components/public/weekly-preview';

export default async function Home({ params }: { params: Promise<{ locale: 'ar' | 'en' }> }) {
  const { locale } = await params;
  const configured = isConfigured();
  if (configured) {
    const { profile } = await getRequestViewer();
    if (profile?.status === 'active' && (profile.role === 'student' || profile.role === 'teacher' || profile.role === 'admin')) {
      redirect(roleHome(locale, profile.role));
    }
  }
  const t = await getDictionary(locale);
  const c = publicCopy[locale];
  const groups = configured ? (await publicGroups()).data : [];
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const ticker = locale === 'ar'
    ? ['المرحلة الابتدائية', 'المرحلة الإعدادية', 'الثانوية العامة', 'المنهج الدولي']
    : ['Primary', 'Preparatory', 'Secondary', 'International'];

  return (
    <div className="overflow-hidden bg-[#f6f0e4]">
      <section className="container grid gap-12 py-14 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-20 lg:gap-16">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-teal">
            <span className="size-2 rounded-full bg-orange"/>{c.eyebrow}
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[1.02] tracking-[-.04em] text-teal md:text-6xl lg:text-7xl">{c.heroTitle}</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#4d473f]">{c.heroBody}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/${locale}/teachers`} className="inline-flex h-[52px] items-center gap-2 rounded-[.9rem] bg-orange px-6 font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#c4561a]">
              {c.findGroup}<Arrow size={18}/>
            </Link>
            <Link href={`/${locale}/register?role=teacher`} className="inline-flex h-[52px] items-center rounded-[.9rem] border-2 border-teal px-6 font-bold text-teal transition hover:bg-teal hover:text-cream">
              {c.teach}
            </Link>
          </div>
        </div>
        <WeeklyPreview locale={locale}/>
      </section>

      <div className="border-y border-[#e3d9c8] bg-[#fffdf8] py-3.5" aria-label={t.education}>
        <div className="container flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm font-bold text-teal sm:justify-between sm:text-base">
          {ticker.map((item, index) => <span key={item} className="flex items-center gap-7">{item}{index < ticker.length - 1 && <span className="size-1.5 rounded-full bg-orange"/>}</span>)}
        </div>
      </div>

      <section className="container grid gap-7 py-16 md:grid-cols-4 md:py-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{c.how}</p>
          <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-teal">{c.howTitle}</h2>
        </div>
        {c.steps.map(([number, title, body]) => (
          <div key={number} className="border-t-2 border-teal pt-5">
            <p className="text-4xl font-black text-orange">{number}</p>
            <h3 className="mt-3 text-lg font-bold text-ink">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#4d473f]">{body}</p>
          </div>
        ))}
      </section>

      <section className="container pb-20">
        <div className="mb-6 flex items-end justify-between gap-5">
          <h2 className="text-3xl font-black tracking-tight text-teal">{c.featured}</h2>
          <Link href={`/${locale}/teachers`} className="hidden items-center gap-1 font-bold text-orange sm:flex">{c.viewAll}<Arrow size={17}/></Link>
        </div>
        {!configured ? (
          <SetupCard t={t}/>
        ) : groups.length ? (
          <div className="grid gap-5 md:grid-cols-3">{groups.slice(0, 3).map(group => <GroupCard key={group.id} group={group} locale={locale} t={t}/>)}</div>
        ) : (
          <p className="rounded-[1.15rem] border border-dashed border-[#d8ccb8] bg-[#fffdf8] p-10 text-center text-muted">{t.noGroups}</p>
        )}
        <Link href={`/${locale}/teachers`} className="mt-5 inline-flex items-center gap-1 font-bold text-orange sm:hidden">{c.viewAll}<Arrow size={17}/></Link>
      </section>

      <section className="bg-teal text-cream">
        <div className="container grid gap-10 py-16 md:grid-cols-[1.05fr_.95fr] md:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#f3a878]">{c.teacherEyebrow}</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-black leading-tight tracking-tight md:text-5xl">{c.teacherTitle}</h2>
            <p className="mt-5 max-w-xl leading-7 text-[#cfe3de]">{c.teacherBody}</p>
            <Link href={`/${locale}/register?role=teacher`} className="mt-7 inline-flex h-[52px] items-center rounded-[.9rem] bg-cream px-6 font-bold text-teal transition hover:bg-white">{c.teach}</Link>
          </div>
          <div className="grid content-center gap-4 sm:grid-cols-2">
            {c.teacherFeatures.map(feature => <div key={feature} className="flex items-center gap-3 border-t border-[#3d6f6f] py-4 font-bold"><CheckCircle2 className="text-[#8fd1b5]" size={20}/>{feature}</div>)}
          </div>
        </div>
      </section>
    </div>
  );
}
