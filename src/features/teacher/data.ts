import 'server-only';
import { redirect } from 'next/navigation';
import { getRequestViewer } from '@/features/platform/request-viewer';
import type { Locale } from '@/features/student/domain';
import { buildTeacherSetupTasks, cairoDayBounds, dashboardGroupIdBatches, dashboardListCount, dashboardNextPageOffset, DASHBOARD_PAGE_SIZE, teacherDashboardError } from './dashboard-domain';
import { clampTeacherPage, normalizeTeacherPage, TEACHER_PAGE_SIZE, teacherPageCount, teacherPageOffset } from './enrollment-pagination';

export async function teacherViewer(locale: Locale) {
  const { db, user, profile } = await getRequestViewer();
  if (!user) redirect(`/${locale}/login`);
  if (!profile || profile.role !== 'teacher' || profile.status !== 'active') redirect(`/${locale}/dashboard`);
  const { data: teacher, error: teacherError } = await db.from('teacher_profiles').select('headline,bio,approved,avatar_path,cover_path').eq('id', user.id).maybeSingle();
  return { db, id: user.id, profile, teacher, teacherError };
}

type OwnedGroup = { id: string; name: string; capacity: number; status: string; location: string; description: string; offering: unknown };
type GroupStudentRow = { enrollment_id: string; student_id: string; full_name: string; status: string; group_id: string; group_name: string };
type TeacherEnrollmentPage = { rows: GroupStudentRow[]; total: number };

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

async function calendarGroups(me: Awaited<ReturnType<typeof teacherViewer>>) {
  return readAllPages<{ id: string; name: string }>((from, to) => me.db.from('groups').select('id,name').eq('teacher_id', me.id).order('name').order('id').range(from, to));
}

async function teacherEnrollmentPage(
  me: Awaited<ReturnType<typeof teacherViewer>>,
  status: 'pending' | 'accepted',
  requestedPage: unknown,
): Promise<{ rows: GroupStudentRow[]; total: number; page: number; pageCount: number; error: { message: string } | null }> {
  const first = await me.db.rpc('teacher_enrollment_page', {
    p_status: status,
    p_offset: 0,
    p_limit: TEACHER_PAGE_SIZE,
  });
  if (first.error) return { rows: [], total: 0, page: 1, pageCount: 1, error: first.error };
  const firstPayload = first.data as TeacherEnrollmentPage | null;
  if (!firstPayload || !Array.isArray(firstPayload.rows) || !Number.isSafeInteger(firstPayload.total) || firstPayload.total < 0) {
    return { rows: [], total: 0, page: 1, pageCount: 1, error: { message: 'Invalid enrollment page response.' } };
  }
  const pageCount = teacherPageCount(firstPayload.total);
  const page = clampTeacherPage(normalizeTeacherPage(requestedPage), firstPayload.total);
  if (page === 1) return { ...firstPayload, page, pageCount, error: null };

  const result = await me.db.rpc('teacher_enrollment_page', {
    p_status: status,
    p_offset: teacherPageOffset(page),
    p_limit: TEACHER_PAGE_SIZE,
  });
  if (result.error) return { rows: [], total: 0, page, pageCount, error: result.error };
  const payload = result.data as TeacherEnrollmentPage | null;
  if (!payload || !Array.isArray(payload.rows) || !Number.isSafeInteger(payload.total) || payload.total < 0) {
    return { rows: [], total: 0, page, pageCount, error: { message: 'Invalid enrollment page response.' } };
  }
  const latestPageCount = teacherPageCount(payload.total);
  const latestPage = clampTeacherPage(page, payload.total);
  if (latestPage !== page) {
    const lastPage = await me.db.rpc('teacher_enrollment_page', {
      p_status: status,
      p_offset: teacherPageOffset(latestPage),
      p_limit: TEACHER_PAGE_SIZE,
    });
    if (lastPage.error) return { rows: [], total: 0, page: latestPage, pageCount: latestPageCount, error: lastPage.error };
    const lastPayload = lastPage.data as TeacherEnrollmentPage | null;
    if (!lastPayload || !Array.isArray(lastPayload.rows) || !Number.isSafeInteger(lastPayload.total) || lastPayload.total < 0) {
      return { rows: [], total: 0, page: latestPage, pageCount: latestPageCount, error: { message: 'Invalid enrollment page response.' } };
    }
    return { ...lastPayload, page: latestPage, pageCount: teacherPageCount(lastPayload.total), error: null };
  }
  return { ...payload, page, pageCount: latestPageCount, error: null };
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

async function calendarLessonRows(me: Awaited<ReturnType<typeof teacherViewer>>, requestedPage: unknown) {
  type LessonRow = { id: string; group_id: string; title: string; starts_at: string; ends_at: string; status: string; notes: string; group: unknown };
  const selected = 'id,group_id,title,starts_at,ends_at,status,notes,group:groups!inner(name,teacher_id)';
  const targetPage = normalizeTeacherPage(requestedPage);
  let total: number | null = null;
  if (targetPage > 1) {
    const count = await me.db.from('lessons').select('id,group:groups!inner(teacher_id)', { count: 'exact', head: true }).eq('groups.teacher_id', me.id);
    if (count.error || count.count == null) return { rows: [] as LessonRow[], total: 0, page: 1, pageCount: 1, error: count.error ?? { message: 'Exact lesson count unavailable.' } };
    total = count.count;
  }

  let page = targetPage;
  if (total != null) page = clampTeacherPage(targetPage, total);
  let result = await me.db.from('lessons')
    .select(selected, total == null ? { count: 'exact' } : {})
    .eq('groups.teacher_id', me.id)
    .order('starts_at', { ascending: false })
    .order('id', { ascending: false })
    .range(teacherPageOffset(page), teacherPageOffset(page) + TEACHER_PAGE_SIZE - 1);
  if (result.error) return { rows: [] as LessonRow[], total: total ?? 0, page, pageCount: teacherPageCount(total ?? 0), error: result.error };
  total ??= result.count;
  if (total == null) return { rows: [] as LessonRow[], total: 0, page: 1, pageCount: 1, error: { message: 'Exact lesson count unavailable.' } };

  const latestPage = clampTeacherPage(page, total);
  if (latestPage !== page) {
    page = latestPage;
    result = await me.db.from('lessons')
      .select(selected)
      .eq('groups.teacher_id', me.id)
      .order('starts_at', { ascending: false })
      .order('id', { ascending: false })
      .range(teacherPageOffset(page), teacherPageOffset(page) + TEACHER_PAGE_SIZE - 1);
    if (result.error) return { rows: [] as LessonRow[], total, page, pageCount: teacherPageCount(total), error: result.error };
  }
  return { rows: (result.data ?? []) as LessonRow[], total, page, pageCount: teacherPageCount(total), error: null };
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
  const [todayResult, upcomingResult, specializations, slots, students] = await Promise.all([
    lessonRowsForGroups(me, groupIds, { kind: 'today', start: bounds.start.toISOString(), end: bounds.end.toISOString() }),
    lessonRowsForGroups(me, groupIds, { kind: 'upcoming', from: nowIso }),
    me.db.from('teacher_specializations').select('offering_id').eq('teacher_id', me.id),
    slotGroupIds(me, groupIds),
    teacherEnrollmentPage(me, 'pending', 1),
  ]);
  if (todayResult.error || upcomingResult.error || me.teacherError || !me.teacher || specializations.error || slots.error || students.error) {
    return emptyTeacherOverview(me, locale);
  }
  const pendingRequests = students.rows;
  const todayLessons = todayResult.rows;
  const upcomingLessons = upcomingResult.rows;
  const upcomingCount = dashboardListCount(upcomingResult.count, upcomingLessons);
  const setupTasks = buildTeacherSetupTasks({
    teacher: me.teacher,
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
      pendingRequests: students.total,
    },
    setupTasks,
    error: null,
  };
}

export async function teacherRequests(locale: Locale, requestedPage: unknown = 1) {
  const me = await teacherViewer(locale);
  const page = await teacherEnrollmentPage(me, 'pending', requestedPage);
  return { me, requests: page.rows, total: page.total, page: page.page, pageCount: page.pageCount, error: page.error };
}

export async function teacherStudents(locale: Locale, requestedPage: unknown = 1) {
  const me = await teacherViewer(locale);
  const page = await teacherEnrollmentPage(me, 'accepted', requestedPage);
  return { me, students: page.rows, total: page.total, page: page.page, pageCount: page.pageCount, error: page.error };
}

export async function teacherLessons(locale: Locale, requestedPage: unknown = 1) {
  const me = await teacherViewer(locale);
  const groupsResult = await calendarGroups(me);
  if (groupsResult.error) return { me, groups: [], lessons: [], total: 0, page: 1, pageCount: 1, error: groupsResult.error };
  const groups = groupsResult.rows;
  if (!groups.length) return { me, groups, lessons: [], total: 0, page: 1, pageCount: 1, error: null };
  const lessons = await calendarLessonRows(me, requestedPage);
  return { me, groups, lessons: lessons.rows, total: lessons.total, page: lessons.page, pageCount: lessons.pageCount, error: lessons.error };
}

export async function teacherLesson(locale: Locale, id: string) {
  const me = await teacherViewer(locale);
  const { data: lesson, error } = await me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,notes,group:groups(name)').eq('id', id).maybeSingle();
  if (error || !lesson) return null;
  const { data: materials, error: materialError } = await me.db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: false });
  return { me, lesson, materials: materials ?? [], error: materialError };
}
