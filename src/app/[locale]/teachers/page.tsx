import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { getDictionary } from '@/i18n/config';
import { catalogue, publicGroups, publicTeacherChoices } from '@/features/platform/data';
import { discoverySearchParams, normalizeDiscoveryFilters, DISCOVERY_PAGE_SIZE } from '@/features/platform/discovery-domain';
import { GroupCard, SetupCard } from '@/components/ui';
import { isConfigured } from '@/lib/supabase/server';
import { publicCopy } from '@/components/public/copy';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';

type SearchValue = string | string[] | undefined;
type Query = Record<string, SearchValue>;

function urlFor(locale: string, filters: ReturnType<typeof normalizeDiscoveryFilters>, page: number, teacherSearch = '') {
  const next = { ...filters, page };
  const search = discoverySearchParams(next).toString();
  const params = new URLSearchParams(search);
  if (teacherSearch) params.set('teacher_search', teacherSearch);
  const query = params.toString();
  return `/${locale}/teachers${query ? `?${query}` : ''}`;
}

export default async function Teachers({
  params,
  searchParams,
}: {
  params: Promise<{ locale: 'ar' | 'en' }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const filters = normalizeDiscoveryFilters(query);
  const teacherSearch = (Array.isArray(query.teacher_search) ? query.teacher_search[0] : query.teacher_search ?? '').trim().slice(0, 80);
  const t = await getDictionary(locale);
  const c = publicCopy[locale];

  if (!isConfigured()) return <div className="container py-16"><SetupCard t={t}/></div>;

  const [result, catalogueResult, teacherResult] = await Promise.all([
    publicGroups(filters),
    catalogue(),
    publicTeacherChoices(teacherSearch, filters.teacherId),
  ]);
  const error = !!(result.error || catalogueResult.error || teacherResult.error);
  const groups = result.data.slice(0, DISCOVERY_PAGE_SIZE);
  const more = result.data.length > DISCOVERY_PAGE_SIZE;
  const subjects = catalogueResult.subjects as Array<{ id: string; name_ar: string; name_en: string }>;
  const nodes = catalogueResult.nodes as Array<{ id: string; name_ar: string; name_en: string }>;
  const teachers = teacherResult.data;
  const hasActiveFilters = !!(
    filters.subjectId || filters.nodeId || filters.teacherId || filters.weekday !== null ||
    filters.hasSeats || filters.query || filters.page > 1 || teacherSearch
  );
  const retryUrl = urlFor(locale, filters, filters.page, teacherSearch);
  const retryHref = `${retryUrl}${retryUrl.includes('?') ? '&' : '?'}retry=1`;

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

        <form key={discoverySearchParams(filters).toString()} className="mb-7 rounded-[1.15rem] border border-[#e3d9c8] bg-[#fffdf8] p-3" action={`/${locale}/teachers`} method="get">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex h-12 min-w-0 items-center gap-3 rounded-xl bg-[#f6f0e4] px-4 sm:col-span-2 lg:col-span-1">
              <Search size={18} className="shrink-0 text-muted"/>
              <span className="sr-only">{c.searchLabel}</span>
              <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" name="query" maxLength={120} defaultValue={filters.query} placeholder={c.searchPlaceholder}/>
            </label>
            <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[#d8ccb8] px-3">
              <SlidersHorizontal size={17} className="shrink-0 text-muted"/>
              <span className="sr-only">{c.subject}</span>
              <select className="min-w-0 flex-1 bg-transparent outline-none" name="subject_id" defaultValue={filters.subjectId || ''}>
                <option value="">{c.allSubjects}</option>
                {subjects.map(subject => <option key={subject.id} value={subject.id}>{catalogueDisplayName(subject, locale)}</option>)}
              </select>
            </label>
            <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[#d8ccb8] px-3">
              <span className="sr-only">{c.context}</span>
              <select className="min-w-0 flex-1 bg-transparent outline-none" name="node_id" defaultValue={filters.nodeId || ''}>
                <option value="">{c.allContexts}</option>
                {nodes.map(node => <option key={node.id} value={node.id}>{catalogueDisplayName(node, locale)}</option>)}
              </select>
            </label>
            <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[#d8ccb8] px-3">
              <span className="sr-only">{locale === 'ar' ? 'ابحث عن مدرس' : 'Search teachers'}</span>
              <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" type="search" name="teacher_search" maxLength={80} defaultValue={teacherSearch} placeholder={locale === 'ar' ? 'ابحث عن مدرس' : 'Search teachers'}/>
            </label>
            <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[#d8ccb8] px-3">
              <span className="sr-only">{c.teacherFilter}</span>
              <select className="min-w-0 flex-1 bg-transparent outline-none" name="teacher_id" defaultValue={filters.teacherId || ''}>
                <option value="">{c.allTeachers}</option>
                {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
              </select>
            </label>
            <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[#d8ccb8] px-3">
              <span className="sr-only">{c.weekday}</span>
              <select className="min-w-0 flex-1 bg-transparent outline-none" name="weekday" defaultValue={filters.weekday === null ? '' : String(filters.weekday)}>
                <option value="">{c.anyDay}</option>
                {c.weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
            <label className="flex h-12 items-center gap-2 rounded-xl border border-[#d8ccb8] px-3 font-medium">
              <input type="checkbox" name="has_seats" value="true" defaultChecked={filters.hasSeats} className="size-4 accent-teal"/>
              {c.seatsAvailable}
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="h-12 rounded-xl bg-teal px-5 font-bold text-white transition hover:bg-[#0e4a4b]" type="submit">{c.filter}</button>
            {hasActiveFilters && <Link className="px-1 text-sm font-bold text-orange" href={`/${locale}/teachers`}>{c.clear}</Link>}
          </div>
        </form>

        {error ? (
          <div className="rounded-xl bg-red-50 p-4 text-red-700"><p role="alert">{t.error}</p><a href={retryHref} className="mt-3 inline-flex font-bold underline">{c.retry}</a></div>
        ) : groups.length ? (
          <>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{groups.map(group => <GroupCard key={group.id} group={group} locale={locale} t={t}/>)}</div>
            <nav className="mt-8 flex items-center justify-between" aria-label={c.pagination}>
              {filters.page > 1 ? <Link rel="prev" className="rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal" href={urlFor(locale, filters, filters.page - 1, teacherSearch)}>{c.previous}</Link> : <span/>}
              <span className="text-sm font-bold text-muted">{c.pageLabel(filters.page)}</span>
              {more ? <Link rel="next" className="rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal" href={urlFor(locale, filters, filters.page + 1, teacherSearch)}>{c.next}</Link> : <span/>}
            </nav>
          </>
        ) : (
          <div className="rounded-[1.15rem] border-2 border-dashed border-[#d8ccb8] bg-[#fffdf8] px-6 py-14 text-center">
            <h2 className="text-xl font-bold text-teal">{c.noResults}</h2>
            <p className="mt-2 text-muted">{c.noResultsBody}</p>
            {filters.page > 1 ? <Link className="mt-5 inline-flex rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal" href={urlFor(locale, filters, filters.page - 1, teacherSearch)}>{c.previous}</Link> : <Link className="mt-5 inline-flex rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal" href={`/${locale}/teachers`}>{c.clear}</Link>}
          </div>
        )}
      </section>
    </div>
  );
}
