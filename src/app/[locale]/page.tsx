import Link from 'next/link';
import Image from 'next/image';
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
    if (
      profile?.status === 'active' &&
      (profile.role === 'student' || profile.role === 'teacher' || profile.role === 'admin')
    ) {
      redirect(roleHome(locale, profile.role));
    }
  }
  const t = await getDictionary(locale);
  const c = publicCopy[locale];
  const groupResult = configured ? await publicGroups(undefined, 3) : null;
  const groups = groupResult?.data ?? [];
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const featureIcons = [
    '/brand/darsak/find-a-group-that-fits-you.svg',
    '/brand/darsak/organize-classes.svg',
    '/brand/darsak/prepare-for-class.svg',
    '/brand/darsak/showcase-teaching-style.svg',
    '/brand/darsak/plan-groups-easily.svg',
    '/brand/darsak/manage-each-group.svg',
  ];
  const subjectIcons = [
    '/brand/darsak/academic-subjects.svg',
    '/brand/darsak/languages.svg',
    '/brand/darsak/programming.svg',
    '/brand/darsak/custom-categories.svg',
  ];

  return (
    <div className="bg-cream">
      <section className="container grid gap-12 py-14 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-20 lg:gap-16">
        <div className="landing-intro">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-teal">
            <Image
              aria-hidden="true"
              src="/brand/darsak/hero-badge-icon.svg"
              alt=""
              width={20}
              height={20}
              className="size-5"
            />
            {c.eyebrow}
          </p>
          <h1
            className={`mt-6 max-w-3xl text-5xl font-black ${locale === 'ar' ? 'leading-[1.18]' : 'leading-[1.02]'} tracking-[-.04em] text-teal md:text-6xl lg:text-7xl`}
          >
            {c.heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink-soft">{c.heroBody}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/teachers`}
              className="inline-flex min-h-12 items-center gap-2 rounded-[.9rem] bg-orange px-6 font-bold text-white transition hover:-translate-y-0.5 hover:bg-orange-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              {c.findGroup}
              <Arrow size={18} />
            </Link>
            <Link
              href={`/${locale}/register?role=teacher`}
              className="inline-flex min-h-12 items-center rounded-[.9rem] border-2 border-teal px-6 font-bold text-teal transition hover:bg-teal hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
            >
              {c.teach}
            </Link>
          </div>
        </div>
        <WeeklyPreview locale={locale} />
      </section>

      <div
        role="group"
        aria-label={c.highlights}
        className="border-y border-line bg-surface py-3.5"
      >
        <div className="container flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm font-bold text-teal sm:justify-between sm:text-base">
          {c.subjectRange.map((item, index) => (
            <span key={item} className="flex items-center gap-7">
              <span className="inline-flex items-center gap-2">
                <Image aria-hidden="true" src={subjectIcons[index]} alt="" width={20} height={20} />
                {item}
              </span>
              {index < c.subjectRange.length - 1 && (
                <span aria-hidden="true" className="size-1.5 rounded-full bg-orange" />
              )}
            </span>
          ))}
        </div>
      </div>

      <section id="highlights" className="container scroll-mt-40 py-16 md:scroll-mt-24 md:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{c.highlights}</p>
          <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-teal md:text-4xl">
            {c.highlightsTitle}
          </h2>
        </div>
        {[c.students, c.teachers].map((groupTitle, groupIndex) => (
          <div key={groupTitle} className="mt-9">
            <h3 className="text-xl font-bold text-teal">{groupTitle}</h3>
            <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {c.featureCards
                .slice(groupIndex * 3, groupIndex * 3 + 3)
                .map(([title, body], index) => {
                  const icon = featureIcons[groupIndex * 3 + index];
                  return (
                    <article
                      key={title}
                      className="landing-feature-card min-w-0 rounded-[1.15rem] border border-line bg-surface p-5 sm:p-6"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-11 place-items-center rounded-xl bg-[#d5ebe6]"
                      >
                        <Image src={icon} alt="" width={24} height={24} />
                      </span>
                      <h4 className="mt-4 text-lg font-bold leading-snug text-ink">{title}</h4>
                      <p className="mt-2 break-words text-sm leading-6 text-ink-soft">{body}</p>
                    </article>
                  );
                })}
            </div>
          </div>
        ))}
      </section>

      <section
        id="how-it-works"
        className="container scroll-mt-40 grid gap-7 py-16 md:grid-cols-4 md:scroll-mt-24 md:py-20"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{c.how}</p>
          <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-teal">
            {c.howTitle}
          </h2>
        </div>
        {c.steps.map(([number, title, body]) => (
          <div key={number} className="border-t-2 border-teal pt-5">
            <p className="text-4xl font-black text-orange">{number}</p>
            <h3 className="mt-3 text-lg font-bold text-ink">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{body}</p>
          </div>
        ))}
      </section>

      <section id="groups" className="container scroll-mt-40 pb-20 md:scroll-mt-24">
        <div className="mb-6 flex items-end justify-between gap-5">
          <h2 className="text-3xl font-black tracking-tight text-teal">{c.featured}</h2>
          <Link
            href={`/${locale}/teachers`}
            className="hidden items-center gap-1 font-bold text-orange sm:flex"
          >
            {c.viewAll}
            <Arrow size={17} />
          </Link>
        </div>
        {!configured ? (
          <SetupCard t={t} />
        ) : groups.length ? (
          <div className="grid gap-5 md:grid-cols-3">
            {groups.slice(0, 3).map(group => (
              <GroupCard key={group.id} group={group} locale={locale} t={t} />
            ))}
          </div>
        ) : groupResult?.error ? (
          <div className="rounded-[1.15rem] border border-dashed border-line-strong bg-surface p-8 text-center">
            <p className="text-muted">{c.groupsError}</p>
            <form action={`/${locale}#groups`} className="mt-3">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-lg px-3 font-bold text-orange underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              >
                {c.retry}
              </button>
            </form>
          </div>
        ) : (
          <p className="rounded-[1.15rem] border border-dashed border-line-strong bg-surface p-10 text-center text-muted">
            {t.noGroups}
          </p>
        )}
        <Link
          href={`/${locale}/teachers`}
          className="mt-5 inline-flex items-center gap-1 font-bold text-orange sm:hidden"
        >
          {c.viewAll}
          <Arrow size={17} />
        </Link>
      </section>

      <section id="for-teachers" className="scroll-mt-40 bg-teal text-cream md:scroll-mt-24">
        <div className="container grid gap-10 py-16 md:grid-cols-[1.05fr_.95fr] md:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#f3a878]">
              {c.teacherEyebrow}
            </p>
            <h2 className="mt-4 max-w-2xl text-4xl font-black leading-tight tracking-tight md:text-5xl">
              {c.teacherTitle}
            </h2>
            <p className="mt-5 max-w-xl leading-7 text-[#cfe3de]">{c.teacherBody}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/register?role=teacher`}
                className="inline-flex min-h-12 items-center rounded-[.9rem] bg-cream px-6 font-bold text-teal transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-teal"
              >
                {c.teach}
              </Link>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#cfe3de]">{c.approvalNote}</p>
          </div>
          <div className="grid content-center gap-4 sm:grid-cols-2">
            {c.teacherFeatures.map(feature => (
              <div
                key={feature}
                className="flex items-center gap-3 border-t border-[#3d6f6f] py-4 font-bold"
              >
                <CheckCircle2 className="text-[#8fd1b5]" size={20} />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-16 md:py-20" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-3xl font-black tracking-tight text-teal">
          {c.faqTitle}
        </h2>
        <div className="mt-6 divide-y divide-line rounded-[1.15rem] border border-line bg-surface px-5 sm:px-7">
          {c.faq.map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="cursor-pointer text-base font-bold text-teal marker:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                {question}
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-soft">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
