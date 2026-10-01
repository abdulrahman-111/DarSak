import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { getDictionary } from '@/i18n/config';
import { publicGroups } from '@/features/platform/data';
import { GroupCard, SetupCard } from '@/components/ui';
import { isConfigured } from '@/lib/supabase/server';
import { publicCopy } from '@/components/public/copy';

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export default async function Teachers({
  params,
  searchParams,
}: {
  params: Promise<{ locale: 'ar' | 'en' }>;
  searchParams: Promise<{ q?: SearchValue; subject?: SearchValue }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getDictionary(locale);
  const c = publicCopy[locale];

  if (!isConfigured()) return <div className="container py-16"><SetupCard t={t}/></div>;

  const { data, error } = await publicGroups();
  const q = first(query.q).trim().toLocaleLowerCase(locale);
  const selectedSubject = first(query.subject);
  const subjectKey = locale === 'ar' ? 'name_ar' : 'name_en';
  const subjects = [...new Set(data.map(group => group.offering?.subject?.[subjectKey]).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, locale));
  const groups = data.filter(group => {
    const subject = group.offering?.subject?.[subjectKey] || '';
    const matchesSubject = !selectedSubject || subject === selectedSubject;
    const haystack = [group.name, group.description, group.location, subject].join(' ').toLocaleLowerCase(locale);
    return matchesSubject && (!q || haystack.includes(q));
  });

  return (
    <div className="min-h-[70vh] bg-[#f6f0e4]">
      <section className="container py-12 md:py-16">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{c.browseEyebrow}</p>
            <h1 className="mt-2 max-w-3xl text-4xl font-black leading-tight tracking-[-.03em] text-teal md:text-5xl">{c.browseTitle}</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[#4d473f]">{c.browseBody}</p>
          </div>
          {!error && <p className="font-bold text-muted" aria-live="polite">{c.results(groups.length)}</p>}
        </div>

        <form className="mb-7 rounded-[1.15rem] border border-[#e3d9c8] bg-[#fffdf8] p-3" action={`/${locale}/teachers`} method="get">
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex h-12 flex-1 items-center gap-3 rounded-xl bg-[#f6f0e4] px-4">
              <Search size={18} className="text-muted"/>
              <span className="sr-only">{c.searchLabel}</span>
              <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" name="q" defaultValue={first(query.q)} placeholder={c.searchPlaceholder}/>
            </label>
            <label className="flex h-12 min-w-52 items-center gap-2 rounded-xl border border-[#d8ccb8] px-3">
              <SlidersHorizontal size={17} className="text-muted"/>
              <span className="sr-only">{c.subject}</span>
              <select className="min-w-0 flex-1 bg-transparent outline-none" name="subject" defaultValue={selectedSubject}>
                <option value="">{c.allSubjects}</option>
                {subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
              </select>
            </label>
            <button className="h-12 rounded-xl bg-teal px-5 font-bold text-white transition hover:bg-[#0e4a4b]" type="submit">{c.filter}</button>
          </div>
          {(q || selectedSubject) && <Link className="mt-3 inline-block px-1 text-sm font-bold text-orange" href={`/${locale}/teachers`}>{c.clear}</Link>}
        </form>

        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{t.error}</p>
        ) : groups.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{groups.map(group => <GroupCard key={group.id} group={group} locale={locale} t={t}/>)}</div>
        ) : (
          <div className="rounded-[1.15rem] border-2 border-dashed border-[#d8ccb8] bg-[#fffdf8] px-6 py-14 text-center">
            <h2 className="text-xl font-bold text-teal">{c.noResults}</h2>
            <p className="mt-2 text-muted">{c.noResultsBody}</p>
            <Link className="mt-5 inline-flex rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal" href={`/${locale}/teachers`}>{c.clear}</Link>
          </div>
        )}
      </section>
    </div>
  );
}
