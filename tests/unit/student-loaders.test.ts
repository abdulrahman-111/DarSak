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

  it('summarizes every occupied day of the current week beyond the five lesson preview', async () => {
    const now = new Date('2026-10-13T10:00:00.000Z');
    let failDaySummary = false;
    const allLessons = [
      {
        id: 'completed-monday',
        starts_at: '2026-10-12T07:00:00.000Z',
        ends_at: '2026-10-12T08:00:00.000Z',
        status: 'completed',
        student_id: 'student-id',
      },
      ...['13', '13', '14', '15', '16', '17', '17', '17'].map((day, index) => ({
        id: `future-${index}`,
        starts_at: `2026-10-${day}T12:00:00.000Z`,
        ends_at: `2026-10-${day}T13:00:00.000Z`,
        status: 'scheduled',
        student_id: 'student-id',
      })),
      {
        id: 'cancelled',
        starts_at: '2026-10-18T12:00:00.000Z',
        ends_at: '2026-10-18T13:00:00.000Z',
        status: 'cancelled',
        student_id: 'student-id',
      },
      {
        id: 'other-student',
        starts_at: '2026-10-18T14:00:00.000Z',
        ends_at: '2026-10-18T15:00:00.000Z',
        status: 'scheduled',
        student_id: 'someone-else',
      },
    ];
    const queries: Array<{
      table: string;
      fields: string;
      filters: Array<[string, string, unknown]>;
      limit?: number;
    }> = [];
    const db = {
      from(table: string) {
        const query = {
          table,
          fields: '',
          filters: [] as Array<[string, string, unknown]>,
          limit: undefined as number | undefined,
        };
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
          neq(column: string, value: unknown) {
            query.filters.push(['neq', column, value]);
            return builder;
          },
          gt(column: string, value: unknown) {
            query.filters.push(['gt', column, value]);
            return builder;
          },
          gte(column: string, value: unknown) {
            query.filters.push(['gte', column, value]);
            return builder;
          },
          lt(column: string, value: unknown) {
            query.filters.push(['lt', column, value]);
            return builder;
          },
          order() {
            return builder;
          },
          limit(value: number) {
            query.limit = value;
            return builder;
          },
          maybeSingle: async () => ({
            data: {
              age_range: null,
              education_year: '',
              interests: [],
              learning_goal: '',
              school_name: '',
              onboarding_required: false,
              onboarding_completed_at: null,
              updated_at: '2026-10-01T00:00:00.000Z',
            },
            error: null,
          }),
          then(resolve: (value: unknown) => unknown) {
            if (table === 'lessons') {
              if (
                failDaySummary &&
                query.filters.some(([kind, column]) => kind === 'gte' && column === 'starts_at')
              ) {
                return Promise.resolve(resolve({ data: null, error: new Error('query failed') }));
              }
              let rows = allLessons.filter(row =>
                query.filters.every(([kind, column, value]) => {
                  const actual =
                    column === 'group.enrollments.student_id'
                      ? row.student_id
                      : column === 'group.enrollments.status'
                        ? 'accepted'
                        : row[column as keyof typeof row];
                  if (kind === 'eq') return actual === value;
                  if (kind === 'neq') return actual !== value;
                  const actualTime = new Date(String(actual)).getTime();
                  const compareTime = new Date(String(value)).getTime();
                  if (kind === 'gt') return actualTime > compareTime;
                  if (kind === 'gte') return actualTime >= compareTime;
                  if (kind === 'lt') return actualTime < compareTime;
                  return false;
                }),
              );
              if (query.limit !== undefined) rows = rows.slice(0, query.limit);
              return Promise.resolve(resolve({ data: rows, error: null }));
            }
            if (table === 'enrollments')
              return Promise.resolve(resolve({ data: null, count: 1, error: null }));
            return Promise.resolve(resolve({ data: [], error: null }));
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'student-id' },
      profile: { id: 'student-id', full_name: 'Test Student', role: 'student', status: 'active' },
    });

    const result = await studentDashboard('en', now);

    expect(result.lessons.map(lesson => lesson.id)).toEqual([
      'future-0',
      'future-1',
      'future-2',
      'future-3',
      'future-4',
    ]);
    expect(result.occupiedDays).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
    const dayQueries = queries.filter(
      query =>
        query.table === 'lessons' &&
        query.fields.includes('enrollments!inner') &&
        query.filters.some(([kind, column]) => kind === 'gte' && column === 'starts_at'),
    );
    expect(dayQueries).toHaveLength(7);
    expect(dayQueries.every(query => query.limit === 1)).toBe(true);
    expect(
      dayQueries.every(query =>
        query.filters.some(([kind, column]) => kind === 'neq' && column === 'status'),
      ),
    ).toBe(true);
    expect(
      dayQueries.every(query =>
        query.filters.some(
          ([kind, column]) => kind === 'eq' && column === 'group.enrollments.student_id',
        ),
      ),
    ).toBe(true);
    expect(
      dayQueries.every(query =>
        query.filters.some(
          ([kind, column]) => kind === 'eq' && column === 'group.enrollments.status',
        ),
      ),
    ).toBe(true);
    expect(dayQueries.every(query => query.fields.includes('student_id,status'))).toBe(true);

    failDaySummary = true;
    const failedSummary = await studentDashboard('en', now);
    expect(failedSummary.occupiedDays).toEqual([]);
    expect(failedSummary.calendarError).toBe(true);
  });

  it('filters past lesson history before its five-row preview while retaining exact enrollment counts', async () => {
    const now = new Date('2026-10-12T10:00:00.000Z');
    const allLessons = [
      ...Array.from({ length: 500 }, (_, index) => ({
        id: `past-${String(index).padStart(3, '0')}`,
        group_id: 'group',
        title: 'Past lesson',
        starts_at: `2025-01-${String((index % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
        ends_at: '2025-01-01T09:00:00.000Z',
        status: 'scheduled',
        group: { name: 'Algebra group' },
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `future-${index}`,
        group_id: 'group',
        title: 'Upcoming lesson',
        starts_at: `2026-10-1${2 + index}T12:00:00.000Z`,
        ends_at: `2026-10-1${2 + index}T13:00:00.000Z`,
        status: 'scheduled',
        group: { name: 'Algebra group' },
      })),
    ];
    const queries: Array<{
      table: string;
      filters: Array<[string, string, unknown]>;
      limit?: number;
      selectOptions?: unknown;
      fields?: string;
    }> = [];
    const db = {
      from(table: string) {
        const query = {
          table,
          filters: [] as Array<[string, string, unknown]>,
          limit: undefined as number | undefined,
          selectOptions: undefined as unknown,
          fields: '',
        };
        queries.push(query);
        const builder = {
          select(fields: string, options?: unknown) {
            query.fields = fields;
            query.selectOptions = options;
            return builder;
          },
          eq(column: string, value: unknown) {
            query.filters.push(['eq', column, value]);
            return builder;
          },
          maybeSingle: async () => ({
            data: {
              age_range: null,
              education_year: '',
              interests: [],
              learning_goal: '',
              school_name: '',
              onboarding_required: false,
              onboarding_completed_at: null,
              updated_at: '2026-10-01T00:00:00.000Z',
            },
            error: null,
          }),
          gt(column: string, value: unknown) {
            query.filters.push(['gt', column, value]);
            return builder;
          },
          neq(column: string, value: unknown) {
            query.filters.push(['neq', column, value]);
            return builder;
          },
          gte(column: string, value: unknown) {
            query.filters.push(['gte', column, value]);
            return builder;
          },
          lt(column: string, value: unknown) {
            query.filters.push(['lt', column, value]);
            return builder;
          },
          order() {
            return builder;
          },
          limit(value: number) {
            query.limit = value;
            return builder;
          },
          range() {
            return builder;
          },
          then(resolve: (value: unknown) => unknown) {
            if (table === 'lessons') {
              let rows = allLessons.filter(row =>
                query.filters.every(([kind, column, value]) => {
                  const actual = row[column as keyof typeof row];
                  if (column.startsWith('group.enrollments.')) return true;
                  if (kind === 'eq') return actual === value;
                  if (kind === 'neq') return actual !== value;
                  const actualTime = new Date(String(actual)).getTime();
                  const compareTime = new Date(String(value)).getTime();
                  if (kind === 'gt') return actualTime > compareTime;
                  if (kind === 'gte') return actualTime >= compareTime;
                  if (kind === 'lt') return actualTime < compareTime;
                  return false;
                }),
              );
              if (query.limit !== undefined) rows = rows.slice(0, query.limit);
              return Promise.resolve(resolve({ data: rows, count: null, error: null }));
            }
            const status = query.filters.find(
              ([kind, column]) => kind === 'eq' && column === 'status',
            )?.[2];
            return Promise.resolve(
              resolve({ data: null, count: status === 'accepted' ? 14 : 3, error: null }),
            );
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'student-id' },
      profile: { id: 'student-id', full_name: 'Test Student', role: 'student', status: 'active' },
    });

    const result = await studentDashboard('en', now);

    expect(result.error).toBe(false);
    expect(result).not.toHaveProperty('upcomingCount');
    expect(result.learningProfile).toMatchObject({
      onboarding_required: false,
      onboarding_completed_at: null,
    });
    expect(result.acceptedCount).toBe(14);
    expect(result.pendingCount).toBe(3);
    expect(result.lessons.map(lesson => lesson.id)).toEqual([
      'future-0',
      'future-1',
      'future-2',
      'future-3',
      'future-4',
    ]);
    expect(
      Array.isArray(result.lessons[0].group)
        ? result.lessons[0].group[0]?.name
        : result.lessons[0].group?.name,
    ).toBe('Algebra group');
    expect(queries.find(query => query.table === 'lessons')).toMatchObject({
      filters: [
        ['eq', 'status', 'scheduled'],
        ['eq', 'group.enrollments.student_id', 'student-id'],
        ['eq', 'group.enrollments.status', 'accepted'],
        ['gt', 'ends_at', now.toISOString()],
      ],
      limit: 5,
      selectOptions: undefined,
    });
    expect(queries.find(query => query.table === 'lessons')?.fields).toContain(
      'groups!inner(id,name,enrollments!inner(id))',
    );
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
    const db = {
      from() {
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
      user: { id: 'new-student' },
      profile: { id: 'new-student', full_name: 'New Student', role: 'student', status: 'active' },
    });

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
