import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { EmptyState, Panel, RowLink, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import { LessonForm } from '@/components/platform/forms';
import { teacherLessons } from '@/features/teacher/data';
import { StudentPagination } from '@/features/student/pagination';
import { CalendarExportForm } from '@/features/calendar/export-form';
import { defaultCalendarRange } from '@/features/calendar/domain';

export default async function TeacherLessons({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ new?: string; groupId?: string; deleted?: string; page?: string | string[] }> }) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const data = await teacherLessons(locale, query.page);
  const requestedNew = query.new === '1';
  const exportRange = defaultCalendarRange();
  const selectedGroup = data.groups.find(group => group.id === query.groupId);
  const copy = ar ? {
    title: 'الحصص', description: 'افتح مساحة الحصة لتعديل التفاصيل ومراجعة المواد.', add: 'إضافة حصة', group: 'اختر المجموعة', choose: '— اختر مجموعة —', select: 'اختيار',
    noGroups: 'أنشئ مجموعة قبل إضافة حصة.', createGroup: 'إنشاء مجموعة', noLessons: 'لا توجد حصص بعد.', previous: 'السابق', next: 'التالي', page: 'الصفحة', retry: 'إعادة المحاولة',
    invalidGroup: 'اختر إحدى مجموعاتك من القائمة لإضافة حصة.', failed: 'تعذر تحميل حصصك ومجموعاتك. حدّث الصفحة وحاول مرة أخرى.',
  } : {
    title: 'Lessons', description: 'Open a lesson workspace to update details and review its materials.', add: 'Add lesson', group: 'Choose a group', choose: '— Choose a group —', select: 'Select',
    noGroups: 'Create a group before adding a lesson.', createGroup: 'Create group', noLessons: 'No lessons yet.', previous: 'Previous', next: 'Next', page: 'Page', retry: 'Try again',
    invalidGroup: 'Choose one of your groups from the list to add a lesson.', failed: 'Could not load your lessons and groups. Refresh and try again.',
  };

  return <>
    <ScreenTitle
      eyebrow={ar ? 'تقويم المعلم' : 'Teacher calendar'}
      title={copy.title}
      description={copy.description}
      action={<Link href={`/${locale}/teacher/lessons?new=1`} className="rounded-xl bg-orange px-4 py-3 font-bold text-white">{copy.add}</Link>}
    />
    <CalendarExportForm locale={locale} initialFrom={exportRange.from} initialUntil={exportRange.until}/>
    {query.deleted === '1' && <Panel className="mb-4"><p role="status" className="text-sm font-semibold text-teal">{ar ? 'تم حذف الحصة.' : 'Lesson deleted.'}</p></Panel>}
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.failed}</p><Link href={`/${locale}/teacher/lessons?page=${data.page}`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</Link></Panel> : <>
      {requestedNew && <Panel className="mb-6">
        <h2 className="mb-4 text-xl font-black text-teal">{copy.add}</h2>
        {data.groups.length ? <>
          <form method="get" className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="new" value="1" />
            <label htmlFor="new-lesson-group" className="min-w-0 flex-1 text-sm font-bold">{copy.group}
              <select id="new-lesson-group" name="groupId" defaultValue={selectedGroup?.id ?? ''} required className="mt-2 block w-full rounded-xl border border-line bg-cream p-3">
                <option value="">{copy.choose}</option>
                {data.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <button className="rounded-xl border border-line px-4 py-3 font-bold text-teal">{copy.select}</button>
          </form>
          {query.groupId && !selectedGroup && <p role="alert" className="mb-4 text-sm text-red-700">{copy.invalidGroup}</p>}
          {selectedGroup && <LessonForm locale={locale} groupId={selectedGroup.id} />}
        </> : <div className="grid justify-items-start gap-3"><EmptyState>{copy.noGroups}</EmptyState><Link href={`/${locale}/teacher/groups/new`} className="rounded-xl bg-teal px-4 py-3 font-bold text-white">{copy.createGroup}</Link></div>}
      </Panel>}
      <Panel>
        {data.lessons.length ? <div className="grid gap-3">{data.lessons.map(lesson => {
          const group = Array.isArray(lesson.group) ? lesson.group[0] : lesson.group;
          return <RowLink key={lesson.id} href={`/${locale}/teacher/lessons/${lesson.id}`} title={lesson.title} meta={`${group?.name || '—'} · ${cairoDate(lesson.starts_at, locale)}`} trailing={<Status value={lesson.status} locale={locale} />} />;
        })}</div> : <EmptyState>{copy.noLessons}</EmptyState>}
      </Panel>
      <StudentPagination locale={locale} href={`/${locale}/teacher/lessons`} page={data.page} pageCount={data.pageCount} labels={copy}/>
    </>}
  </>;
}
