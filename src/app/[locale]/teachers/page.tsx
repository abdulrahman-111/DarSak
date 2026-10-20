import Link from 'next/link';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { getDictionary } from '@/i18n/config';
import {
  catalogue,
  currentUser,
  publicGroups,
  publicTeacherChoices,
  publicTeacherSample,
} from '@/features/platform/data';
import {
  discoverySearchParams,
  normalizeDiscoveryFilters,
} from '@/features/platform/discovery-domain';
import {
  discoveryFiltersForRole,
  discoveryGroupsForRole,
  type DiscoveryRole,
} from '@/features/platform/discovery-access';
import { GroupCard, SetupCard } from '@/components/ui';
import { redirect } from 'next/navigation';
import { isConfigured } from '@/lib/supabase/server';
import { publicCopy } from '@/components/public/copy';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';

type SearchValue = string | string[] | undefined;
type Query = Record<string, SearchValue>;

function urlFor(
  locale: string,
  filters: ReturnType<typeof normalizeDiscoveryFilters>,
  page: number,
  teacherSearch = '',
) {
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
  const t = await getDictionary(locale);
  const c = publicCopy[locale];

  if (!isConfigured())
    return (
      <div className="container py-16">
        <SetupCard t={t} />
      </div>
    );

  const me = await currentUser();
  const profile = me?.profile;
  const role: DiscoveryRole =
    profile?.status === 'active' &&
    (profile.role === 'student' || profile.role === 'teacher' || profile.role === 'admin')
      ? profile.role
      : null;
  if (role === 'teacher' || role === 'admin') redirect(`/${locale}/${role}`);
  const fullDiscovery = role === 'student';
  const filters = discoveryFiltersForRole(role, query);
  const teacherSearch = fullDiscovery
    ? (Array.isArray(query.teacher_search) ? query.teacher_search[0] : (query.teacher_search ?? ''))
        .trim()
        .slice(0, 80)
    : '';

  const [result, catalogueResult, teacherResult] = await Promise.all([
    publicGroups(filters, fullDiscovery ? undefined : 3),
    fullDiscovery ? catalogue() : Promise.resolve({ subjects: [], nodes: [], error: null }),
    fullDiscovery ? publicTeacherChoices(teacherSearch, filters.teacherId) : publicTeacherSample(3),
  ]);
  const error = !!(result.error || catalogueResult.error || teacherResult.error);
  const groups = discoveryGroupsForRole(role, result.data);
  const more = fullDiscovery && result.data.length > groups.length;
  const subjects = catalogueResult.subjects as Array<{
    id: string;
    name_ar: string;
    name_en: string;
  }>;
  const nodes = catalogueResult.nodes as Array<{ id: string; name_ar: string; name_en: string }>;
  const teachers = teacherResult.data;
  const hasActiveFilters = !!(
    filters.subjectId ||
    filters.nodeId ||
    filters.teacherId ||
    filters.weekday !== null ||
    filters.hasSeats ||
    filters.query ||
    filters.page > 1 ||
    teacherSearch
  );
  const activeFilterCount = [
    filters.subjectId,
    filters.nodeId,
    filters.teacherId,
    filters.weekday !== null ? 'weekday' : '',
    filters.hasSeats ? 'hasSeats' : '',
    filters.query,
    teacherSearch,
  ].filter(Boolean).length;
  // Keep the filter panel open whenever a filter inside it is applied, so people can see what narrows their results.
  const panelFilterCount = activeFilterCount - (filters.query ? 1 : 0);
  const retryUrl = urlFor(locale, filters, filters.page, teacherSearch);
  const retryHref = `${retryUrl}${retryUrl.includes('?') ? '&' : '?'}retry=1`;

  return (
    <div className="min-h-[70vh] bg-cream">
      <section className="container py-7 sm:py-10 md:py-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 md:mb-7 md:gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">
              {c.browseEyebrow}
            </p>
            <h1 className="mt-1 max-w-3xl text-2xl font-black leading-tight tracking-[-.03em] text-teal sm:text-3xl md:mt-2 md:text-5xl">
              {c.browseTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft md:mt-3 md:text-base md:leading-7">
              {fullDiscovery ? c.browseBody : c.browsePreviewBody}
            </p>
          </div>
          {!error && fullDiscovery && (
            <p className="font-bold text-muted" aria-live="polite">
              {c.results(groups.length)}
            </p>
          )}
        </div>

        {fullDiscovery ? (
          <form
            key={discoverySearchParams(filters).toString()}
            className="mb-5 rounded-[1.15rem] border border-line bg-surface p-3 md:mb-7 md:p-4"
            action={`/${locale}/teachers`}
            method="get"
          >
            <div className="flex min-w-0 flex-wrap gap-2">
              <label className="flex h-12 min-w-0 flex-1 basis-48 items-center gap-3 rounded-xl bg-cream px-3 sm:px-4">
                <Search size={18} className="shrink-0 text-muted" />
                <span className="sr-only">{c.searchLabel}</span>
                <input
                  className="min-w-0 flex-1 bg-transparent placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset"
                  name="query"
                  maxLength={120}
                  defaultValue={filters.query}
                  placeholder={c.searchPlaceholder}
                />
              </label>
              <button
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal px-4 font-bold text-white transition hover:bg-teal/90 sm:px-5"
                type="submit"
              >
                <Search aria-hidden="true" size={17} />
                {c.filter}
              </button>
              {hasActiveFilters && (
                <Link
                  className="inline-flex min-h-12 items-center px-2 text-sm font-bold text-orange"
                  href={`/${locale}/teachers`}
                >
                  {c.clear}
                </Link>
              )}
            </div>
            <div className="mt-2">
              <details
                open={panelFilterCount > 0}
                className="group rounded-xl border border-line px-3 py-2 md:border-0 md:px-0 md:py-0"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal aria-hidden="true" size={17} />
                  {locale === 'ar' ? 'تصفية النتائج' : 'More filters'}
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-teal/10 px-2 py-1 text-xs">
                      {activeFilterCount} {locale === 'ar' ? 'نشط' : 'active'}
                    </span>
                  )}
                  <ChevronDown
                    aria-hidden="true"
                    size={18}
                    className="ms-auto text-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="pt-2 md:pt-0">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line-strong px-3">
                      <span className="sr-only">{c.subject}</span>
                      <select
                        className="min-w-0 flex-1 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset"
                        name="subject_id"
                        defaultValue={filters.subjectId || ''}
                      >
                        <option value="">{c.allSubjects}</option>
                        {subjects.map(subject => (
                          <option key={subject.id} value={subject.id}>
                            {catalogueDisplayName(subject, locale)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line-strong px-3">
                      <span className="sr-only">{c.context}</span>
                      <select
                        className="min-w-0 flex-1 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset"
                        name="node_id"
                        defaultValue={filters.nodeId || ''}
                      >
                        <option value="">{c.allContexts}</option>
                        {nodes.map(node => (
                          <option key={node.id} value={node.id}>
                            {catalogueDisplayName(node, locale)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line-strong px-3 focus-within:ring-2 focus-within:ring-teal focus-within:ring-offset-2">
                      <span className="sr-only">
                        {locale === 'ar' ? 'ابحث عن مدرس' : 'Search teachers'}
                      </span>
                      <input
                        aria-describedby="teacher-search-help"
                        className="min-w-0 flex-1 bg-transparent placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset"
                        type="search"
                        name="teacher_search"
                        maxLength={80}
                        defaultValue={teacherSearch}
                        placeholder={locale === 'ar' ? 'ابحث عن مدرس' : 'Search teachers'}
                      />
                    </label>
                    <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line-strong px-3 focus-within:ring-2 focus-within:ring-teal focus-within:ring-offset-2">
                      <span className="sr-only">{c.teacherFilter}</span>
                      <select
                        aria-describedby="teacher-search-help"
                        className="min-w-0 flex-1 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset"
                        name="teacher_id"
                        defaultValue={filters.teacherId || ''}
                      >
                        <option value="">{c.allTeachers}</option>
                        {teachers.map(teacher => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line-strong px-3">
                      <span className="sr-only">{c.weekday}</span>
                      <select
                        className="min-w-0 flex-1 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset"
                        name="weekday"
                        defaultValue={filters.weekday === null ? '' : String(filters.weekday)}
                      >
                        <option value="">{c.anyDay}</option>
                        {c.weekdays.map((day, index) => (
                          <option key={day} value={index}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 font-medium">
                      <input
                        type="checkbox"
                        name="has_seats"
                        value="true"
                        defaultChecked={filters.hasSeats}
                        className="size-4 accent-teal"
                      />
                      {c.seatsAvailable}
                    </label>
                  </div>
                  <p id="teacher-search-help" className="mt-2 text-sm text-muted">
                    {locale === 'ar'
                      ? 'ابحث عن المدرسين المعتمدين بالاسم (حتى ٥٠ نتيجة)، ثم اختر المدرس واضغط «تصفية».'
                      : 'Search approved teachers by name (up to 50 matches), choose a teacher, then apply filters.'}
                  </p>
                  <button
                    className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-teal px-4 font-bold text-teal"
                    type="submit"
                  >
                    {c.filter}
                  </button>
                </div>
              </details>
            </div>
          </form>
        ) : (
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-[1.15rem] border border-line bg-surface p-5">
            <p className="max-w-2xl leading-7 text-ink-soft">
              {locale === 'ar'
                ? 'تعرّف على عينة صغيرة من المجموعات والمدرسين. سجّل كطالب لاستكشاف جميع المدرسين والمجموعات.'
                : 'Preview a small sample of groups and teachers. Register as a student to explore all teachers and groups.'}
            </p>
            <Link
              className="inline-flex min-h-11 items-center rounded-xl bg-orange px-5 font-bold text-white transition-colors hover:bg-orange-deep"
              href={`/${locale}/register?role=student`}
            >
              {locale === 'ar' ? 'سجّل كطالب' : 'Register as a student'}
            </Link>
          </div>
        )}

        {error ? (
          <div className="rounded-[1.15rem] border border-danger/20 bg-danger-soft p-5 text-danger">
            <p role="alert">{t.error}</p>
            <a
              href={retryHref}
              className="mt-3 inline-flex min-h-11 items-center font-bold underline"
            >
              {c.retry}
            </a>
          </div>
        ) : groups.length || (!fullDiscovery && teachers.length) ? (
          <>
            {!fullDiscovery && (
              <section className="mb-6" aria-labelledby="featured-teachers-heading">
                <h2 id="featured-teachers-heading" className="mb-3 text-xl font-bold text-teal">
                  {locale === 'ar' ? 'مدرسون مميزون' : 'Featured teachers'}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {teachers.map(teacher => (
                    <Link
                      key={teacher.id}
                      href={`/${locale}/teachers/${teacher.id}`}
                      className="student-card flex min-w-0 items-center gap-3 rounded-[1.15rem] border border-line bg-surface p-4 text-teal hover:border-teal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-mint text-sm font-bold"
                      >
                        {teacher.full_name.trim().slice(0, 1).toLocaleUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate">{teacher.full_name}</strong>
                        <span className="text-sm text-muted">
                          {locale === 'ar' ? 'عرض الملف' : 'View profile'}
                        </span>
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        size={18}
                        className="shrink-0 -rotate-90 text-muted rtl:rotate-90"
                      />
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {groups.map(group => (
                <GroupCard key={group.id} group={group} locale={locale} t={t} />
              ))}
            </div>
            {fullDiscovery && (
              <nav className="mt-8 flex items-center justify-between" aria-label={c.pagination}>
                {filters.page > 1 ? (
                  <Link
                    rel="prev"
                    className="rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal"
                    href={urlFor(locale, filters, filters.page - 1, teacherSearch)}
                  >
                    {c.previous}
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sm font-bold text-muted">{c.pageLabel(filters.page)}</span>
                {more ? (
                  <Link
                    rel="next"
                    className="rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal"
                    href={urlFor(locale, filters, filters.page + 1, teacherSearch)}
                  >
                    {c.next}
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        ) : (
          <div className="rounded-[1.15rem] border-2 border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <h2 className="text-xl font-bold text-teal">{c.noResults}</h2>
            <p className="mt-2 text-muted">
              {fullDiscovery
                ? c.noResultsBody
                : locale === 'ar'
                  ? 'لا تتوفر معاينة الآن. سجّل كطالب لاستكشاف المدرسين والمجموعات.'
                  : 'No preview is available right now. Register as a student to explore teachers and groups.'}
            </p>
            {fullDiscovery &&
              (filters.page > 1 ? (
                <Link
                  className="mt-5 inline-flex rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal"
                  href={urlFor(locale, filters, filters.page - 1, teacherSearch)}
                >
                  {c.previous}
                </Link>
              ) : (
                <Link
                  className="mt-5 inline-flex rounded-xl border-2 border-teal px-4 py-2.5 font-bold text-teal"
                  href={`/${locale}/teachers`}
                >
                  {c.clear}
                </Link>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
