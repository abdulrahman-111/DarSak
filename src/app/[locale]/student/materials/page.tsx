import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { studentLessons } from '@/features/student/data';
import { studentResources } from '@/features/student/resource-data';
import { safeLink } from '@/features/student/domain';
import {
  EmptyState,
  Panel,
  RowLink,
  ScreenTitle,
  Status,
  cairoDate,
} from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { DownloadForm } from '@/features/student/forms';
import { FilterDisclosure } from '@/components/platform/filter-disclosure';

const materialUrl = (locale: string, filters: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  return `/${locale}/student/materials${query ? `?${query}` : ''}`;
};

export default async function StudentMaterials({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{
    view?: string;
    page?: string;
    q?: string;
    group?: string;
    kind?: string;
    group_q?: string;
  }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const search = await searchParams;
  const lessonsView = search?.view === 'lessons';
  const copy = ar
    ? {
        eyebrow: 'للطلاب المسجلين',
        title: 'الموارد التعليمية',
        intro: 'اعثر على الملاحظات والروابط والملفات التي شاركها معلموك.',
        lessons: 'الحصص',
        resources: 'الموارد',
        classes: 'حالة المجموعات',
        timetable: 'الجدول الدراسي',
        discover: 'اكتشف المجموعات',
        empty: 'لم يشارك معلموك موارد بعد. افتح الحصص للاطلاع على مواعيدها، أو ابحث عن مجموعة.',
        emptyLessons: 'لم يضف معلموك حصصًا بعد.',
        lesson: 'فتح الحصة',
        note: 'ملاحظة',
        link: 'رابط',
        file: 'ملف',
        group: 'كل المجموعات',
        groupSearch: 'ابحث باسم المجموعة',
        kind: 'كل الأنواع',
        search: 'بحث بالعنوان أو المجموعة',
        apply: 'تطبيق الفلاتر',
        moreFilters: 'فلاتر إضافية',
        activeFilters: 'فلاتر مفعلة',
        clearFilters: 'مسح الفلاتر',
        noMatches: 'لا توجد موارد تطابق هذه الفلاتر.',
        resourcesError: 'تعذر تحميل الموارد. حدّث الصفحة وحاول مرة أخرى.',
        lessonsError: 'تعذر تحميل حصصك. حدّث الصفحة وحاول مرة أخرى.',
      }
    : {
        eyebrow: 'Enrolled students',
        title: 'Learning resources',
        intro: 'Find notes, links, and files your teachers have shared with you.',
        lessons: 'Lessons',
        resources: 'Resources',
        classes: 'Enrollment status',
        timetable: 'Weekly timetable',
        discover: 'Find classes',
        empty:
          'Your teachers have not shared any resources yet. Open lessons to see scheduled classes, or find a group.',
        emptyLessons: 'Your teachers have not scheduled lessons yet.',
        lesson: 'Open lesson',
        note: 'Note',
        link: 'Link',
        file: 'File',
        group: 'All groups',
        groupSearch: 'Search group names',
        kind: 'All types',
        search: 'Search title or group',
        apply: 'Apply filters',
        moreFilters: 'More filters',
        activeFilters: 'active filters',
        clearFilters: 'Clear filters',
        noMatches: 'No resources match these filters.',
        resourcesError: 'Could not load resources. Refresh and try again.',
        lessonsError: 'Could not load your lessons. Refresh and try again.',
      };
  const pages = ar
    ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
    : { previous: 'Previous', next: 'Next', page: 'Page' };
  const lessons = lessonsView ? await studentLessons(locale, search?.page) : null;
  const resources = !lessonsView
    ? await studentResources(locale, {
        page: search?.page,
        q: search?.q,
        group: search?.group,
        kind: search?.kind,
        groupQuery: search?.group_q,
      })
    : null;
  const hasResourceFilters = Boolean(
    resources &&
    (resources.filters.q ||
      resources.filters.group ||
      resources.filters.kind ||
      resources.filters.groupQuery),
  );
  const groupChoices = resources ? [...resources.groups] : [];
  if (
    resources?.filters.group &&
    resources.rows[0]?.group_id === resources.filters.group &&
    !groupChoices.some(g => g.id === resources.filters.group)
  )
    groupChoices.unshift({ id: resources.rows[0].group_id, name: resources.rows[0].group_name });
  return (
    <>
      <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.intro} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={materialUrl(locale, {})}
          aria-current={!lessonsView ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 font-bold sm:px-4 ${!lessonsView ? 'bg-teal text-white' : 'border border-line text-teal'}`}
        >
          {copy.resources} {resources && `(${resources.total})`}
        </Link>
        <Link
          href={materialUrl(locale, { view: 'lessons' })}
          aria-current={lessonsView ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 font-bold sm:px-4 ${lessonsView ? 'bg-teal text-white' : 'border border-line text-teal'}`}
        >
          {copy.lessons}
        </Link>
      </div>
      {lessonsView &&
        lessons &&
        (lessons.error ? (
          <Panel>
            <p role="alert" className="text-sm text-danger">
              {copy.lessonsError}
            </p>
            <a
              href={materialUrl(locale, { view: 'lessons' })}
              className="mt-3 inline-flex font-bold text-orange underline"
            >
              {ar ? 'إعادة المحاولة' : 'Try again'}
            </a>
          </Panel>
        ) : (
          <Panel>
            {lessons.lessons.length ? (
              <div className="grid gap-3">
                {lessons.lessons.map(lesson => (
                  <RowLink
                    key={lesson.id}
                    href={`/${locale}/student/lessons/${lesson.id}`}
                    title={lesson.title}
                    meta={cairoDate(lesson.starts_at, locale)}
                    trailing={
                      <span className="flex items-center gap-3">
                        <Status value={lesson.status} locale={locale} />
                        <span className="hidden text-sm font-bold text-orange sm:inline">
                          {copy.lesson}
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            ) : (
              <>
                <EmptyState>{copy.emptyLessons}</EmptyState>
                <Link
                  href={`/${locale}/teachers`}
                  className="mt-4 inline-flex rounded-xl bg-teal px-4 py-3 font-bold text-white"
                >
                  {copy.discover}
                </Link>
              </>
            )}
          </Panel>
        ))}
      {lessonsView && lessons && !lessons.error && (
        <StudentPagination
          locale={locale}
          href={`/${locale}/student/materials`}
          page={lessons.page}
          pageCount={lessons.pageCount}
          labels={pages}
          preserve={{ view: 'lessons' }}
        />
      )}
      {!lessonsView && resources && (
        <>
          <Panel className="mb-4 p-3 sm:mb-5 sm:p-5">
            <form
              method="get"
              action={`/${locale}/student/materials`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-3"
            >
              <input
                type="search"
                name="q"
                defaultValue={resources.filters.q}
                placeholder={copy.search}
                aria-label={copy.search}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-line px-3 py-2 text-base"
              />
              <button className="min-h-11 min-w-0 rounded-xl bg-teal px-3 py-2 text-sm font-bold text-white sm:px-4">
                {copy.apply}
              </button>
              <div className="col-span-full min-w-0">
                <FilterDisclosure
                  label={copy.moreFilters}
                  activeCount={
                    Number(!!resources.filters.groupQuery) +
                    Number(!!resources.filters.group) +
                    Number(!!resources.filters.kind)
                  }
                  activeLabel={copy.activeFilters}
                >
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="grid min-w-0 gap-1 text-sm font-semibold text-teal">
                      {copy.groupSearch}
                      <input
                        type="search"
                        name="group_q"
                        defaultValue={resources.filters.groupQuery}
                        aria-label={copy.groupSearch}
                        className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line px-3 py-2 text-base font-normal text-ink"
                      />
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm font-semibold text-teal">
                      {copy.group}
                      <select
                        name="group"
                        defaultValue={resources.filters.group}
                        aria-label={copy.group}
                        className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2 text-base font-normal text-ink"
                      >
                        <option value="">{copy.group}</option>
                        {groupChoices.map(group => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm font-semibold text-teal">
                      {copy.kind}
                      <select
                        name="kind"
                        defaultValue={resources.filters.kind}
                        aria-label={copy.kind}
                        className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2 text-base font-normal text-ink"
                      >
                        <option value="">{copy.kind}</option>
                        <option value="note">{copy.note}</option>
                        <option value="link">{copy.link}</option>
                        <option value="file">{copy.file}</option>
                      </select>
                    </label>
                  </div>
                </FilterDisclosure>
              </div>
            </form>
          </Panel>
          {resources.error ? (
            <Panel>
              <p role="alert" className="text-sm text-danger">
                {copy.resourcesError}
              </p>
              <a
                href={materialUrl(locale, {})}
                className="mt-3 inline-flex font-bold text-orange underline"
              >
                {ar ? 'إعادة المحاولة' : 'Try again'}
              </a>
            </Panel>
          ) : (
            <Panel>
              {resources.rows.length ? (
                <div className="grid gap-3">
                  {resources.rows.map(resource => (
                    <article
                      key={resource.id}
                      className="min-w-0 rounded-2xl border border-line p-4"
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="wrap-break-word font-black text-teal [overflow-wrap:anywhere]">
                            {resource.title}
                          </h2>
                          <p className="mt-1 wrap-break-word text-sm text-muted [overflow-wrap:anywhere]">
                            {resource.group_name} · {resource.lesson_title} ·{' '}
                            {cairoDate(resource.starts_at, locale)}
                          </p>
                        </div>
                        <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-bold text-orange">
                          {copy[resource.kind]}
                        </span>
                      </div>
                      {resource.kind === 'note' && resource.content && (
                        <p className="mt-3 whitespace-pre-wrap wrap-break-word text-sm text-muted [overflow-wrap:anywhere]">
                          {resource.content}
                        </p>
                      )}
                      {resource.kind === 'link' && safeLink(resource.url) && (
                        <p className="mt-3">
                          <Link
                            href={safeLink(resource.url)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center break-all font-bold text-orange underline"
                          >
                            {ar ? 'فتح الرابط' : 'Open resource'}
                          </Link>
                        </p>
                      )}
                      {resource.kind === 'file' && (
                        <DownloadForm locale={locale} id={resource.id} />
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <>
                  <EmptyState>{hasResourceFilters ? copy.noMatches : copy.empty}</EmptyState>
                  {hasResourceFilters && (
                    <Link
                      href={materialUrl(locale, {})}
                      className="mt-4 inline-flex rounded-xl border border-teal px-4 py-3 font-bold text-teal"
                    >
                      {copy.clearFilters}
                    </Link>
                  )}
                  <Link
                    href={`/${locale}/teachers`}
                    className="mt-4 inline-flex rounded-xl bg-teal px-4 py-3 font-bold text-white"
                  >
                    {copy.discover}
                  </Link>
                  <Link
                    href={materialUrl(locale, { view: 'lessons' })}
                    className="ms-3 mt-4 inline-flex rounded-xl border border-teal px-4 py-3 font-bold text-teal"
                  >
                    {copy.lessons}
                  </Link>
                </>
              )}
            </Panel>
          )}
          {!resources.error && (
            <StudentPagination
              locale={locale}
              href={`/${locale}/student/materials`}
              page={resources.page}
              pageCount={resources.pageCount}
              labels={pages}
              preserve={{
                q: resources.filters.q,
                group: resources.filters.group,
                kind: resources.filters.kind,
                group_q: resources.filters.groupQuery,
              }}
            />
          )}
        </>
      )}
    </>
  );
}
