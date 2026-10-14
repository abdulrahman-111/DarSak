import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { requireTeachingAccess } from '@/components/platform/access';
import { LessonForm } from '@/components/platform/forms';
import { EmptyState, Panel, RowLink, ScreenTitle, Status, cairoDate, weekday } from '@/components/platform/ui';
import { GenerationPreviewForm } from '@/features/teacher/generation-form';
import { DuplicateGroupForm } from '@/features/teacher/shortcuts-forms';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { GroupManagementControls } from '@/features/teacher/management-forms';
import { normalizeStudentPage, STUDENT_PAGE_SIZE, studentPageCount } from '@/features/student/pagination-domain';
import { StudentPagination } from '@/features/student/pagination';
import { WeeklyScheduleEditor } from '@/features/teacher/setup-forms';
import { AnnouncementForm } from '@/features/groups/announcement-form';
import { groupAnnouncement } from '@/features/groups/announcement-data';

export default async function TeacherGroupDetail({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ page?: string; roster_page?: string }> }) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireTeachingAccess(locale);
  const fetchLessons = (page: number) => me.db.from('lessons')
    .select('id,title,starts_at,status,group:groups!inner(teacher_id)', { count: 'exact' })
    .eq('group_id', id).eq('group.teacher_id', me.id)
    .order('starts_at', { ascending: false }).order('id', { ascending: false })
    .range((page - 1) * STUDENT_PAGE_SIZE, page * STUDENT_PAGE_SIZE - 1);
  const fetchRoster = (page: number) => me.db.rpc('group_enrollment_page', {
    p_group_id: id, p_offset: (page - 1) * STUDENT_PAGE_SIZE, p_limit: STUDENT_PAGE_SIZE,
  });
  let page = normalizeStudentPage(query.page);
  const maxRosterPage = Math.floor(2_147_483_647 / STUDENT_PAGE_SIZE);
  let rosterPage = Math.min(normalizeStudentPage(query.roster_page), maxRosterPage);
  const [group, slots, initialLessons, initialStudents, exclusions, announcement] = await Promise.all([
    me.db.from('groups').select('id,name,description,status,capacity,location').eq('id', id).eq('teacher_id', me.id).maybeSingle(),
    me.db.from('group_schedule_slots').select('id,group_id,weekday,start_time,end_time,timezone').eq('group_id', id).order('weekday').order('start_time'),
    fetchLessons(page),
    fetchRoster(rosterPage),
    me.db.from('group_lesson_exclusions').select('local_date').eq('group_id', id).order('local_date'),
    groupAnnouncement(me.db, id),
  ]);
  let lessons = initialLessons;
  const lessonCount = lessons.count ?? 0;
  const lessonPageCount = studentPageCount(lessonCount);
  if (!lessons.error && lessons.count != null && page > lessonPageCount) {
    page = lessonPageCount;
    lessons = await fetchLessons(page);
  }
  let students = initialStudents;
  const rosterTotal = (students.data as { total?: number } | null)?.total ?? 0;
  const rosterPageCount = studentPageCount(rosterTotal);
  if (!students.error && rosterPage > rosterPageCount) {
    rosterPage = rosterPageCount;
    students = await fetchRoster(rosterPage);
  }
  const lessonsFailed = !!lessons.error || lessons.count == null;
  const pageLabels = ar ? { previous: 'السابق', next: 'التالي', page: 'صفحة' } : { previous: 'Previous', next: 'Next', page: 'Page' };
  const currentGroup = group.data;
  if (!currentGroup) notFound();
  const copy = ar ? {
    schedule: 'الجدول الأسبوعي', cairo: 'كل الأوقات بتوقيت القاهرة.', addTime: 'أضف أول موعد أسبوعي.', scheduleEffect: 'تغييرات الجدول تؤثر في إنشاء الحصص مستقبلاً. الحصص التي أُنشئت بالفعل تبقى كما هي؛ عدّلها أو أعد جدولتها بشكل منفصل.',
    newLesson: 'حصة جديدة', lessons: 'الحصص', noLessons: 'لا توجد حصص بعد.', students: 'الطلاب والطلبات', noStudents: 'لا توجد طلبات بعد.',
    generation: 'إنشاء الحصص من الجدول', slotError: 'تعذر تحميل المواعيد الأسبوعية.', lessonsError: 'تعذر تحميل الحصص.', studentsError: 'تعذر تحميل الطلاب والطلبات.', exclusionsError: 'تعذر تحميل الأيام المستثناة.', back: 'العودة إلى مجموعاتي', archived: 'هذه المجموعة مؤرشفة. يمكنك مراجعة سجلها، لكن لن تُضاف مواعيد أو حصص جديدة.', archivedNoSchedule: 'لا توجد مواعيد أسبوعية محفوظة.',
  } : {
    schedule: 'Weekly schedule', cairo: 'All times use Africa/Cairo.', addTime: 'Add the first weekly time.', scheduleEffect: 'Schedule changes affect future lesson generation. Lessons already generated remain as they are; edit or reschedule them separately.',
    newLesson: 'New lesson', lessons: 'Lessons', noLessons: 'No lessons yet.', students: 'Students and requests', noStudents: 'No requests yet.',
    generation: 'Generate lessons from schedule', slotError: 'Could not load weekly times.', lessonsError: 'Could not load lessons.', studentsError: 'Could not load students and requests.', exclusionsError: 'Could not load excluded days.', back: 'Back to my groups', archived: 'This group is archived. You can review its history, but no new times or lessons can be added.', archivedNoSchedule: 'No weekly schedule was saved for this group.',
  };

  return <>
    <Link href={`/${locale}/teacher/groups`} className="mb-4 inline-flex font-bold text-teal underline">← {copy.back}</Link>
    <ScreenTitle eyebrow={ar ? 'تفاصيل المجموعة' : 'Group details'} title={currentGroup.name} description={currentGroup.description} action={<div className="grid justify-items-end gap-3"><div className="flex flex-wrap items-center gap-3"><Status value={currentGroup.status} locale={locale} />{currentGroup.status !== 'archived' && <Link href={`/${locale}/teacher/lessons?new=1&groupId=${id}`} className="rounded-xl bg-orange px-4 py-3 font-bold text-white">{ar ? 'إضافة حصة' : 'Add lesson'}</Link>}</div><GroupManagementControls locale={locale} groupId={id} status={currentGroup.status} /></div>} />
    {currentGroup.status === 'archived' && <Panel className="mb-6"><p className="text-sm font-semibold text-muted">{copy.archived}</p></Panel>}
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel><h2 className="text-xl font-black text-teal">{ar ? 'إعلان المجموعة' : 'Group announcement'}</h2><p className="mt-1 text-sm text-muted">{ar ? 'انشر رسالة للطلاب المقبولين. يمكنهم قراءتها في صفحات المجموعة والحصص.' : 'Post a message for accepted students. They can read it on the group and lesson pages.'}</p>{currentGroup.status === 'archived' && <p className="mt-2 text-sm font-semibold text-muted">{ar ? 'المجموعة مؤرشفة؛ يمكنك مراجعة الإعلان المحفوظ فقط.' : 'This group is archived; you can review its saved announcement only.'}</p>}<AnnouncementForm locale={locale} groupId={id} announcement={announcement} readOnly={currentGroup.status === 'archived'} /></Panel>
      <Panel>
        <h2 className="text-xl font-black text-teal">{copy.schedule}</h2>
        <p className="mt-1 text-sm text-muted">{copy.cairo}</p>
        {currentGroup.status !== 'archived' && <p className="mt-1 text-sm text-muted">{copy.scheduleEffect}</p>}
        {slots.error ? <p role="alert" className="my-5 text-sm text-red-700">{copy.slotError}</p> : currentGroup.status === 'archived' ? <div className="my-5 grid gap-2">{slots.data?.length ? slots.data.map(slot => <div key={slot.id} className="flex justify-between rounded-xl bg-cream px-4 py-3"><strong>{weekday(slot.weekday, locale)}</strong><span dir="ltr">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span></div>) : <EmptyState>{copy.archivedNoSchedule}</EmptyState>}</div> : <WeeklyScheduleEditor locale={locale} groupId={id} slots={slots.data ?? []} />}
        {currentGroup.status !== 'archived' && <>
          <div className="mt-5 border-t border-line pt-5"><DuplicateGroupForm locale={locale} groupId={id} /></div></>}
      </Panel>
      {currentGroup.status !== 'archived' && <Panel><h2 className="mb-4 text-xl font-black text-teal">{copy.newLesson}</h2><LessonForm locale={locale} groupId={id} /></Panel>}
    </div>

    {currentGroup.status !== 'archived' && <Panel className="mt-6">
      <h2 className="mb-4 text-xl font-black text-teal">{copy.generation}</h2>
      {exclusions.error ? <p role="alert" className="text-sm text-red-700">{copy.exclusionsError}</p> : <GenerationPreviewForm key={`${id}:${(slots.data ?? []).map(slot => `${slot.id}:${slot.weekday}:${slot.start_time}:${slot.end_time}`).join(',')}:${(exclusions.data ?? []).map(row => row.local_date).join(',')}`} locale={locale} groupId={id} savedExclusions={(exclusions.data ?? []).map(row => row.local_date)} />}
    </Panel>}

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel><h2 className="mb-4 text-xl font-black text-teal">{copy.lessons}</h2>{lessonsFailed ? <><p role="alert" className="text-sm text-red-700">{copy.lessonsError}</p><a href={`/${locale}/teacher/groups/${id}?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{ar ? 'إعادة المحاولة' : 'Try again'}</a></> : lessons.data?.length ? <div className="grid gap-2">{lessons.data.map(lesson => <RowLink key={lesson.id} href={`/${locale}/teacher/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at, locale)} trailing={<Status value={lesson.status} locale={locale} />} />)}</div> : <EmptyState>{copy.noLessons}</EmptyState>}<StudentPagination locale={locale} href={`/${locale}/teacher/groups/${id}`} page={page} pageCount={lessonPageCount} labels={pageLabels} pageParam="page" preserve={{ roster_page: rosterPage > 1 ? rosterPage : undefined }}/></Panel>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black text-teal">{copy.students}</h2><div className="flex flex-wrap gap-3 text-sm font-bold"><Link className="text-teal underline" href={`/${locale}/teacher/requests?group_id=${id}`}>{ar ? 'طلبات هذه المجموعة' : 'Requests for this group'}</Link><Link className="text-teal underline" href={`/${locale}/teacher/students?group_id=${id}`}>{ar ? 'طلاب هذه المجموعة' : 'Students in this group'}</Link></div></div>
        {students.error ? <p role="alert" className="text-sm text-red-700">{copy.studentsError}</p> : (students.data as { rows?: { enrollment_id: string; full_name: string; status: string }[] } | null)?.rows?.length ? <div className="grid gap-2">{(students.data as { rows: { enrollment_id: string; full_name: string; status: string }[] }).rows.map(student => <div key={student.enrollment_id} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between gap-3"><strong>{student.full_name}</strong><Status value={student.status} locale={locale} /></div>{currentGroup.status !== 'archived' && <EnrollmentDecisionButtons locale={locale} id={student.enrollment_id} status={student.status} />}</div>)}</div> : <EmptyState>{copy.noStudents}</EmptyState>}
        {!students.error && <StudentPagination locale={locale} href={`/${locale}/teacher/groups/${id}`} page={rosterPage} pageCount={rosterPageCount} labels={pageLabels} pageParam="roster_page" preserve={{ page: page > 1 ? page : undefined }} />}
      </Panel>
    </div>
  </>;
}
