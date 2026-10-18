import Link from 'next/link';
import { ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { EmptyState, Panel, ScreenTitle, Status, weekday } from '@/components/platform/ui';
import { CalendarExportForm } from '@/features/calendar/export-form';
import { defaultCalendarRange } from '@/features/calendar/domain';
import { unreadNotificationCount } from '@/features/notifications/data';
import { studentTimetableDay } from '@/features/student/timetable-data';
import { cairoDayBounds, normalizeTimetableSelection, normalizeTimetableWeek, shiftTimetableWeek, timetableDayDates, TIMETABLE_LESSON_LIMIT } from '@/features/student/timetable-domain';

type Search = { week?: string; day?: string; group?: string; page?: string };

export default async function Timetable({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<Search> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw), ar = locale === 'ar';
  const me = await requireViewer(locale, 'student');
  const unreadCount = await unreadNotificationCount(me.db);
  const search = await searchParams;
  const week = normalizeTimetableWeek(search?.week);
  const selection = normalizeTimetableSelection(week.weekStart, search?.day, search?.group);
  const requestedPage = Number(search?.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1000) : 1;
  const days = timetableDayDates(week.weekStart);
  const selectedDay = selection.day ?? (week.isCurrentWeek ? week.today : week.weekStart);
  const dayBounds = cairoDayBounds(selectedDay);
  const data = await studentTimetableDay(locale, dayBounds.start, dayBounds.end, selection.group, page);
  const pageCount = Math.max(1, Math.ceil(data.total / TIMETABLE_LESSON_LIMIT));
  const exportRange = defaultCalendarRange();
  const copy = ar ? {
    title: 'جدولي الدراسي', intro: 'مواعيد حصصك حسب التاريخ والمجموعة، بتوقيت القاهرة.', prev: 'الأسبوع السابق', next: 'الأسبوع التالي', today: 'هذا الأسبوع', classes: 'كل مجموعاتي', filter: 'تصفية', selectClass: 'المجموعة', selected: 'اليوم المحدد', timezone: 'بتوقيت القاهرة',
    empty: 'لا توجد حصص مسجلة في هذا اليوم. المواعيد الأسبوعية أدناه هي أنماط متكررة وليست حصصًا بتاريخ محدد.', error: 'تعذر تحميل جدولك. حدّث الصفحة وحاول مرة أخرى.', retry: 'إعادة المحاولة', open: 'عرض تفاصيل الحصة', class: 'عرض المجموعة', location: 'المكان', noLocation: 'لم يحدد المكان', allDays: 'أيام الأسبوع', limited: `نعرض ${TIMETABLE_LESSON_LIMIT} حصة في كل صفحة. استخدم التنقل لعرض بقية الحصص.`, previousPage: 'الصفحة السابقة', nextPage: 'الصفحة التالية', weekly: 'المواعيد الأسبوعية المتكررة', weeklyHint: 'نمط موعد المجموعة فقط، وليس حصة بتاريخ محدد.', slotsLimited: 'تظهر أول ٢٠٠ موعد أسبوعي.',
  } : {
    title: 'My timetable', intro: 'Browse your dated lessons by week, day and class. All times use Cairo time.', prev: 'Previous week', next: 'Next week', today: 'This week', classes: 'All my classes', filter: 'Apply filters', selectClass: 'Class', selected: 'Selected day', timezone: 'Africa/Cairo time',
    empty: 'No dated lessons are scheduled for this day. Weekly times below are recurring patterns, not lessons on specific dates.', error: 'Could not load your timetable. Refresh and try again.', retry: 'Try again', open: 'Open lesson details', class: 'View class', location: 'Location', noLocation: 'Location not set', allDays: 'Days of the week', limited: `Showing ${TIMETABLE_LESSON_LIMIT} lessons per page. Use the page controls to see the rest.`, previousPage: 'Previous page', nextPage: 'Next page', weekly: 'Weekly recurring times', weeklyHint: 'These are class schedule patterns, not lessons on specific dates.', slotsLimited: 'Showing the first 200 weekly times.',
  };
  const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { ...options, timeZone: 'Africa/Cairo' }).format(new Date(`${date}T12:00:00Z`));
  const weekLabel = `${dateLabel(week.weekStart, { day: 'numeric', month: 'short' })} – ${dateLabel(days[6].date, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const weekHref = (weekStart: string, values: { day?: string; group?: string | null; page?: number } = {}) => {
    const query = new URLSearchParams({ week: weekStart });
    if (values.day) query.set('day', values.day);
    if (values.group) query.set('group', values.group);
    if (values.page && values.page > 1) query.set('page', String(values.page));
    return `/${locale}/timetable?${query.toString()}`;
  };

  return <PlatformShell locale={locale} role="student" name={me.fullName} unreadCount={unreadCount}>
    <ScreenTitle eyebrow={copy.timezone} title={copy.title} description={copy.intro}/>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p><Link href={`/${locale}/timetable`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</Link></Panel> : <>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-black text-teal" aria-live="polite">{weekLabel}</p>
          <nav aria-label={ar ? 'التنقل بين الأسابيع' : 'Week navigation'} className="flex flex-wrap gap-2">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 py-2 font-bold text-teal hover:border-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={weekHref(shiftTimetableWeek(week.weekStart, -1), { group: selection.group })}><ChevronLeft aria-hidden="true" className="h-4 w-4"/>{copy.prev}</Link>
            {!week.isCurrentWeek && <Link className="min-h-11 rounded-xl border border-line px-4 py-2 font-bold text-teal hover:border-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={`/${locale}/timetable`}>{copy.today}</Link>}
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 py-2 font-bold text-teal hover:border-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={weekHref(shiftTimetableWeek(week.weekStart, 1), { group: selection.group })}>{copy.next}<ChevronRight aria-hidden="true" className="h-4 w-4"/></Link>
          </nav>
        </div>
        <form method="get" action={`/${locale}/timetable`} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="week" value={week.weekStart}/><input type="hidden" name="day" value={selectedDay}/>
          <label className="grid gap-2 text-sm font-bold text-teal">{copy.selectClass}
            <select name="group" defaultValue={selection.group ?? ''} className="min-h-11 rounded-xl border border-line bg-cream px-3 py-2">
              <option value="">{copy.classes}</option>
              {data.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal px-5 py-2 font-bold text-white hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"><ListFilter aria-hidden="true" className="h-4 w-4"/>{copy.filter}</button>
        </form>
        {data.groupsLimited && <p className="mt-3 text-xs text-muted">{ar ? 'تظهر أول ٢٠٠ مجموعة مسجلة.' : 'Showing your first 200 enrolled classes.'}</p>}
      </Panel>

      <section aria-labelledby="week-days-title" className="mt-5">
        <h2 id="week-days-title" className="sr-only">{copy.allDays}</h2>
        <nav aria-label={copy.allDays} className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {days.map(({ date, weekday: day }) => {
            const isSelected = date === selectedDay;
            return <Link key={date} aria-current={isSelected ? 'date' : undefined} href={weekHref(week.weekStart, { day: date, group: selection.group })} className={`min-h-16 rounded-2xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange ${isSelected ? 'border-teal bg-teal text-white' : 'border-line bg-white text-teal hover:border-orange'}`}>
              <span className="block text-xs font-bold opacity-80">{weekday(day, locale)}</span><span className="mt-1 block text-lg font-black">{dateLabel(date, { day: 'numeric', month: 'short' })}</span>
            </Link>;
          })}
        </nav>
      </section>

      <Panel className="mt-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-black text-teal">{copy.selected}: {dateLabel(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p className="text-sm text-muted">{data.total} {ar ? 'حصة في هذا اليوم' : 'lessons on this day'}</p>
        </div>
        {data.total > TIMETABLE_LESSON_LIMIT && <p className="mb-4 rounded-xl bg-cream p-3 text-sm text-muted">{copy.limited}</p>}
        {data.lessons.length ? <ol className="grid gap-3">
          {data.lessons.map(lesson => {
            const start = new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Cairo' }).format(new Date(lesson.starts_at));
            const end = new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Cairo' }).format(new Date(lesson.ends_at));
            return <li key={lesson.id} className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-start">
              <p dir="ltr" className="text-base font-black tabular-nums text-teal">{start} – {end}</p>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-lg font-black text-teal">{lesson.title}</h3><Status value={lesson.status} locale={locale}/></div>
                {lesson.group && <Link className="mt-1 inline-block font-bold text-orange underline decoration-orange/50 underline-offset-2" href={`/${locale}/student/classes/${lesson.group_id}`}>{lesson.group.name} · {copy.class}</Link>}
                <p className="mt-1 text-sm text-muted">{copy.location}: {lesson.group?.location || copy.noLocation}</p>
              </div>
              {lesson.status !== 'cancelled' && <Link className="min-h-11 self-center rounded-xl border border-line px-4 py-2 text-center text-sm font-bold text-teal hover:border-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" href={`/${locale}/student/lessons/${lesson.id}`}>{copy.open}</Link>}
            </li>;
          })}
        </ol> : <EmptyState>{copy.empty}</EmptyState>}
        {pageCount > 1 && <nav aria-label={ar ? 'صفحات الحصص' : 'Lesson pages'} className="mt-5 flex justify-between gap-3">
          {page > 1 ? <Link className="min-h-11 rounded-xl border border-line px-4 py-2 font-bold text-teal" href={weekHref(week.weekStart, { day: selectedDay, group: selection.group, page: page - 1 })}>{copy.previousPage}</Link> : <span/>}
          {page < pageCount && <Link className="min-h-11 rounded-xl border border-line px-4 py-2 font-bold text-teal" href={weekHref(week.weekStart, { day: selectedDay, group: selection.group, page: page + 1 })}>{copy.nextPage}</Link>}
        </nav>}
      </Panel>
      {data.slots.length > 0 && <details className="mt-5 rounded-2xl border border-line bg-white p-5">
        <summary className="cursor-pointer font-black text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">{copy.weekly}</summary>
        <p className="mt-2 text-sm text-muted">{copy.weeklyHint}</p>
        {data.slotsLimited && <p className="mt-3 text-sm text-muted">{copy.slotsLimited}</p>}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.slots.slice(0, 200).map(slot => {
          const start = slot.start_time.slice(0, 5), end = slot.end_time.slice(0, 5);
          return <li key={slot.id} className="rounded-xl bg-cream p-3">
            <p className="font-bold text-teal">{weekday(slot.weekday, locale)} <span dir="ltr" className="mx-1 tabular-nums">{start} – {end}</span></p>
            {slot.group && <Link href={`/${locale}/student/classes/${slot.group_id}`} className="mt-1 inline-block text-sm font-bold text-orange underline">{slot.group.name}</Link>}
          </li>;
        })}</ul>
      </details>}
    </>}
    <div className="mt-6"><CalendarExportForm locale={locale} initialFrom={exportRange.from} initialUntil={exportRange.until}/></div>
  </PlatformShell>;
}
