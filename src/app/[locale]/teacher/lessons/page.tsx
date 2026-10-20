import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayStrip } from '@/components/platform/day-strip';
import { FilterDisclosure } from '@/components/platform/filter-disclosure';
import { ensureLocale } from '@/i18n/config';
import {
  EmptyState,
  Panel,
  RowLink,
  ScreenTitle,
  Status,
  cairoDate,
  weekday,
} from '@/components/platform/ui';
import { LessonForm } from '@/components/platform/forms';
import { teacherLessons } from '@/features/teacher/data';
import { teacherCalendarGroupChoices, teacherTimetable } from '@/features/teacher/timetable-data';
import {
  groupTeacherLessonsByCairoDay,
  normalizeTeacherCalendarDate,
  normalizeTeacherCalendarView,
  teacherCalendarWeekday,
  type TeacherCalendarLesson,
} from '@/features/teacher/timetable-domain';
import { StudentPagination } from '@/features/student/pagination';
import { CalendarExportForm } from '@/features/calendar/export-form';
import { defaultCalendarRange } from '@/features/calendar/domain';
import { shiftTimetableWeek, timetableDayDates } from '@/features/student/timetable-domain';
import { requireTeachingAccess } from '@/components/platform/access';

type Search = {
  new?: string;
  groupId?: string;
  deleted?: string;
  page?: string | string[];
  view?: string;
  date?: string;
  day?: string;
};

export default async function TeacherLessons({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  await requireTeachingAccess(locale);
  const requestedNew = query.new === '1';
  const view = normalizeTeacherCalendarView(query.view);
  const date = normalizeTeacherCalendarDate(query.date);
  const exportRange = defaultCalendarRange();
  const allData = view === 'all' && !requestedNew ? await teacherLessons(locale, query.page) : null;
  const newData = requestedNew ? await teacherCalendarGroupChoices(locale, query.groupId) : null;
  const calendarData =
    !requestedNew && view !== 'all'
      ? await teacherTimetable(locale, date, query.day, query.groupId, query.page)
      : null;
  const selectedGroup = newData?.selectedGroup ?? calendarData?.selectedGroup ?? null;
  const groups = newData?.groups ?? calendarData?.groups ?? allData?.groups ?? [];
  const base = `/${locale}/teacher/lessons`;
  const copy = ar
    ? {
        title: 'الحصص',
        description: 'نظّم حصصك وافتح مساحة الحصة لمراجعة التفاصيل والمواد.',
        add: 'إضافة حصة',
        group: 'المجموعة',
        choose: '— اختر مجموعة —',
        select: 'تطبيق',
        noGroups: 'أنشئ مجموعة قبل إضافة حصة.',
        createGroup: 'إنشاء مجموعة',
        noLessons: 'لا توجد حصص في هذه الفترة.',
        previous: 'السابق',
        next: 'التالي',
        page: 'الصفحة',
        retry: 'إعادة المحاولة',
        invalidGroup: 'اختر إحدى مجموعاتك من القائمة لإضافة حصة.',
        failed: 'تعذر تحميل حصصك ومجموعاتك. حدّث الصفحة وحاول مرة أخرى.',
        week: 'الأسبوع',
        all: 'كل الحصص',
        today: 'اليوم',
        currentWeek: 'الأسبوع الحالي',
        date: 'انتقل إلى الأسبوع الذي يتضمن التاريخ',
        shown: 'المعروض',
        cancelled: 'ملغاة',
        groupLimit: 'تظهر أول ٢٠٠ مجموعة فقط.',
        lessons: 'حصة',
        filters: 'التاريخ والمجموعة',
        active: 'نشط',
        previousShort: 'السابق',
        nextShort: 'التالي',
        currentDay: 'اليوم',
        selectedDay: 'اليوم المحدد',
        clearGroup: 'اختر كل المجموعات لإزالة التصفية.',
      }
    : {
        title: 'Lessons',
        description:
          'Plan your lessons and open a lesson workspace to review its details and materials.',
        add: 'Add lesson',
        group: 'Group',
        choose: '— Choose a group —',
        select: 'Apply',
        noGroups: 'Create a group before adding a lesson.',
        createGroup: 'Create group',
        noLessons: 'No lessons in this period.',
        previous: 'Previous',
        next: 'Next',
        page: 'Page',
        retry: 'Try again',
        invalidGroup: 'Choose one of your groups from the list to add a lesson.',
        failed: 'Could not load your lessons and groups. Refresh and try again.',
        week: 'Week',
        all: 'All lessons',
        today: 'Today',
        currentWeek: 'Current week',
        date: 'Go to week containing date',
        shown: 'shown',
        cancelled: 'Cancelled',
        groupLimit: 'Showing the first 200 groups.',
        lessons: 'lessons',
        filters: 'Date and group filters',
        active: 'active',
        previousShort: 'Prev',
        nextShort: 'Next',
        currentDay: 'Today',
        selectedDay: 'Selected day',
        clearGroup: 'Choose All groups to clear the group filter.',
      };
  const routeError = newData?.error ?? calendarData?.error ?? allData?.error ?? null;
  const allView = allData !== null;
  const timetableView = calendarData !== null;
  const week = calendarData?.week ?? null;
  const dayDates = week ? timetableDayDates(week.weekStart).map(item => item.date) : [];
  const dayGroups = calendarData
    ? groupTeacherLessonsByCairoDay(calendarData.lessons, dayDates)
    : new Map<string, TeacherCalendarLesson[]>();
  const statusHref = (params: Record<string, string | number | undefined>) => {
    const queryString = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    return `${base}${queryString ? `?${queryString}` : ''}`;
  };
  const pageLabels = { page: copy.page, previous: copy.previous, next: copy.next };

  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'تقويم المعلم' : 'Teacher calendar'}
        title={copy.title}
        description={copy.description}
        action={
          <Link
            href={statusHref({ new: 1, groupId: selectedGroup?.id })}
            className="inline-flex min-h-11 items-center rounded-xl bg-orange px-4 py-3 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal hover:bg-orange-deep"
          >
            {copy.add}
          </Link>
        }
      />
      {query.deleted === '1' && (
        <Panel className="mb-4">
          <p role="status" className="text-sm font-semibold text-teal">
            {ar ? 'تم حذف الحصة.' : 'Lesson deleted.'}
          </p>
        </Panel>
      )}
      {routeError ? (
        <Panel>
          <p role="alert" className="text-sm text-red-800">
            {copy.failed}
          </p>
          <Link
            href={base}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-orange underline"
          >
            {copy.retry}
          </Link>
        </Panel>
      ) : (
        <>
          {requestedNew && newData && (
            <Panel className="mb-6">
              <h2 className="mb-4 text-xl font-black text-teal">{copy.add}</h2>
              {groups.length ? (
                <>
                  <form method="get" className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <input type="hidden" name="new" value="1" />
                    <label htmlFor="new-lesson-group" className="min-w-0 flex-1 text-sm font-bold">
                      {copy.group}
                      <select
                        id="new-lesson-group"
                        name="groupId"
                        defaultValue={selectedGroup?.id ?? ''}
                        required
                        className="mt-2 block min-h-11 w-full rounded-xl border border-line bg-cream p-3"
                      >
                        <option value="">{copy.choose}</option>
                        {groups.map(group => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="min-h-11 rounded-xl border border-line px-4 py-3 font-bold text-teal">
                      {copy.select}
                    </button>
                  </form>
                  {newData.groupsLimited && (
                    <p className="mb-3 text-xs text-muted">{copy.groupLimit}</p>
                  )}
                  {query.groupId && !selectedGroup && (
                    <p role="alert" className="mb-4 text-sm text-red-700">
                      {copy.invalidGroup}
                    </p>
                  )}
                  {selectedGroup && <LessonForm locale={locale} groupId={selectedGroup.id} />}
                </>
              ) : (
                <div className="grid justify-items-start gap-3">
                  <EmptyState>{copy.noGroups}</EmptyState>
                  <Link
                    href={`/${locale}/teacher/groups/new`}
                    className="inline-flex min-h-11 items-center rounded-xl bg-teal px-4 py-3 font-bold text-white"
                  >
                    {copy.createGroup}
                  </Link>
                </div>
              )}
            </Panel>
          )}
          {!requestedNew && (
            <>
              <Panel className="mb-5">
                <div
                  className="mb-4 flex flex-wrap gap-2"
                  aria-label={ar ? 'طرق عرض الحصص' : 'Lesson views'}
                >
                  <Link
                    href={statusHref({ date, groupId: selectedGroup?.id })}
                    aria-current={timetableView ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 font-bold ${timetableView ? 'bg-teal text-white' : 'border border-line text-teal'}`}
                  >
                    <CalendarDays aria-hidden="true" size={18} />
                    {copy.week}
                  </Link>
                  <Link
                    href={statusHref({ view: 'all', page: 1 })}
                    aria-current={allView ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center rounded-xl px-4 py-2 font-bold ${allView ? 'bg-teal text-white' : 'border border-line text-teal'}`}
                  >
                    {copy.all}
                  </Link>
                </div>
                {calendarData && week && (
                  <>
                    <nav
                      aria-label={ar ? 'التنقل بين الأسابيع' : 'Week navigation'}
                      className="mb-4 flex min-w-0 flex-wrap gap-2"
                    >
                      <Link
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal"
                        href={statusHref({
                          date: shiftTimetableWeek(week.weekStart, -1),
                          groupId: selectedGroup?.id,
                        })}
                      >
                        <ChevronLeft aria-hidden="true" size={16} />
                        {copy.previousShort}
                      </Link>
                      <Link
                        className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal"
                        href={statusHref({
                          date: week.today,
                          day: week.today,
                          groupId: selectedGroup?.id,
                        })}
                      >
                        {copy.today}
                      </Link>
                      <Link
                        className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal"
                        href={statusHref({ date: week.today, groupId: selectedGroup?.id })}
                      >
                        {copy.currentWeek}
                      </Link>
                      <Link
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal"
                        href={statusHref({
                          date: shiftTimetableWeek(week.weekStart, 1),
                          groupId: selectedGroup?.id,
                        })}
                      >
                        {copy.nextShort}
                        <ChevronRight aria-hidden="true" size={16} />
                      </Link>
                    </nav>
                    <FilterDisclosure
                      label={copy.filters}
                      activeCount={Number(!!selectedGroup)}
                      activeLabel={copy.active}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <form
                          method="get"
                          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end"
                        >
                          {selectedGroup && (
                            <input type="hidden" name="groupId" value={selectedGroup.id} />
                          )}
                          <label
                            htmlFor="teacher-calendar-date"
                            className="min-w-0 flex-1 text-sm font-bold"
                          >
                            {copy.date}
                            <input
                              id="teacher-calendar-date"
                              name="date"
                              type="date"
                              defaultValue={week.weekStart}
                              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2"
                            />
                          </label>
                          <button className="min-h-11 rounded-xl border border-line px-4 py-2 font-bold text-teal">
                            {copy.select}
                          </button>
                        </form>
                        <form
                          method="get"
                          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end"
                        >
                          <input type="hidden" name="date" value={week.weekStart} />
                          {calendarData.day && (
                            <input type="hidden" name="day" value={calendarData.day} />
                          )}
                          <label
                            htmlFor="teacher-calendar-group"
                            className="min-w-0 flex-1 text-sm font-bold"
                          >
                            {copy.group}
                            <select
                              id="teacher-calendar-group"
                              name="groupId"
                              defaultValue={selectedGroup?.id ?? ''}
                              className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-cream p-3"
                            >
                              <option value="">{ar ? 'كل المجموعات' : 'All groups'}</option>
                              {groups.map(group => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button className="min-h-11 rounded-xl border border-line px-4 py-2 font-bold text-teal">
                            {copy.select}
                          </button>
                        </form>
                      </div>
                      {selectedGroup && (
                        <p className="mt-2 text-xs text-muted">{copy.clearGroup}</p>
                      )}
                    </FilterDisclosure>
                    {calendarData.groupsLimited && (
                      <p className="mt-2 text-xs text-muted">{copy.groupLimit}</p>
                    )}
                    <div className="mt-4">
                      <DayStrip
                        label={ar ? 'أيام الأسبوع' : 'Days of the week'}
                        locale={locale}
                        selectedLabel={copy.selectedDay}
                        currentLabel={copy.currentDay}
                        items={timetableDayDates(week.weekStart).map(
                          ({ date: dayDate, weekday: weekdayNumber }) => {
                            const countShown = dayGroups.get(dayDate)?.length ?? 0;
                            const selected = calendarData.day === dayDate;
                            return {
                              href: statusHref({
                                date: week.weekStart,
                                day: dayDate,
                                groupId: selectedGroup?.id,
                              }),
                              date: dayDate,
                              label: weekday(weekdayNumber, locale),
                              dateLabel: new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
                                day: 'numeric',
                                month: 'short',
                                timeZone: 'Africa/Cairo',
                              }).format(new Date(`${dayDate}T12:00:00Z`)),
                              selected,
                              current: dayDate === week.today,
                              detail: !calendarData.day ? (
                                <>
                                  {countShown}
                                  <span className="ms-1 font-normal text-muted">{copy.shown}</span>
                                </>
                              ) : undefined,
                            };
                          },
                        )}
                      />
                    </div>
                    <div className="mt-5">
                      <h2 className="mb-3 text-lg font-black text-teal">
                        {calendarData.day
                          ? `${weekday(teacherCalendarWeekday(calendarData.day), locale)} · ${calendarData.day} · ${calendarData.total} ${copy.lessons}`
                          : `${week.startDate} – ${dayDates.at(-1)} · ${calendarData.total} ${copy.lessons}`}
                      </h2>
                      {calendarData.total ? (
                        <div className="grid gap-4">
                          {[...dayGroups.entries()]
                            .filter(
                              ([dayDate]) => !calendarData.day || dayDate === calendarData.day,
                            )
                            .filter(([, entries]) => entries.length)
                            .map(([dayDate, entries]) => (
                              <section
                                key={dayDate}
                                aria-label={`${weekday(teacherCalendarWeekday(dayDate), locale)} · ${dayDate}`}
                              >
                                {!calendarData.day && (
                                  <h3 className="mb-2 font-bold text-teal">
                                    {weekday(teacherCalendarWeekday(dayDate), locale)} · {dayDate}
                                  </h3>
                                )}
                                <div className="grid gap-2">
                                  {entries.map(lesson => (
                                    <RowLink
                                      key={`${dayDate}-${lesson.id}`}
                                      href={`${base}/${lesson.id}`}
                                      title={lesson.title}
                                      meta={`${lesson.group?.name || '—'} · ${cairoDate(lesson.starts_at, locale)} – ${new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date(lesson.ends_at))}${lesson.status === 'cancelled' ? ` · ${copy.cancelled}` : ''}`}
                                      trailing={<Status value={lesson.status} locale={locale} />}
                                    />
                                  ))}
                                </div>
                              </section>
                            ))}
                        </div>
                      ) : (
                        <EmptyState>{copy.noLessons}</EmptyState>
                      )}
                      <StudentPagination
                        locale={locale}
                        href={base}
                        page={calendarData.page}
                        pageCount={calendarData.pageCount}
                        labels={pageLabels}
                        preserve={{
                          date: week.weekStart,
                          day: calendarData.day ?? undefined,
                          groupId: selectedGroup?.id,
                        }}
                      />
                    </div>
                  </>
                )}
                {allData && (
                  <>
                    {allData.lessons.length ? (
                      <div className="grid gap-3">
                        {allData.lessons.map(lesson => {
                          const group = Array.isArray(lesson.group)
                            ? lesson.group[0]
                            : lesson.group;
                          return (
                            <RowLink
                              key={lesson.id}
                              href={`${base}/${lesson.id}`}
                              title={lesson.title}
                              meta={`${group?.name || '—'} · ${cairoDate(lesson.starts_at, locale)} – ${new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date(lesson.ends_at))}${lesson.status === 'cancelled' ? ` · ${copy.cancelled}` : ''}`}
                              trailing={<Status value={lesson.status} locale={locale} />}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState>{copy.noLessons}</EmptyState>
                    )}
                    <StudentPagination
                      locale={locale}
                      href={base}
                      page={allData.page}
                      pageCount={allData.pageCount}
                      labels={pageLabels}
                      preserve={{ view: 'all' }}
                    />
                  </>
                )}
              </Panel>
            </>
          )}
        </>
      )}
      <CalendarExportForm
        locale={locale}
        initialFrom={exportRange.from}
        initialUntil={exportRange.until}
      />
    </>
  );
}
