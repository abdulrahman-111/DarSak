import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { LessonForm, SlotForm } from '@/components/platform/forms';
import { EmptyState, Panel, RowLink, ScreenTitle, Status, cairoDate, weekday } from '@/components/platform/ui';
import { GenerationPreviewForm } from '@/features/teacher/generation-form';

export default async function TeacherGroupDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireViewer(locale, 'teacher');
  const [group, slots, lessons, students, exclusions] = await Promise.all([
    me.db.from('groups').select('id,name,description,status,capacity,location').eq('id', id).eq('teacher_id', me.id).maybeSingle(),
    me.db.from('group_schedule_slots').select('id,group_id,weekday,start_time,end_time,timezone').eq('group_id', id).order('weekday').order('start_time'),
    me.db.from('lessons').select('id,title,starts_at,status').eq('group_id', id).order('starts_at', { ascending: false }).limit(20),
    me.db.rpc('group_students', { p_group_id: id }),
    me.db.from('group_lesson_exclusions').select('local_date').eq('group_id', id).order('local_date'),
  ]);
  if (!group.data) notFound();
  const copy = ar ? {
    schedule: 'الجدول الأسبوعي', cairo: 'كل الأوقات بتوقيت القاهرة.', addTime: 'أضف أول موعد أسبوعي.',
    newLesson: 'حصة جديدة', lessons: 'الحصص', noLessons: 'لا توجد حصص بعد.', students: 'الطلاب والطلبات', noStudents: 'لا توجد طلبات بعد.',
    generation: 'إنشاء الحصص من الجدول', slotError: 'تعذر تحميل المواعيد الأسبوعية.', lessonsError: 'تعذر تحميل الحصص.', studentsError: 'تعذر تحميل الطلاب والطلبات.', exclusionsError: 'تعذر تحميل الأيام المستثناة.',
  } : {
    schedule: 'Weekly schedule', cairo: 'All times use Africa/Cairo.', addTime: 'Add the first weekly time.',
    newLesson: 'New lesson', lessons: 'Lessons', noLessons: 'No lessons yet.', students: 'Students and requests', noStudents: 'No requests yet.',
    generation: 'Generate lessons from schedule', slotError: 'Could not load weekly times.', lessonsError: 'Could not load lessons.', studentsError: 'Could not load students and requests.', exclusionsError: 'Could not load excluded days.',
  };

  return <>
    <ScreenTitle eyebrow={ar ? 'تفاصيل المجموعة' : 'Group details'} title={group.data.name} description={group.data.description} action={<Status value={group.data.status} locale={locale} />} />
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel>
        <h2 className="text-xl font-black text-teal">{copy.schedule}</h2>
        <p className="mt-1 text-sm text-muted">{copy.cairo}</p>
        {slots.error ? <p role="alert" className="my-5 text-sm text-red-700">{copy.slotError}</p> : <div className="my-5 grid gap-2">{slots.data?.length ? slots.data.map(slot => <div key={slot.id} className="flex justify-between rounded-xl bg-cream px-4 py-3"><strong>{weekday(slot.weekday, locale)}</strong><span dir="ltr">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span></div>) : <EmptyState>{copy.addTime}</EmptyState>}</div>}
        <SlotForm locale={locale} groupId={id} />
      </Panel>
      <Panel><h2 className="mb-4 text-xl font-black text-teal">{copy.newLesson}</h2><LessonForm locale={locale} groupId={id} /></Panel>
    </div>

    <Panel className="mt-6">
      <h2 className="mb-4 text-xl font-black text-teal">{copy.generation}</h2>
      {exclusions.error ? <p role="alert" className="text-sm text-red-700">{copy.exclusionsError}</p> : <GenerationPreviewForm key={`${id}:${(slots.data ?? []).map(slot => `${slot.id}:${slot.weekday}:${slot.start_time}:${slot.end_time}`).join(',')}:${(exclusions.data ?? []).map(row => row.local_date).join(',')}`} locale={locale} groupId={id} savedExclusions={(exclusions.data ?? []).map(row => row.local_date)} />}
    </Panel>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel><h2 className="mb-4 text-xl font-black text-teal">{copy.lessons}</h2>{lessons.error ? <p role="alert" className="text-sm text-red-700">{copy.lessonsError}</p> : lessons.data?.length ? <div className="grid gap-2">{lessons.data.map(lesson => <RowLink key={lesson.id} href={`/${locale}/teacher/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at, locale)} trailing={<Status value={lesson.status} locale={locale} />} />)}</div> : <EmptyState>{copy.noLessons}</EmptyState>}</Panel>
      <Panel>
        <h2 className="mb-4 text-xl font-black text-teal">{copy.students}</h2>
        {students.error ? <p role="alert" className="text-sm text-red-700">{copy.studentsError}</p> : students.data?.length ? <div className="grid gap-2">{students.data.map((student: { enrollment_id: string; full_name: string; status: string }) => <div key={student.enrollment_id} className="flex items-center justify-between rounded-xl border border-line p-3"><strong>{student.full_name}</strong><Status value={student.status} locale={locale} /></div>)}</div> : <EmptyState>{copy.noStudents}</EmptyState>}
      </Panel>
    </div>
  </>;
}
