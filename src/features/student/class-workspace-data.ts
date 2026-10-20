import 'server-only';
import { student, type Lesson, type Slot } from './data';
import { idSchema, type Locale } from './domain';
import { classPage, classLessonView, classView, parseClassDetail } from './class-workspace-domain';
import type { StudentResource } from './resource-domain';
import { studentPageCount } from './pagination-domain';
import { readCountedPage } from '@/lib/supabase/counted-page';

export async function studentClassWorkspace(
  locale: Locale,
  id: string,
  query: Record<string, string | undefined> = {},
) {
  const me = await student(locale);
  if (!idSchema.safeParse(id).success) return null;
  const overview = await me.db.rpc('student_class_detail', { p_group_id: id });
  if (overview.error) throw new Error('Student class could not be loaded');
  if (!overview.data) return null;
  const group = parseClassDetail(overview.data);
  if (!group) throw new Error('Invalid class result');
  const view = classView(query.view),
    requestedPage = classPage(query.page),
    lessonView = classLessonView(query.lessons),
    now = new Date().toISOString();
  // Each section loads only the bounded data it needs. No public discovery lookup.
  const nextPromise =
    view === 'overview'
      ? me.db
          .from('lessons')
          .select('id,group_id,title,starts_at,ends_at,status')
          .eq('group_id', id)
          .eq('status', 'scheduled')
          .gt('ends_at', now)
          .order('starts_at')
          .order('id')
          .limit(1)
      : Promise.resolve(null);
  let lessons: Lesson[] = [],
    resources: StudentResource[] = [],
    page = requestedPage,
    total = 0,
    error = false;
  if (view === 'lessons') {
    const fetch = (p: number) => {
      let q = me.db
        .from('lessons')
        .select('id,group_id,title,starts_at,ends_at,status,notes', { count: 'exact' })
        .eq('group_id', id);
      q = lessonView === 'history' ? q.lt('ends_at', now) : q.gte('ends_at', now);
      return q
        .order('starts_at', { ascending: lessonView !== 'history' })
        .order('id')
        .range((p - 1) * 20, p * 20 - 1);
    };
    const counted = await readCountedPage(page, 20, fetch);
    page = counted.page;
    const result = counted.result;
    total = result.count ?? 0;
    lessons = (result.data ?? []) as Lesson[];
    error = !!result.error || result.count == null;
  } else if (view === 'materials') {
    const fetch = (p: number) =>
      me.db.rpc('student_resource_page', {
        p_group_id: id,
        p_kind: null,
        p_query: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
        p_offset: (p - 1) * 20,
        p_limit: 20,
      });
    let result = await fetch(page);
    const payload = result.data as { rows?: StudentResource[]; total?: number } | null;
    total = payload?.total ?? 0;
    page = Math.min(page, studentPageCount(total));
    if (!result.error && page !== requestedPage) result = await fetch(page);
    resources = (result.data as { rows?: StudentResource[] } | null)?.rows ?? [];
    error = !!result.error || payload?.total == null;
  }
  const [next, slots, contacts, announcement, attendance] = await Promise.all([
    nextPromise,
    view === 'overview'
      ? me.db
          .from('group_schedule_slots')
          .select('id,group_id,weekday,start_time,end_time,timezone')
          .eq('group_id', id)
          .order('weekday')
          .order('start_time')
          .limit(100)
      : Promise.resolve(null),
    (view === 'teacher' || view === 'overview') && group.teacher_available
      ? me.db
          .from('teacher_contacts')
          .select('phone_number,whatsapp_number,contact_email')
          .eq('teacher_id', group.teacher_id)
          .maybeSingle()
      : Promise.resolve(null),
    view === 'overview'
      ? me.db
          .from('group_pinned_announcements')
          .select('body,edited_at')
          .eq('group_id', id)
          .maybeSingle()
      : Promise.resolve(null),
    view === 'lessons' && lessons.length
      ? me.db
          .from('lesson_attendance')
          .select('lesson_id,status')
          .eq('student_id', me.id)
          .in(
            'lesson_id',
            lessons.map(l => l.id),
          )
      : Promise.resolve(null),
  ]);
  return {
    me,
    group,
    view,
    lessonView,
    lessons,
    resources,
    page,
    total,
    pageCount: studentPageCount(total),
    next: next?.data?.[0] as Lesson | undefined,
    slots: (slots?.data ?? []) as Slot[],
    contacts: contacts?.data ?? null,
    announcement: announcement?.data ?? null,
    attendance: attendance?.data ?? [],
    error:
      error ||
      !!(
        next?.error ||
        slots?.error ||
        contacts?.error ||
        announcement?.error ||
        attendance?.error
      ),
  };
}
