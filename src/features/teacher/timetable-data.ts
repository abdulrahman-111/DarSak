import 'server-only';
import type { Locale } from '@/features/student/domain';
import { cairoDayBounds, cairoWeekBounds, normalizeTimetableSelection, normalizeTimetableWeek } from '@/features/student/timetable-domain';
import { clampTeacherPage, normalizeTeacherPage, teacherPageCount, teacherPageOffset, TEACHER_PAGE_SIZE } from './enrollment-pagination';
import { teacherViewer } from './data';

export const TEACHER_TIMETABLE_GROUP_LIMIT = 200;
type GroupChoice = { id: string; name: string };

async function teacherGroups(me: Awaited<ReturnType<typeof teacherViewer>>, selectedGroupId: string | null, activeOnly = false) {
  let groupQuery = me.db.from('groups').select('id,name').eq('teacher_id', me.id).order('name').order('id');
  if (activeOnly) groupQuery = groupQuery.neq('status', 'archived');
  const result = await groupQuery.range(0, TEACHER_TIMETABLE_GROUP_LIMIT);
  if (result.error) return { groups: [] as GroupChoice[], error: result.error };
  const rows = (result.data ?? []) as GroupChoice[];
  const groupsLimited = rows.length > TEACHER_TIMETABLE_GROUP_LIMIT;
  const groups = rows.slice(0, TEACHER_TIMETABLE_GROUP_LIMIT);
  if (selectedGroupId && !groups.some(group => group.id === selectedGroupId)) {
    let selectedQuery = me.db.from('groups').select('id,name').eq('teacher_id', me.id).eq('id', selectedGroupId);
    if (activeOnly) selectedQuery = selectedQuery.neq('status', 'archived');
    const selected = await selectedQuery.maybeSingle();
    if (selected.error) return { groups: [] as GroupChoice[], error: selected.error };
    if (selected.data) groups.push(selected.data as GroupChoice);
  }
  return { groups, groupsLimited, error: null };
}

export async function teacherCalendarGroupChoices(locale: Locale, requestedGroup: unknown = '') {
  const me = await teacherViewer(locale);
  const normalized = normalizeTimetableSelection('2000-01-03', null, requestedGroup).group;
  const groups = await teacherGroups(me, normalized, true);
  const selectedGroup = groups.groups.find(group => group.id === normalized) ?? null;
  return { groups: groups.groups, groupsLimited: groups.groupsLimited ?? false, selectedGroup, error: groups.error };
}

export async function teacherTimetable(locale: Locale, dateInput: unknown, dayInput: unknown, groupInput: unknown, pageInput: unknown = 1, now = new Date()) {
  const me = await teacherViewer(locale);
  const week = normalizeTimetableWeek(dateInput, now);
  const selection = normalizeTimetableSelection(week.weekStart, dayInput, groupInput);
  const groupsPromise = teacherGroups(me, selection.group);
  const bounds = selection.day ? cairoDayBounds(selection.day) : cairoWeekBounds(week.weekStart);
  const requestedPage = normalizeTeacherPage(pageInput);
  const buildQuery = (page: number) => {
    let query = me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,group:groups!inner(id,name,teacher_id)', { count: 'exact' })
      .eq('group.teacher_id', me.id).lt('starts_at', bounds.end.toISOString()).gt('ends_at', bounds.start.toISOString())
      .order('starts_at').order('id').range(teacherPageOffset(page), teacherPageOffset(page) + TEACHER_PAGE_SIZE - 1);
    if (selection.group) query = query.eq('group_id', selection.group);
    return query;
  };
  const [groupsResult, initial] = await Promise.all([groupsPromise, buildQuery(requestedPage)]);
  if (groupsResult.error) return { groups: [], groupsLimited: false, selectedGroup: null, lessons: [], total: 0, page: 1, pageCount: 1, week, ...selection, error: groupsResult.error };
  if (initial.error || initial.count == null) return { groups: groupsResult.groups, groupsLimited: groupsResult.groupsLimited, selectedGroup: groupsResult.groups.find(group => group.id === selection.group) ?? null, lessons: [], total: 0, page: 1, pageCount: 1, week, ...selection, error: initial.error ?? { message: 'Exact lesson count unavailable.' } };
  const total = initial.count;
  const page = clampTeacherPage(requestedPage, total);
  const result = page === requestedPage ? initial : await buildQuery(page);
  return {
    groups: groupsResult.groups,
    groupsLimited: groupsResult.groupsLimited,
    selectedGroup: groupsResult.groups.find(group => group.id === selection.group) ?? null,
    lessons: (result.data ?? []) as unknown as Array<{ id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; group: { id: string; name: string } | null }>,
    total,
    page,
    pageCount: teacherPageCount(total),
    week,
    ...selection,
    error: result.error,
  };
}
