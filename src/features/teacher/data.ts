import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { buildTeacherSetupTasks, cairoDayBounds, dashboardGroupIdBatches, dashboardListCount, dashboardNextPageOffset, DASHBOARD_PAGE_SIZE, teacherDashboardError } from './dashboard-domain';

export async function teacherViewer(locale: Locale) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { data: profile } = await db.from('profiles').select('id,full_name,role,status').eq('id', user.id).single();
  if (!profile || profile.role !== 'teacher' || profile.status !== 'active') redirect(`/${locale}/dashboard`);
  const { data: teacher } = await db.from('teacher_profiles').select('headline,bio,approved').eq('id', user.id).single();
  return { db, id: user.id, profile, teacher };
}

type OwnedGroup = { id: string; name: string; capacity: number; status: string; location: string; description: string; offering: unknown };
type GroupStudentRow = { enrollment_id: string; student_id: string; full_name: string; status: string; group_id: string; group_name: string };
type GroupStudentRecord = { enrollment_id: string; student_id: string; full_name: string; status: string };

async function readAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const result = await fetchPage(offset, offset + DASHBOARD_PAGE_SIZE - 1);
    if (result.error) return { rows: [] as T[], error: result.error };
    const page = result.data ?? [];
    rows.push(...page);
    const nextOffset = dashboardNextPageOffset(offset, page.length);
    if (nextOffset === null) return { rows, error: null };
    offset = nextOffset;
  }
}

async function dashboardGroups(me: Awaited<ReturnType<typeof teacherViewer>>) {
  return readAllPages<OwnedGroup>((from, to) => me.db.from('groups').select('id,name,capacity,status,location,description,offering:offerings(subject:subjects(name_ar,name_en))').eq('teacher_id', me.id).order('created_at', { ascending: false }).order('id').range(from, to));
}

async function requestGroups(me: Awaited<ReturnType<typeof teacherViewer>>) {
  return readAllPages<{ id: string; name: string; capacity: number }>((from, to) => me.db.from('groups').select('id,name,capacity').eq('teacher_id', me.id).order('name').order('id').range(from, to));
}

async function calendarGroups(me: Awaited<ReturnType<typeof teacherViewer>>) {
  return readAllPages<{ id: string; name: string }>((from, to) => me.db.from('groups').select('id,name').eq('teacher_id', me.id).order('name').order('id').range(from, to));
}

async function groupStudentRows(
  me: Awaited<ReturnType<typeof teacherViewer>>,
  groups: Array<{ id: string; name: string }>,
  options: { pendingOnly?: boolean; limit?: number } = {},
) {
  const rows: GroupStudentRow[] = [];
  for (const group of groups) {
    const result = await readAllPages<GroupStudentRecord>((from, to) => me.db.rpc('group_students', { p_group_id: group.id }).order('full_name').order('enrollment_id').range(from, to));
    if (result.error) return { rows: [] as GroupStudentRow[], error: result.error };
    for (const row of result.rows) {
      if (options.pendingOnly && row.status !== 'pending') continue;
      rows.push({ ...row, group_id: group.id, group_name: group.name });
      if (options.limit && rows.length >= options.limit) return { rows, error: null };
    }
  }
  return { rows, error: null };
}

async function lessonRowsForGroups(
  me: Awaited<ReturnType<typeof teacherViewer>>,
  groupIds: string[],
  range: { kind: 'today'; start: string; end: string } | { kind: 'upcoming'; from: string },
) {
  if (!groupIds.length) return { rows: [] as Array<{ id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; group: unknown }>, count: 0, error: null };
  const batches = dashboardGroupIdBatches(groupIds);
  const results = await Promise.all(batches.map(async ids => {
    let query = me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,group:groups(name)', { count: 'exact' }).in('group_id', ids);
    if (range.kind === 'today') query = query.lt('starts_at', range.end).gt('ends_at', range.start).in('status', ['scheduled', 'completed']);
    else query = query.eq('status', 'scheduled').gte('starts_at', range.from);
    return query.order('starts_at').limit(8);
  }));
  const failed = results.find(result => result.error || (result.count == null && (result.data?.length ?? 0) >= 8));
  if (failed) return { rows: [] as Array<{ id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; group: unknown }>, count: 0, error: failed.error ?? { message: 'Exact lesson count unavailable.' } };
  const rows = results.flatMap(result => result.data ?? []).sort((left, right) => left.starts_at.localeCompare(right.starts_at)).slice(0, 8);
  const count = results.reduce((sum, result) => sum + (result.count ?? result.data?.length ?? 0), 0);
  return { rows, count, error: null };
}

async function slotGroupIds(me: Awaited<ReturnType<typeof teacherViewer>>, groupIds: string[]) {
  const found = new Set<string>();
  for (const ids of dashboardGroupIdBatches(groupIds)) {
    const result = await readAllPages<{ group_id: string; id: string }>((from, to) => me.db.from('group_schedule_slots').select('group_id,id').in('group_id', ids).order('group_id').order('id').range(from, to));
    if (result.error) return { groupIds: new Set<string>(), error: result.error };
    for (const row of result.rows) found.add(row.group_id);
  }
  return { groupIds: found, error: null };
}

async function exactPendingRequestCount(me: Awaited<ReturnType<typeof teacherViewer>>, groupIds: string[]) {
  let count = 0;
  for (const ids of dashboardGroupIdBatches(groupIds)) {
    const result = await me.db.from('enrollments').select('id', { count: 'exact', head: true }).in('group_id', ids).eq('status', 'pending');
    if (result.error || result.count == null) return { count: 0, error: result.error ?? { message: 'Exact request count unavailable.' } };
    count += result.count;
  }
  return { count, error: null };
}

async function calendarLessonRows(me: Awaited<ReturnType<typeof teacherViewer>>, groupIds: string[]) {
  const batches = dashboardGroupIdBatches(groupIds);
  const results = await Promise.all(batches.map(ids => me.db.from('lessons')
    .select('id,group_id,title,starts_at,ends_at,status,notes,group:groups(name)')
    .in('group_id', ids)
    .order('starts_at', { ascending: false })
    .order('id')
    .limit(100)));
  const failed = results.find(result => result.error);
  if (failed) return { rows: [] as Array<{ id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; notes: string; group: unknown }>, error: failed.error };
  const rows = results.flatMap(result => result.data ?? []).sort((left, right) => right.starts_at.localeCompare(left.starts_at)).slice(0, 100);
  return { rows, error: null };
}

function emptyTeacherOverview(me: Awaited<ReturnType<typeof teacherViewer>>, locale: Locale) {
  return {
    me,
    groups: [] as OwnedGroup[],
    todayLessons: [] as Array<{ id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; group: unknown }>,
    upcomingLessons: [] as Array<{ id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; group: unknown }>,
    pendingRequests: [] as GroupStudentRow[],
    counts: { groups: 0, todayLessons: 0, upcomingLessons: 0, pendingRequests: 0 },
    setupTasks: [] as ReturnType<typeof buildTeacherSetupTasks>,
    error: teacherDashboardError(locale),
  };
}

export async function teacherOverview(locale: Locale, now = new Date()) {
  const me = await teacherViewer(locale);
  const groupResult = await dashboardGroups(me);
  if (groupResult.error) return emptyTeacherOverview(me, locale);
  const groups = groupResult.rows as OwnedGroup[];
  const groupIds = groups.map(group => group.id);
  const nowIso = now.toISOString();
  const bounds = cairoDayBounds(now);
  const [todayResult, upcomingResult, teacherProfile, specializations, slots, students, requestCount] = await Promise.all([
    lessonRowsForGroups(me, groupIds, { kind: 'today', start: bounds.start.toISOString(), end: bounds.end.toISOString() }),
    lessonRowsForGroups(me, groupIds, { kind: 'upcoming', from: nowIso }),
    me.db.from('teacher_profiles').select('headline,bio,approved,avatar_path').eq('id', me.id).maybeSingle(),
    me.db.from('teacher_specializations').select('offering_id').eq('teacher_id', me.id),
    slotGroupIds(me, groupIds),
    groupStudentRows(me, groups, { pendingOnly: true, limit: 5 }),
    exactPendingRequestCount(me, groupIds),
  ]);
  if (todayResult.error || upcomingResult.error || teacherProfile.error || specializations.error || slots.error || students.error || requestCount.error || !teacherProfile.data) {
    return emptyTeacherOverview(me, locale);
  }
  const pendingRequests = students.rows;
  const todayLessons = todayResult.rows;
  const upcomingLessons = upcomingResult.rows;
  const upcomingCount = dashboardListCount(upcomingResult.count, upcomingLessons);
  const setupTasks = buildTeacherSetupTasks({
    teacher: teacherProfile.data,
    specializationCount: specializations.data?.length ?? 0,
    groups,
    groupIdsWithSlots: slots.groupIds,
    upcomingLessonCount: upcomingCount,
  });
  return {
    me,
    groups,
    todayLessons,
    upcomingLessons,
    pendingRequests,
    counts: {
      groups: groups.length,
      todayLessons: dashboardListCount(todayResult.count, todayLessons),
      upcomingLessons: upcomingCount,
      pendingRequests: requestCount.count,
    },
    setupTasks,
    error: null,
  };
}

export async function teacherRequests(locale: Locale) {
  const me = await teacherViewer(locale);
  const result = await requestGroups(me);
  if (result.error) return { me, groups: [], requests: [], error: result.error };
  const groups = result.rows;
  const students = await groupStudentRows(me, groups);
  return { me, groups, requests: students.rows, error: students.error };
}

export async function teacherLessons(locale: Locale) {
  const me = await teacherViewer(locale);
  const groupsResult = await calendarGroups(me);
  if (groupsResult.error) return { me, groups: [], lessons: [], error: groupsResult.error };
  const groups = groupsResult.rows;
  if (!groups.length) return { me, groups, lessons: [], error: null };
  const lessons = await calendarLessonRows(me, groups.map(group => group.id));
  return { me, groups, lessons: lessons.rows, error: lessons.error };
}

export async function teacherLesson(locale: Locale, id: string) {
  const me = await teacherViewer(locale);
  const { data: lesson, error } = await me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,notes,group:groups(name)').eq('id', id).maybeSingle();
  if (error || !lesson) return null;
  const { data: materials, error: materialError } = await me.db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: false });
  return { me, lesson, materials: materials ?? [], error: materialError };
}
