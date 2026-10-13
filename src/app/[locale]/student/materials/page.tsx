import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { studentLessons } from '@/features/student/data';
import { EmptyState, Panel, QuickAction, RowLink, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';

export default async function StudentMaterials({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ page?: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const search = await searchParams;
  const data = await studentLessons(locale, search?.page);
  const copy = ar
    ? { eyebrow: 'للطلاب المسجلين', title: 'الحصص والمواد', intro: 'افتح الحصة للوصول إلى الملاحظات والروابط والملفات الخاصة.', error: 'تعذر تحميل حصصك وموادك. حدّث الصفحة وحاول مرة أخرى.', retry: 'إعادة المحاولة', classes: 'حالة المجموعات', timetable: 'الجدول الدراسي', discover: 'اكتشف المجموعات', empty: 'لم يضف معلموك حصصًا بعد.', lesson: 'عرض الحصة' }
    : { eyebrow: 'Enrolled students', title: 'Lessons and materials', intro: 'Open a lesson to access its private notes, links, and files.', error: 'Could not load your lessons and materials. Refresh and try again.', retry: 'Try again', classes: 'Enrollment status', timetable: 'Weekly timetable', discover: 'Find classes', empty: 'Your teachers have not scheduled lessons yet.', lesson: 'Open lesson' };
  const pages = ar ? { previous: 'السابق', next: 'التالي', page: 'صفحة' } : { previous: 'Previous', next: 'Next', page: 'Page' };
  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.intro}/>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:max-w-2xl"><QuickAction href={`/${locale}/student/classes`}>{copy.classes}</QuickAction><QuickAction href={`/${locale}/timetable`}>{copy.timetable}</QuickAction><QuickAction href={`/${locale}/teachers`}>{copy.discover}</QuickAction></div>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p><a href={`/${locale}/student/materials?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</a></Panel> : <Panel>{data.lessons.length ? <div className="grid gap-3">{data.lessons.map(lesson => <RowLink key={lesson.id} href={`/${locale}/student/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at, locale)} trailing={<span className="flex items-center gap-3"><Status value={lesson.status} locale={locale}/><span className="hidden text-sm font-bold text-orange sm:inline">{copy.lesson}</span></span>}/>)}</div> : <><EmptyState>{copy.empty}</EmptyState><Link href={`/${locale}/teachers`} className="mt-4 inline-flex rounded-xl bg-teal px-4 py-3 font-bold text-white">{copy.discover}</Link></>}</Panel>}
    {!data.error && <StudentPagination locale={locale} href={`/${locale}/student/materials`} page={data.page} pageCount={data.pageCount} labels={pages}/>}
  </>;
}
