import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));

import { teacherTimetable } from '@/features/teacher/timetable-data';
import { cairoDayBounds } from '@/features/student/timetable-domain';

describe('teacher timetable loader query contract', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

  it('scopes overlap queries to owned groups, counts before clamping, and retries the final page', async () => {
    const queries: Array<{ table: string; filters: Array<[string, string, unknown]>; range?: [number, number] }> = [];
    const db = {
      from(table: string) {
        const query = { table, filters: [] as Array<[string, string, unknown]>, range: undefined as [number, number] | undefined };
        queries.push(query);
        const builder: any = {
          select: () => builder,
          eq(column: string, value: unknown) { query.filters.push(['eq', column, value]); return builder; },
          neq(column: string, value: unknown) { query.filters.push(['neq', column, value]); return builder; },
          gt(column: string, value: unknown) { query.filters.push(['gt', column, value]); return builder; },
          lt(column: string, value: unknown) { query.filters.push(['lt', column, value]); return builder; },
          order: () => builder,
          range(from: number, to: number) { query.range = [from, to]; return builder; },
          maybeSingle: async () => ({ data: { headline: '', bio: '', approved: true }, error: null }),
          then(resolve: (value: unknown) => unknown) {
            if (table === 'groups') return Promise.resolve(resolve({ data: [{ id: '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0', name: 'Owned group' }], error: null }));
            const data = query.range?.[0] === 20 ? [{ id: 'last', group_id: '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0', title: 'Final page', starts_at: '2026-10-13T10:00:00Z', ends_at: '2026-10-13T11:00:00Z', status: 'scheduled', group: { id: 'g', name: 'Owned group' } }] : [];
            return Promise.resolve(resolve({ data, count: 21, error: null }));
          },
        };
        return builder;
      },
    };
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'teacher-id' }, profile: { id: 'teacher-id', role: 'teacher', status: 'active' } });

    const groupId = '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0';
    const day = '2026-10-13';
    const bounds = cairoDayBounds(day);
    const result = await teacherTimetable('en', day, day, groupId, 9, new Date('2026-10-13T12:00:00Z'));

    const lessonQueries = queries.filter(query => query.table === 'lessons');
    expect(result).toMatchObject({ total: 21, page: 2, pageCount: 2, day, lessons: [{ id: 'last' }], error: null });
    expect(lessonQueries).toHaveLength(2);
    for (const query of lessonQueries) {
      expect(query.filters).toContainEqual(['eq', 'group.teacher_id', 'teacher-id']);
      expect(query.filters).toContainEqual(['eq', 'group_id', groupId]);
      expect(query.filters).toContainEqual(['lt', 'starts_at', bounds.end.toISOString()]);
      expect(query.filters).toContainEqual(['gt', 'ends_at', bounds.start.toISOString()]);
    }
    expect(lessonQueries.map(query => query.range)).toEqual([[160, 179], [20, 39]]);
    expect(queries.find(query => query.table === 'groups')?.filters).toContainEqual(['eq', 'teacher_id', 'teacher-id']);
  });
});
