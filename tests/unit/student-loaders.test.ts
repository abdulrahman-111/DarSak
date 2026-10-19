import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/platform/data', () => ({ catalogue: vi.fn(), publicGroupDetail: vi.fn(), publicGroups: vi.fn(), publicTeachers: vi.fn(), teacherById: vi.fn() }));

import { studentClasses, studentDashboard, studentTimetable } from '@/features/student/data';

describe('student dashboard loader query contract', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

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
    const queries: Array<{ table: string; filters: Array<[string, string, unknown]>; limit?: number; selectOptions?: unknown; fields?: string }> = [];
    const db = {
      from(table: string) {
        const query = { table, filters: [] as Array<[string, string, unknown]>, limit: undefined as number | undefined, selectOptions: undefined as unknown, fields: '' };
        queries.push(query);
        const builder = {
          select(fields: string, options?: unknown) { query.fields = fields; query.selectOptions = options; return builder; },
          eq(column: string, value: unknown) { query.filters.push(['eq', column, value]); return builder; },
          maybeSingle: async () => ({ data: {
            age_range: null, education_year: '', interests: [], learning_goal: '', school_name: '',
            onboarding_required: false, onboarding_completed_at: null, updated_at: '2026-10-01T00:00:00.000Z',
          }, error: null }),
          gt(column: string, value: unknown) { query.filters.push(['gt', column, value]); return builder; },
          neq(column: string, value: unknown) { query.filters.push(['neq', column, value]); return builder; },
          order() { return builder; },
          limit(value: number) { query.limit = value; return builder; },
          range() { return builder; },
          then(resolve: (value: unknown) => unknown) {
            if (table === 'lessons') {
              let rows = allLessons.filter(row => query.filters.every(([kind, column, value]) => {
                const actual = row[column as keyof typeof row];
                if (column.startsWith('group.enrollments.')) return true;
                if (kind === 'eq') return actual === value;
                return new Date(String(actual)).getTime() > new Date(String(value)).getTime();
              }));
              if (query.limit !== undefined) rows = rows.slice(0, query.limit);
              return Promise.resolve(resolve({ data: rows, count: null, error: null }));
            }
            const status = query.filters.find(([kind, column]) => kind === 'eq' && column === 'status')?.[2];
            return Promise.resolve(resolve({ data: null, count: status === 'accepted' ? 14 : 3, error: null }));
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'student-id' }, profile: { id: 'student-id', full_name: 'Test Student', role: 'student', status: 'active' } });

    const result = await studentDashboard('en', now);

    expect(result.error).toBe(false);
    expect(result).not.toHaveProperty('upcomingCount');
    expect(result.learningProfile).toMatchObject({ onboarding_required: false, onboarding_completed_at: null });
    expect(result.acceptedCount).toBe(14);
    expect(result.pendingCount).toBe(3);
    expect(result.lessons.map(lesson => lesson.id)).toEqual(['future-0', 'future-1', 'future-2', 'future-3', 'future-4']);
    expect(Array.isArray(result.lessons[0].group) ? result.lessons[0].group[0]?.name : result.lessons[0].group?.name).toBe('Algebra group');
    expect(queries.find(query => query.table === 'lessons')).toMatchObject({
      filters: [['eq', 'status', 'scheduled'], ['eq', 'group.enrollments.student_id', 'student-id'], ['eq', 'group.enrollments.status', 'accepted'], ['gt', 'ends_at', now.toISOString()]],
      limit: 5,
      selectOptions: undefined,
    });
    expect(queries.find(query => query.table === 'lessons')?.fields).toContain('groups!inner(id,name,enrollments!inner(id))');
  });

  it('routes a new student with required setup to the profile page before loading dashboard data', async () => {
    const profile = {
      age_range: null, education_year: '', interests: [], learning_goal: '', school_name: '',
      onboarding_required: true, onboarding_completed_at: null, updated_at: '2026-10-01T00:00:00.000Z',
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
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'new-student' }, profile: { id: 'new-student', full_name: 'New Student', role: 'student', status: 'active' } });

    await expect(studentDashboard('en')).rejects.toThrow('redirect:/en/account/setup');
  });

  it('limits recurring timetable slots to this student’s accepted groups through the RLS-visible join', async () => {
    const queries: Array<{ table: string; filters: Array<[string, string, unknown]>; fields: string }> = [];
    const db = {
      from(table: string) {
        const query = { table, filters: [] as Array<[string, string, unknown]>, fields: '' };
        queries.push(query);
        const builder = {
          select(fields: string) { query.fields = fields; return builder; },
          eq(column: string, value: unknown) { query.filters.push(['eq', column, value]); return builder; },
          gt(column: string, value: unknown) { query.filters.push(['gt', column, value]); return builder; },
          neq(column: string, value: unknown) { query.filters.push(['neq', column, value]); return builder; },
          order() { return builder; },
          range() { return builder; },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [], count: 0, error: null })); },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'student-id' }, profile: { id: 'student-id', role: 'student', status: 'active' } });

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
    const db = { rpc: vi.fn(async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: args && (args as {p_offset:number}).p_offset === 0
        ? { rows: [{ id: 'e1', group_id: 'g1', status: 'pending', updated_at: '2026-01-01', group: { id: 'g1', name: 'Visible label', status: 'draft', location: null, can_view: false } }], total: 1 }
        : { rows: [], total: 1 }, error: null };
    }) };
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'student-id' }, profile: { id: 'student-id', role: 'student', status: 'active' } });

    const result = await studentClasses('en', 999);

    expect(calls).toEqual([
      { name: 'student_enrollment_page', args: { p_offset: 19960, p_limit: 20 } },
      { name: 'student_enrollment_page', args: { p_offset: 0, p_limit: 20 } },
    ]);
    expect(result).toMatchObject({ page: 1, pageCount: 1, total: 1, error: false, enrollments: [{ group: { name: 'Visible label', location: null } }] });
  });

  it('returns the page error contract when the RPC fails', async () => {
    const db = { rpc: vi.fn(async () => ({ data: null, error: new Error('failed') })) };
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'student-id' }, profile: { id: 'student-id', role: 'student', status: 'active' } });
    expect(await studentClasses('en', '2')).toMatchObject({ page: 2, pageCount: 1, total: 0, error: true, enrollments: [] });
  });
});
