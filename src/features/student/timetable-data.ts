import 'server-only';
import type { Locale } from './domain';
import { student } from './data';
import { TIMETABLE_GROUP_LIMIT, TIMETABLE_LESSON_LIMIT } from './timetable-domain';
import { readCountedPage } from '@/lib/supabase/counted-page';

export type TimetableGroup = { id: string; name: string; location: string | null };
export type TimetableLesson = { id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; group: TimetableGroup | null };
export type TimetableSlot = { id: string; group_id: string; weekday: number; start_time: string; end_time: string; group: Pick<TimetableGroup, 'id' | 'name'> | null };

export async function studentTimetableDay(locale: Locale, start: Date, end: Date, groupId: string | null, page: number) {
  const me = await student(locale);
  const [enrollments, countedLessons, slots] = await Promise.all([
    me.db.from('enrollments').select('group:groups!inner(id,name,location)').eq('student_id', me.id).eq('status', 'accepted').neq('group.status', 'archived').limit(TIMETABLE_GROUP_LIMIT + 1),
    readCountedPage(page, TIMETABLE_LESSON_LIMIT, (currentPage) => {
      let query = me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,group:groups!inner(id,name,location,enrollments!inner(id))', { count: 'exact' })
        .eq('group.enrollments.student_id', me.id).eq('group.enrollments.status', 'accepted')
        .gt('ends_at', start.toISOString()).lt('starts_at', end.toISOString())
        .order('starts_at').order('id').range((currentPage - 1) * TIMETABLE_LESSON_LIMIT, currentPage * TIMETABLE_LESSON_LIMIT - 1);
      if (groupId) query = query.eq('group_id', groupId);
      return query;
    }),
    (() => {
      let query = me.db.from('group_schedule_slots').select('id,group_id,weekday,start_time,end_time,group:groups!inner(id,name,enrollments!inner(id))')
        .eq('group.enrollments.student_id', me.id).eq('group.enrollments.status', 'accepted').neq('group.status', 'archived')
        .order('weekday').order('start_time').order('id').range(0, 200);
      if (groupId) query = query.eq('group_id', groupId);
      return query;
    })(),
  ]);
  const { result: lessons, page: recoveredPage } = countedLessons;
  const rows = (enrollments.data || []).flatMap(row => row.group ? [row.group as unknown as TimetableGroup] : []);
  const groups = [...new Map(rows.map(group => [group.id, group])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    groups: groups.slice(0, TIMETABLE_GROUP_LIMIT),
    groupsLimited: rows.length > TIMETABLE_GROUP_LIMIT,
    lessons: (lessons.data || []) as unknown as TimetableLesson[],
    page: recoveredPage,
    slots: (slots.data || []) as unknown as TimetableSlot[],
    slotsLimited: (slots.data || []).length > 200,
    total: lessons.count ?? 0,
    error: !!(enrollments.error || lessons.error || slots.error || lessons.count == null),
  };
}
