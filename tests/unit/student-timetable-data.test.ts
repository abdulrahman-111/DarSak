import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/platform/data', () => ({ catalogue: vi.fn(), publicGroupDetail: vi.fn(), publicGroups: vi.fn(), publicTeachers: vi.fn() }));

import { studentTimetableDay } from '@/features/student/timetable-data';
import { cairoDayBounds } from '@/features/student/timetable-domain';

describe('student timetable day loader query contract', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

  it('filters overlapping selected-day lessons before counting and paginating, and scopes recurring patterns to the selected active class', async () => {
    const queries: Array<{ table: string; filters: Array<[string, string, unknown]>; range?: [number, number]; limit?: number }> = [];
    const db = {
      from(table: string) {
        const query = { table, filters: [] as Array<[string, string, unknown]>, range: undefined as [number, number] | undefined, limit: undefined as number | undefined };
        queries.push(query);
        const builder: any = {
          select: () => builder,
          eq(column: string, value: unknown) { query.filters.push(['eq', column, value]); return builder; },
          neq(column: string, value: unknown) { query.filters.push(['neq', column, value]); return builder; },
          gt(column: string, value: unknown) { query.filters.push(['gt', column, value]); return builder; },
          lt(column: string, value: unknown) { query.filters.push(['lt', column, value]); return builder; },
          order: () => builder,
          range(from: number, to: number) { query.range = [from, to]; return builder; },
          limit(value: number) { query.limit = value; return builder; },
          then(resolve: (value: unknown) => unknown) {
            if (table === 'lessons') return Promise.resolve(resolve({ data: [{ id: 'day-51', starts_at: '2026-10-12T22:00:00Z' }], count: 51, error: null }));
            if (table === 'group_schedule_slots') return Promise.resolve(resolve({ data: [], error: null }));
            return Promise.resolve(resolve({ data: [], error: null }));
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'student-id' }, profile: { id: 'student-id', role: 'student', status: 'active' } });

    const bounds = cairoDayBounds('2026-10-13');
    const groupId = '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0';
    const result = await studentTimetableDay('en', bounds.start, bounds.end, groupId, 2);

    const lessons = queries.find(query => query.table === 'lessons');
    const slots = queries.find(query => query.table === 'group_schedule_slots');
    expect(result).toMatchObject({ total: 51, lessons: [{ id: 'day-51' }], error: false });
    expect(lessons?.filters).toContainEqual(['gt', 'ends_at', bounds.start.toISOString()]);
    expect(lessons?.filters).toContainEqual(['lt', 'starts_at', bounds.end.toISOString()]);
    expect(lessons?.filters).toContainEqual(['eq', 'group_id', groupId]);
    expect(lessons?.range).toEqual([50, 99]);
    expect(slots?.filters).toContainEqual(['eq', 'group_id', groupId]);
    expect(slots?.filters).toContainEqual(['neq', 'group.status', 'archived']);
  });

  it('recovers an out-of-range lesson page and returns the clamped page with the same student filters', async () => {
    const lessonCalls: Array<{ filters: Array<[string, string, unknown]>; range: [number, number] | undefined }> = [];
    const db = {
      from(table: string) {
        const query = { table, filters: [] as Array<[string, string, unknown]>, range: undefined as [number, number] | undefined };
        if (table === 'lessons') lessonCalls.push(query);
        const builder: any = {
          select: () => builder,
          eq(column: string, value: unknown) { query.filters.push(['eq', column, value]); return builder; },
          neq(column: string, value: unknown) { query.filters.push(['neq', column, value]); return builder; },
          gt(column: string, value: unknown) { query.filters.push(['gt', column, value]); return builder; },
          lt(column: string, value: unknown) { query.filters.push(['lt', column, value]); return builder; },
          order: () => builder,
          range(from: number, to: number) { query.range = [from, to]; return builder; },
          limit: () => builder,
          then(resolve: (value: unknown) => unknown) {
            if (table === 'lessons') {
              const page = lessonCalls.length;
              if (page === 1) return Promise.resolve(resolve({ data: null, count: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' } }));
              return Promise.resolve(resolve({ data: [{ id: page === 2 ? 'first' : 'last' }], count: 120, error: null }));
            }
            return Promise.resolve(resolve({ data: [], error: null }));
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'student-id' }, profile: { id: 'student-id', role: 'student', status: 'active' } });

    const bounds = cairoDayBounds('2026-10-13');
    const result = await studentTimetableDay('en', bounds.start, bounds.end, null, 99);

    expect(result).toMatchObject({ page: 3, total: 120, lessons: [{ id: 'last' }], error: false });
    expect(lessonCalls.map(query => query.range)).toEqual([[4900, 4949], [0, 49], [100, 149]]);
    expect(lessonCalls[1].filters).toEqual(lessonCalls[0].filters);
    expect(lessonCalls[2].filters).toEqual(lessonCalls[0].filters);
  });
});
