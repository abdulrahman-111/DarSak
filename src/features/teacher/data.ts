import 'server-only';
import { redirect } from 'next/navigation';
import { getRequestViewer } from '@/features/platform/request-viewer';
import type { Locale } from '@/features/student/domain';
import { buildTeacherSetupTasks, cairoDayBounds, teacherDashboardError } from './dashboard-domain';
import {
  clampTeacherPage,
  normalizeTeacherPage,
  TEACHER_PAGE_SIZE,
  teacherPageCount,
  teacherPageOffset,
} from './enrollment-pagination';
import { normalizeRosterFilters } from './roster-filters';
import { measuredServerRead } from '@/lib/server-read-diagnostics';
import { roleHome } from '@/components/platform/access';
import {
  normalizeWaitlistPage,
  parseTeacherWaitlistPage,
  waitlistPageOffset,
  type TeacherWaitlistEntry,
} from '@/features/student/waitlist-domain';

export async function teacherIdentity(locale: Locale) {
  const { db, user, profile } = await getRequestViewer();
  if (!user) redirect(`/${locale}/login`);
  if (!profile || profile.status !== 'active') redirect(`/${locale}/login`);
  if (profile.role !== 'student' && profile.role !== 'teacher' && profile.role !== 'admin')
    redirect(`/${locale}/login`);
  if (profile.role !== 'teacher') redirect(roleHome(locale, profile.role));
  return { db, id: user.id, profile };
}

export async function teacherViewer(locale: Locale) {
  const identity = await teacherIdentity(locale);
  const { db, id } = identity;
  const { data: teacher, error: teacherError } = await db
    .from('teacher_profiles')
    .select('headline,bio,approved,avatar_path,cover_path')
    .eq('id', id)
    .maybeSingle();
  return { ...identity, teacher, teacherError };
}

type OwnedGroup = {
  id: string;
  name: string;
  capacity: number;
  status: string;
  location: string;
  description: string;
  offering: unknown;
};
type TeacherDashboardLesson = {
  id: string;
  group_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  group: unknown;
};
type GroupStudentRow = {
  enrollment_id: string;
  student_id: string;
  full_name: string;
  status: string;
  group_id: string;
  group_name: string;
};
type TeacherEnrollmentPage = { rows: GroupStudentRow[]; total: number };
type TeacherGroupChoice = { id: string; name: string; status: string };

async function teacherFilteredEnrollmentPage(
  me: Awaited<ReturnType<typeof teacherIdentity>>,
  status: 'pending' | 'accepted',
  requestedPage: unknown,
  query: unknown,
  groupId: unknown,
) {
  const filters = normalizeRosterFilters(query, groupId);
  const requested = normalizeWaitlistPage(requestedPage);
  const [pageResult, groupsResult] = await Promise.all([
    me.db.rpc('teacher_enrollment_search', {
      p_status: status,
      p_query: filters.query,
      p_group_id: filters.groupId,
      p_offset: teacherPageOffset(requested),
      p_limit: TEACHER_PAGE_SIZE,
    }),
    me.db.rpc('teacher_group_choices', { p_query: filters.query, p_selected: filters.groupId }),
  ]);
  if (pageResult.error || groupsResult.error)
    return {
      rows: [] as GroupStudentRow[],
      total: 0,
      page: 1,
      pageCount: 1,
      query: filters.query,
      groupId: filters.groupId,
      groups: [] as TeacherGroupChoice[],
      error: pageResult.error ?? groupsResult.error,
    };
  const payload = pageResult.data as TeacherEnrollmentPage | null;
  const groups = groupsResult.data as TeacherGroupChoice[] | null;
  if (
    !payload ||
    !Array.isArray(payload.rows) ||
    !Number.isSafeInteger(payload.total) ||
    payload.total < 0 ||
    !Array.isArray(groups)
  ) {
    return {
      rows: [] as GroupStudentRow[],
      total: 0,
      page: 1,
      pageCount: 1,
      query: filters.query,
      groupId: filters.groupId,
      groups: [] as TeacherGroupChoice[],
      error: { message: 'Invalid filtered enrollment response.' },
    };
  }
  let page = clampTeacherPage(requested, payload.total);
  let result = payload;
  if (page !== requested) {
    const retry = await me.db.rpc('teacher_enrollment_search', {
      p_status: status,
      p_query: filters.query,
      p_group_id: filters.groupId,
      p_offset: teacherPageOffset(page),
      p_limit: TEACHER_PAGE_SIZE,
    });
    const next = retry.data as TeacherEnrollmentPage | null;
    if (
      retry.error ||
      !next ||
      !Array.isArray(next.rows) ||
      !Number.isSafeInteger(next.total) ||
      next.total < 0
    )
      return {
        rows: [] as GroupStudentRow[],
        total: 0,
        page,
        pageCount: teacherPageCount(payload.total),
        query: filters.query,
        groupId: filters.groupId,
        groups,
        error: retry.error ?? { message: 'Invalid filtered enrollment response.' },
      };
    result = next;
    page = clampTeacherPage(page, next.total);
  }
  return {
    ...result,
    page,
    pageCount: teacherPageCount(result.total),
    query: filters.query,
    groupId: filters.groupId,
    groups,
    error: null,
  };
}

async function teacherEnrollmentPage(
  me: Pick<Awaited<ReturnType<typeof teacherIdentity>>, 'db'>,
  status: 'pending' | 'accepted',
  requestedPage: unknown,
): Promise<{
  rows: GroupStudentRow[];
  total: number;
  page: number;
  pageCount: number;
  error: { message: string } | null;
}> {
  const requested = normalizeTeacherPage(requestedPage);
  const result = await me.db.rpc('teacher_enrollment_page', {
    p_status: status,
    p_offset: teacherPageOffset(requested),
    p_limit: TEACHER_PAGE_SIZE,
  });
  if (result.error) return { rows: [], total: 0, page: 1, pageCount: 1, error: result.error };
  const payload = result.data as TeacherEnrollmentPage | null;
  if (
    !payload ||
    !Array.isArray(payload.rows) ||
    !Number.isSafeInteger(payload.total) ||
    payload.total < 0
  ) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageCount: 1,
      error: { message: 'Invalid enrollment page response.' },
    };
  }
  const pageCount = teacherPageCount(payload.total);
  const page = clampTeacherPage(requested, payload.total);
  if (page === requested) return { ...payload, page, pageCount, error: null };
  const lastPage = await me.db.rpc('teacher_enrollment_page', {
    p_status: status,
    p_offset: teacherPageOffset(page),
    p_limit: TEACHER_PAGE_SIZE,
  });
  if (lastPage.error) return { rows: [], total: 0, page, pageCount, error: lastPage.error };
  const lastPayload = lastPage.data as TeacherEnrollmentPage | null;
  if (
    !lastPayload ||
    !Array.isArray(lastPayload.rows) ||
    !Number.isSafeInteger(lastPayload.total) ||
    lastPayload.total < 0
  ) {
    return {
      rows: [],
      total: 0,
      page,
      pageCount,
      error: { message: 'Invalid enrollment page response.' },
    };
  }
  const latestPage = clampTeacherPage(page, lastPayload.total);
  if (latestPage !== page) {
    const retry = await me.db.rpc('teacher_enrollment_page', {
      p_status: status,
      p_offset: teacherPageOffset(latestPage),
      p_limit: TEACHER_PAGE_SIZE,
    });
    if (retry.error)
      return {
        rows: [],
        total: 0,
        page: latestPage,
        pageCount: teacherPageCount(lastPayload.total),
        error: retry.error,
      };
    const retryPayload = retry.data as TeacherEnrollmentPage | null;
    if (
      !retryPayload ||
      !Array.isArray(retryPayload.rows) ||
      !Number.isSafeInteger(retryPayload.total) ||
      retryPayload.total < 0
    ) {
      return {
        rows: [],
        total: 0,
        page: latestPage,
        pageCount: teacherPageCount(lastPayload.total),
        error: { message: 'Invalid enrollment page response.' },
      };
    }
    return {
      ...retryPayload,
      page: latestPage,
      pageCount: teacherPageCount(retryPayload.total),
      error: null,
    };
  }
  return { ...lastPayload, page, pageCount: teacherPageCount(lastPayload.total), error: null };
}

async function calendarLessonRows(
  me: Awaited<ReturnType<typeof teacherIdentity>>,
  requestedPage: unknown,
) {
  type LessonRow = {
    id: string;
    group_id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    status: string;
    notes: string;
    group: unknown;
  };
  const selected =
    'id,group_id,title,starts_at,ends_at,status,notes,group:groups!inner(name,teacher_id)';
  const targetPage = normalizeTeacherPage(requestedPage);
  const buildQuery = (page: number, withCount: boolean) => {
    let query = me.db
      .from('lessons')
      .select(selected, withCount ? { count: 'exact' } : {})
      .eq('group.teacher_id', me.id)
      .order('starts_at', { ascending: false })
      .order('id', { ascending: false })
      .range(teacherPageOffset(page), teacherPageOffset(page) + TEACHER_PAGE_SIZE - 1);
    return query;
  };
  const initial = await buildQuery(targetPage, true);
  if (initial.error?.code === 'PGRST103') {
    const count = await me.db
      .from('lessons')
      .select('id,group:groups!inner(teacher_id)', { count: 'exact', head: true })
      .eq('group.teacher_id', me.id);
    if (count.error)
      return { rows: [] as LessonRow[], total: 0, page: 1, pageCount: 1, error: count.error };
    if (count.count == null)
      return {
        rows: [] as LessonRow[],
        total: 0,
        page: 1,
        pageCount: 1,
        error: { message: 'Exact lesson count unavailable.' },
      };
    const total = count.count;
    const page = clampTeacherPage(targetPage, total);
    const retry = await buildQuery(page, false);
    if (retry.error)
      return {
        rows: [] as LessonRow[],
        total,
        page,
        pageCount: teacherPageCount(total),
        error: retry.error,
      };
    return {
      rows: (retry.data ?? []) as LessonRow[],
      total,
      page,
      pageCount: teacherPageCount(total),
      error: null,
    };
  }
  if (initial.error) {
    const total = initial.count ?? 0;
    const page = total > 0 ? clampTeacherPage(targetPage, total) : 1;
    return {
      rows: [] as LessonRow[],
      total,
      page,
      pageCount: teacherPageCount(total),
      error: initial.error,
    };
  }
  if (initial.count == null)
    return {
      rows: [] as LessonRow[],
      total: 0,
      page: 1,
      pageCount: 1,
      error: { message: 'Exact lesson count unavailable.' },
    };

  const total = initial.count;
  const page = clampTeacherPage(targetPage, total);
  const result = page === targetPage ? initial : await buildQuery(page, false);
  if (result.error)
    return {
      rows: [] as LessonRow[],
      total,
      page,
      pageCount: teacherPageCount(total),
      error: result.error,
    };
  return {
    rows: (result.data ?? []) as LessonRow[],
    total,
    page,
    pageCount: teacherPageCount(total),
    error: null,
  };
}

function emptyTeacherOverview(me: Awaited<ReturnType<typeof teacherViewer>>, locale: Locale) {
  return {
    me,
    groups: [] as OwnedGroup[],
    nextLesson: null as TeacherDashboardLesson | null,
    todayLessons: [] as Array<{
      id: string;
      group_id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      status: string;
      group: unknown;
    }>,
    upcomingLessons: [] as Array<{
      id: string;
      group_id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      status: string;
      group: unknown;
    }>,
    pendingRequests: [] as GroupStudentRow[],
    counts: { groups: 0, todayLessons: 0, upcomingLessons: 0, pendingRequests: 0 },
    setupTasks: [] as ReturnType<typeof buildTeacherSetupTasks>,
    error: teacherDashboardError(locale),
  };
}

export async function teacherOverview(locale: Locale, now = new Date()) {
  const identity = await teacherIdentity(locale);
  return measuredServerRead(
    'teacher_overview',
    locale,
    async () => {
      const bounds = cairoDayBounds(now);
      const [teacherResult, summaryResult, students, nextLessonResult] = await Promise.all([
        identity.db
          .from('teacher_profiles')
          .select('headline,bio,approved,avatar_path,cover_path')
          .eq('id', identity.id)
          .maybeSingle(),
        identity.db.rpc('teacher_dashboard_summary', {
          p_day_start: bounds.start.toISOString(),
          p_day_end: bounds.end.toISOString(),
          p_now: now.toISOString(),
        }),
        teacherEnrollmentPage(identity, 'pending', 1),
        identity.db
          .from('lessons')
          .select(
            'id,group_id,title,starts_at,ends_at,status,group:groups!inner(id,name,teacher_id)',
          )
          .eq('group.teacher_id', identity.id)
          .eq('status', 'scheduled')
          .gt('ends_at', now.toISOString())
          .order('starts_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(1),
      ]);
      const me = { ...identity, teacher: teacherResult.data, teacherError: teacherResult.error };
      if (
        summaryResult.error ||
        students.error ||
        nextLessonResult.error ||
        me.teacherError ||
        !me.teacher
      ) {
        return emptyTeacherOverview(me, locale);
      }
      const summary = summaryResult.data as {
        groups: OwnedGroup[];
        group_count: number;
        today: Array<{
          id: string;
          group_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          status: string;
          group: unknown;
        }>;
        today_count: number;
        upcoming: Array<{
          id: string;
          group_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          status: string;
          group: unknown;
        }>;
        upcoming_count: number;
        has_specializations: boolean;
        draft_candidate: { id: string; name: string; status: string } | null;
        missing_schedule_candidate: { id: string; name: string; status: string } | null;
      } | null;
      if (
        !summary ||
        !Array.isArray(summary.groups) ||
        !Array.isArray(summary.today) ||
        !Array.isArray(summary.upcoming) ||
        !Number.isSafeInteger(summary.group_count) ||
        !Number.isSafeInteger(summary.today_count) ||
        !Number.isSafeInteger(summary.upcoming_count)
      ) {
        return emptyTeacherOverview(me, locale);
      }
      const groups = summary.groups;
      const todayLessons = summary.today;
      const upcomingLessons = summary.upcoming;
      const pendingRequests = students.rows;
      const setupTasks = buildTeacherSetupTasks({
        teacher: me.teacher,
        specializationCount: summary.has_specializations ? 1 : 0,
        groups,
        groupIdsWithSlots: new Set(),
        upcomingLessonCount: summary.upcoming_count,
        draftCandidate: summary.draft_candidate,
        missingScheduleCandidate: summary.missing_schedule_candidate,
      });
      return {
        me,
        groups,
        nextLesson: (nextLessonResult.data?.[0] ?? null) as TeacherDashboardLesson | null,
        todayLessons,
        upcomingLessons,
        pendingRequests,
        counts: {
          groups: summary.group_count,
          todayLessons: summary.today_count,
          upcomingLessons: summary.upcoming_count,
          pendingRequests: students.total,
        },
        setupTasks,
        error: null,
      };
    },
    result => result.error !== null,
  );
}

export async function teacherRequests(
  locale: Locale,
  requestedPage: unknown = 1,
  query: unknown = '',
  groupId: unknown = '',
) {
  const me = await teacherIdentity(locale);
  const page = await teacherFilteredEnrollmentPage(me, 'pending', requestedPage, query, groupId);
  return { me, requests: page.rows, ...page };
}

export async function teacherWaitlist(
  locale: Locale,
  requestedPage: unknown = 1,
  query: unknown = '',
  groupId: unknown = '',
) {
  const me = await teacherIdentity(locale);
  const filters = normalizeRosterFilters(query, groupId);
  const requested = normalizeTeacherPage(requestedPage);
  const [groupsResult, pageResult] = await Promise.all([
    me.db.rpc('teacher_group_choices', {
      p_query: filters.query,
      p_selected: filters.groupId,
    }),
    me.db.rpc('teacher_waitlist_page', {
      p_query: filters.query,
      p_group_id: filters.groupId,
      p_offset: waitlistPageOffset(requested),
      p_limit: TEACHER_PAGE_SIZE,
    }),
  ]);
  const groups = groupsResult.data as TeacherGroupChoice[] | null;
  const parsed = pageResult.error ? null : parseTeacherWaitlistPage(pageResult.data);
  if (groupsResult.error || !Array.isArray(groups) || !parsed) {
    return {
      me,
      rows: [] as TeacherWaitlistEntry[],
      total: 0,
      page: 1,
      pageCount: 1,
      query: filters.query,
      groupId: filters.groupId,
      groups: Array.isArray(groups) ? groups : [],
      error: groupsResult.error ??
        pageResult.error ?? { message: 'Invalid waitlist page response.' },
    };
  }
  const pageCount = Math.min(teacherPageCount(parsed.total), 50_001);
  const page = clampTeacherPage(requested, parsed.total);
  if (page === requested) {
    return {
      me,
      ...parsed,
      page,
      pageCount,
      query: filters.query,
      groupId: filters.groupId,
      groups,
      error: null,
    };
  }
  const retry = await me.db.rpc('teacher_waitlist_page', {
    p_query: filters.query,
    p_group_id: filters.groupId,
    p_offset: waitlistPageOffset(page),
    p_limit: TEACHER_PAGE_SIZE,
  });
  const latest = retry.error ? null : parseTeacherWaitlistPage(retry.data);
  if (!latest)
    return {
      me,
      rows: [] as TeacherWaitlistEntry[],
      total: parsed.total,
      page,
      pageCount,
      query: filters.query,
      groupId: filters.groupId,
      groups,
      error: retry.error ?? { message: 'Invalid waitlist page response.' },
    };
  const latestPage = clampTeacherPage(page, latest.total);
  if (latestPage !== page) {
    const finalResult = await me.db.rpc('teacher_waitlist_page', {
      p_query: filters.query,
      p_group_id: filters.groupId,
      p_offset: waitlistPageOffset(latestPage),
      p_limit: TEACHER_PAGE_SIZE,
    });
    const finalPayload = finalResult.error ? null : parseTeacherWaitlistPage(finalResult.data);
    if (!finalPayload)
      return {
        me,
        rows: [] as TeacherWaitlistEntry[],
        total: latest.total,
        page: latestPage,
        pageCount: Math.min(teacherPageCount(latest.total), 50_001),
        query: filters.query,
        groupId: filters.groupId,
        groups,
        error: finalResult.error ?? { message: 'Invalid waitlist page response.' },
      };
    return {
      me,
      ...finalPayload,
      page: latestPage,
      pageCount: Math.min(teacherPageCount(finalPayload.total), 50_001),
      query: filters.query,
      groupId: filters.groupId,
      groups,
      error: null,
    };
  }
  return {
    me,
    ...latest,
    page,
    pageCount: Math.min(teacherPageCount(latest.total), 50_001),
    query: filters.query,
    groupId: filters.groupId,
    groups,
    error: null,
  };
}

export async function teacherStudents(
  locale: Locale,
  requestedPage: unknown = 1,
  query: unknown = '',
  groupId: unknown = '',
) {
  const me = await teacherIdentity(locale);
  const page = await teacherFilteredEnrollmentPage(me, 'accepted', requestedPage, query, groupId);
  return { me, students: page.rows, ...page };
}

export async function teacherLessons(locale: Locale, requestedPage: unknown = 1) {
  const me = await teacherIdentity(locale);
  const lessons = await calendarLessonRows(me, requestedPage);
  return {
    me,
    groups: [] as Array<{ id: string; name: string }>,
    lessons: lessons.rows,
    total: lessons.total,
    page: lessons.page,
    pageCount: lessons.pageCount,
    error: lessons.error,
  };
}

export async function teacherLesson(locale: Locale, id: string) {
  const me = await teacherViewer(locale);
  const { data: lesson, error } = await me.db
    .from('lessons')
    .select('id,group_id,title,starts_at,ends_at,status,notes,group:groups(name)')
    .eq('id', id)
    .maybeSingle();
  if (error || !lesson) return null;
  const { data: materials, error: materialError } = await me.db
    .from('lesson_materials')
    .select('*')
    .eq('lesson_id', id)
    .order('created_at', { ascending: false });
  return { me, lesson, materials: materials ?? [], error: materialError };
}
