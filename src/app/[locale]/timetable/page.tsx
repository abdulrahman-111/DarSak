import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { studentTimetable } from '@/features/student/data';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { EmptyState, Panel, RowLink, ScreenTitle, Status, cairoDate, weekday } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { CalendarExportForm } from '@/features/calendar/export-form';
import { defaultCalendarRange } from '@/features/calendar/domain';
import { unreadNotificationCount } from '@/features/notifications/data';

export default async function Timetable({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ page?: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw), ar = locale === 'ar';
  const me = await requireViewer(locale, 'student');
  const unreadCount=await unreadNotificationCount(me.db);
  const search = await searchParams;
  const data = await studentTimetable(locale, search?.page);
  const exportRange = defaultCalendarRange();
  const copy = ar
    ? { title: 'الجدول الأسبوعي', intro: 'مواعيد مجموعاتك والحصص القادمة في مكان واحد.', eyebrow: 'بتوقيت القاهرة', error: 'تعذر تحميل جدولك. حدّث الصفحة وحاول مرة أخرى.', retry: 'إعادة المحاولة', dated: 'الحصص القادمة', empty: 'لا توجد حصص قادمة أو مواعيد أسبوعية لمجموعاتك بعد.', previous: 'السابق', next: 'التالي', page: 'صفحة', open: 'عرض الحصة' }
    : { title: 'Weekly timetable', intro: 'Your class times and upcoming lessons in one place.', eyebrow: 'Africa/Cairo', error: 'Could not load your timetable. Refresh and try again.', retry: 'Try again', dated: 'Upcoming lessons', empty: 'There are no upcoming lessons or weekly times for your classes yet.', previous: 'Previous', next: 'Next', page: 'Page', open: 'Open lesson' };
  const byDay = Array.from({ length: 7 }, (_, day) => ({ day, slots: data.slots.filter(slot => slot.weekday === day) }));
  return <PlatformShell locale={locale} role="student" name={me.fullName} unreadCount={unreadCount}>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.intro}/>
    <CalendarExportForm locale={locale} initialFrom={exportRange.from} initialUntil={exportRange.until}/>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p><a href={`/${locale}/timetable?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</a></Panel> : <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{byDay.map(column => <Panel key={column.day}><h2 className="font-black text-teal">{weekday(column.day, locale)}</h2><div className="mt-4 grid gap-2">{column.slots.length ? column.slots.map(slot => <div key={slot.id} className="rounded-xl bg-cream p-3" dir="ltr">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</div>) : <p className="text-sm text-muted">—</p>}</div></Panel>)}</div>
      <Panel className="mt-6"><h2 className="mb-4 text-xl font-black text-teal">{copy.dated}</h2>{data.lessons.length ? <div className="grid gap-3">{data.lessons.map(lesson => <RowLink key={lesson.id} href={`/${locale}/student/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at, locale)} trailing={<span className="flex items-center gap-3"><Status value={lesson.status} locale={locale}/><span className="hidden text-sm font-bold text-orange sm:inline">{copy.open}</span></span>}/>)}</div> : <><EmptyState>{copy.empty}</EmptyState><Link href={`/${locale}/student/classes`} className="mt-4 inline-flex font-bold text-orange underline">{ar ? 'عرض مجموعاتي' : 'View my classes'}</Link></>}</Panel>
      <StudentPagination locale={locale} href={`/${locale}/timetable`} page={data.page} pageCount={data.pageCount} labels={copy}/>
    </>}
  </PlatformShell>;
}
