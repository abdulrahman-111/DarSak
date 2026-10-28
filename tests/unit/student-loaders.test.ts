import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/platform/data', () => ({
  catalogue: vi.fn(),
  publicGroupDetail: vi.fn(),
  publicGroups: vi.fn(),
  publicTeachers: vi.fn(),
  teacherById: vi.fn(),
}));

import {
  studentClasses,
  studentDashboard,
  studentLessons,
  studentTimetable,
} from '@/features/student/data';

describe('student dashboard loader query contract', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

  const profileRow = {
    age_range: null,
    education_year: '',
    interests: [],
    learning_goal: '',
    school_name: '',
    onboarding_required: false,
    onboarding_completed_at: null,
    updated_at: '2026-10-01T00:00:00.000Z',
  };
  function dashboardDb(rpc: ReturnType<typeof vi.fn>, profile: unknown = profileRow) {
    const tables: string[] = [];
    const db = {
      rpc,
      from(table: string) {
        tables.push(table);
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: profile, error: null }),
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'student-id' },
      profile: { id: 'student-id', full_name: 'Test Student', role: 'student', status: 'active' },
    });
    return tables;
  }
  const summary = {
    accepted_count: 14,
    pending_count: 3,
    upcoming: [
      {
        id: 'future-0',
        group_id: 'group',
        title: 'Upcoming lesson',
        starts_at: '2026-10-13T12:00:00.000Z',
        ends_at: '2026-10-13T13:00:00.000Z',
        status: 'scheduled',
        group: { id: 'group', name: 'Algebra group' },
      },
    ],
    classes: [
      {
        id: 'enrollment',
        group_id: 'group',
        group: { id: 'group', name: 'Algebra group', status: 'published', location: null },
      },
    ],
    occupied_days: ['2026-10-13', '2026-10-17', '2026-10-25'],
  };

  it('loads the dashboard with one summary RPC using Cairo week bounds from TypeScript', async () => {
    const now = new Date('2026-10-13T10:00:00.000Z');
    const rpc = vi.fn(async () => ({ data: summary, error: null }));
    const tables = dashboardDb(rpc);

    const result = await studentDashboard('en', now);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('student_dashboard_summary', {
      // Saturday-start Cairo week: Sat 10 Oct 00:00 to Sat 17 Oct 00:00 (UTC+3).
      p_week_start: '2026-10-09T21:00:00.000Z',
      p_week_end: '2026-10-16T21:00:00.000Z',
      p_now: now.toISOString(),
    });
    // Learning profile reads only student_profiles and profiles; no per-day queries remain.
    expect(tables.every(table => table === 'student_profiles' || table === 'profiles')).toBe(true);
    expect(result.error).toBe(false);
    expect(result.calendarError).toBe(false);
    expect(result).not.toHaveProperty('upcomingCount');
    expect(result.learningProfile).toMatchObject({ onboarding_required: false });
    expect(result.acceptedCount).toBe(14);
    expect(result.pendingCount).toBe(3);
    expect(result.lessons.map(lesson => lesson.id)).toEqual(['future-0']);
    expect(result.classes).toEqual(summary.classes);
    // Days outside the displayed week are ignored; order follows the week.
    expect(result.occupiedDays).toEqual(['2026-10-13', '2026-10-17']);
  });

  it('reports an error with empty data when the summary RPC fails', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('rpc failed') }));
    dashboardDb(rpc);
    const result = await studentDashboard('en', new Date('2026-10-13T10:00:00.000Z'));
    expect(result).toMatchObject({
      error: true,
      calendarError: true,
      acceptedCount: 0,
      pendingCount: 0,
      lessons: [],
      occupiedDays: [],
      classes: [],
    });
    expect(result.learningProfile).not.toBeNull();
  });

  it('reports an error when the learning profile is unavailable', async () => {
    const rpc = vi.fn(async () => ({ data: summary, error: null }));
    dashboardDb(rpc, null);
    const result = await studentDashboard('en', new Date('2026-10-13T10:00:00.000Z'));
    expect(result).toMatchObject({ error: true, learningProfile: null, acceptedCount: 0 });
  });

  it('routes a new student with required setup to the profile page before loading dashboard data', async () => {
    const profile = {
      age_range: null,
      education_year: '',
      interests: [],
      learning_goal: '',
      school_name: '',
      onboarding_required: true,
      onboarding_completed_at: null,
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    dashboardDb(
      vi.fn(async () => ({ data: summary, error: null })),
      profile,
    );

    await expect(studentDashboard('en')).rejects.toThrow('redirect:/en/account/setup');
  });

  it('limits recurring timetable slots to this student’s accepted groups through the RLS-visible join', async () => {
    const queries: Array<{
      table: string;
      filters: Array<[string, string, unknown]>;
      fields: string;
    }> = [];
    const db = {
      from(table: string) {
        const query = { table, filters: [] as Array<[string, string, unknown]>, fields: '' };
        queries.push(query);
        const builder = {
          select(fields: string) {
            query.fields = fields;
            return builder;
          },
          eq(column: string, value: unknown) {
            query.filters.push(['eq', column, value]);
            return builder;
          },
          gt(column: string, value: unknown) {
            query.filters.push(['gt', column, value]);
            return builder;
          },
          neq(column: string, value: unknown) {
            query.filters.push(['neq', column, value]);
            return builder;
          },
          order() {
            return builder;
          },
          range() {
            return builder;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve({ data: [], count: 0, error: null }));
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'student-id' },
      profile: { id: 'student-id', role: 'student', status: 'active' },
    });

    const result = await studentTimetable('en', 1, new Date('2026-10-12T10:00:00.000Z'));
    const slots = queries.find(query => query.table === 'group_schedule_slots');
    const lessons = queries.find(query => query.table === 'lessons');

    expect(result.error).toBe(false);
    expect(slots?.fields).toContain('groups!inner');
    expect(slots?.fields).toContain('enrollments!inner(id)');
    expect(slots?.filters).toContainEqual(['eq', 'group.enrollments.student_id', 'student-id']);
    expect(slots?.filters).toContainEqual(['eq', 'group.enrollments.status', 'accepted']);
    expect(slots?.filters).toContainEqual(['neq', 'group.status', 'archived']);
    expect(lessons?.fields).toContain('groups!inner(id,enrollments!inner(id))');
    expect(lessons?.filters).toContainEqual(['eq', 'group.enrollments.student_id', 'student-id']);
    expect(lessons?.filters).toContainEqual(['eq', 'group.enrollments.status', 'accepted']);
  });
});

describe('student classes loader RPC contract', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

  it('uses bounded own-enrollment pages, keeps group labels, and clamps to the last page', async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const db = {
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ name, args });
        return {
          data:
            args && (args as { p_offset: number }).p_offset === 0
              ? {
                  rows: [
                    {
                      id: 'e1',
                      group_id: 'g1',
                      status: 'pending',
                      updated_at: '2026-01-01',
                      group: {
                        id: 'g1',
                        name: 'Visible label',
                        status: 'draft',
                        location: null,
                        can_view: false,
                      },
                    },
                  ],
                  total: 1,
                }
              : { rows: [], total: 1 },
          error: null,
        };
      }),
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'student-id' },
      profile: { id: 'student-id', role: 'student', status: 'active' },
    });

    const result = await studentClasses('en', 999);

    expect(calls).toEqual([
      { name: 'student_enrollment_page', args: { p_offset: 19960, p_limit: 20 } },
      { name: 'student_enrollment_page', args: { p_offset: 0, p_limit: 20 } },
    ]);
    expect(result).toMatchObject({
      page: 1,
      pageCount: 1,
      total: 1,
      error: false,
      enrollments: [{ group: { name: 'Visible label', location: null } }],
    });
  });

  it('returns the page error contract when the RPC fails', async () => {
    const db = { rpc: vi.fn(async () => ({ data: null, error: new Error('failed') })) };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'student-id' },
      profile: { id: 'student-id', role: 'student', status: 'active' },
    });
    expect(await studentClasses('en', '2')).toMatchObject({
      page: 2,
      pageCount: 1,
      total: 0,
      error: true,
      enrollments: [],
    });
  });
});

describe('student lesson pagination recovery', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

  function setupLessonPages(
    results: Array<{
      data: Array<{ id: string }> | null;
      count: number | null;
      error: unknown | null;
    }>,
  ) {
    const calls: Array<{
      filters: Array<[string, unknown]>;
      range: [number, number] | null;
      selectOptions: unknown;
    }> = [];
    const db = {
      from(table: string) {
        expect(table).toBe('lessons');
        const call = {
          filters: [] as Array<[string, unknown]>,
          range: null as [number, number] | null,
          selectOptions: undefined as unknown,
        };
        calls.push(call);
        const builder = {
          select(_fields: string, options?: unknown) {
            call.selectOptions = options;
            return builder;
          },
          eq(column: string, value: unknown) {
            call.filters.push([column, value]);
            return builder;
          },
          gt(column: string, value: unknown) {
            call.filters.push([column, value]);
            return builder;
          },
          order: () => builder,
          range(from: number, to: number) {
            call.range = [from, to];
            return builder;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve(results.shift()));
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'student-id' },
      profile: { id: 'student-id', role: 'student', status: 'active' },
    });
    return calls;
  }

  it('keeps valid pages to one exact-count query', async () => {
    const calls = setupLessonPages([{ data: [{ id: 'page-two' }], count: 45, error: null }]);

    const result = await studentLessons('en', 2);

    expect(result).toMatchObject({
      lessons: [{ id: 'page-two' }],
      page: 2,
      total: 45,
      pageCount: 3,
      error: false,
    });
    expect(calls.map(call => call.range)).toEqual([[20, 39]]);
  });

  it('recovers an out-of-range response, clamps to the last page, and repeats the own-enrollment filters', async () => {
    const calls = setupLessonPages([
      { data: null, count: null, error: { code: 'PGRST103' } },
      { data: [{ id: 'first' }], count: 45, error: null },
      { data: [{ id: 'last' }], count: 45, error: null },
    ]);

    const result = await studentLessons('en', 9999);

    expect(result).toMatchObject({
      lessons: [{ id: 'last' }],
      page: 3,
      total: 45,
      pageCount: 3,
      error: false,
    });
    expect(calls.map(call => call.range)).toEqual([
      [199960, 199979],
      [0, 19],
      [40, 59],
    ]);
    expect(calls.map(call => call.selectOptions)).toEqual([
      { count: 'exact' },
      { count: 'exact' },
      { count: 'exact' },
    ]);
    expect(calls[1].filters).toEqual(calls[0].filters);
    expect(calls[2].filters).toEqual(calls[0].filters);
    expect(calls[0].filters).toEqual([
      ['group.enrollments.student_id', 'student-id'],
      ['group.enrollments.status', 'accepted'],
    ]);
  });

  it('uses the recovered first page when the exact count is zero', async () => {
    const calls = setupLessonPages([
      { data: null, count: null, error: { code: 'PGRST103' } },
      { data: [], count: 0, error: null },
    ]);

    const result = await studentLessons('en', 9999);

    expect(result).toMatchObject({ lessons: [], page: 1, total: 0, pageCount: 1, error: false });
    expect(calls.map(call => call.range)).toEqual([
      [199960, 199979],
      [0, 19],
    ]);
  });

  it('keeps non-range errors visible without issuing a recovery query', async () => {
    const calls = setupLessonPages([{ data: null, count: null, error: { code: '42501' } }]);

    const result = await studentLessons('en', 9999);

    expect(result).toMatchObject({ lessons: [], page: 9999, total: 0, pageCount: 1, error: true });
    expect(calls.map(call => call.range)).toEqual([[199960, 199979]]);
  });
});
