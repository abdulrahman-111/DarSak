import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));

import { teacherLessons } from '@/features/teacher/data';

type Query = {
  table: string;
  selectOptions?: unknown;
  filters: Array<[string, string, unknown]>;
  range?: [number, number];
  orders: string[];
};

function setup(total = 21, rejectOutOfRange = false) {
  const queries: Query[] = [];
  const db = {
    from(table: string) {
      const query: Query = { table, filters: [], orders: [] };
      queries.push(query);
      const builder: any = {
        select: (_columns: string, options?: unknown) => {
          query.selectOptions = options;
          return builder;
        },
        eq(column: string, value: unknown) {
          query.filters.push(['eq', column, value]);
          return builder;
        },
        order(column: string) {
          query.orders.push(column);
          return builder;
        },
        range(from: number, to: number) {
          query.range = [from, to];
          return builder;
        },
        maybeSingle: async () => ({ data: { headline: '', bio: '', approved: true }, error: null }),
        then(resolve: (value: unknown) => unknown) {
          const range = query.range;
          if ((query.selectOptions as { head?: boolean } | undefined)?.head)
            return Promise.resolve(resolve({ data: null, count: total, error: null }));
          if (rejectOutOfRange && (range?.[0] ?? 0) > 39)
            return Promise.resolve(
              resolve({
                data: null,
                count: null,
                error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
              }),
            );
          const data =
            table === 'lessons' && range?.[0] === 20
              ? [
                  {
                    id: 'last',
                    group_id: 'group-1',
                    title: 'Last page',
                    starts_at: '2026-10-13T10:00:00Z',
                    ends_at: '2026-10-13T11:00:00Z',
                    status: 'scheduled',
                    notes: '',
                    group: { name: 'Owned', teacher_id: 'teacher-1' },
                  },
                ]
              : [];
          return Promise.resolve(resolve({ data, count: total, error: null }));
        },
      };
      return builder;
    },
  };
  mocks.getRequestViewer.mockResolvedValue({
    db,
    user: { id: 'teacher-1' },
    profile: { id: 'teacher-1', role: 'teacher', status: 'active' },
  });
  return { queries, db };
}

describe('teacher all-lessons loader query contract', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

  it('uses identity authorization and one exact-count owned lessons query for a valid later page', async () => {
    const { queries } = setup();

    const result = await teacherLessons('en', 2);

    expect(result).toMatchObject({
      lessons: [{ id: 'last' }],
      total: 21,
      page: 2,
      pageCount: 2,
      error: null,
    });
    expect(queries.map(query => query.table)).toEqual(['lessons']);
    expect(queries[0]).toMatchObject({
      selectOptions: { count: 'exact' },
      filters: [['eq', 'group.teacher_id', 'teacher-1']],
      range: [20, 39],
      orders: ['starts_at', 'id'],
    });
  });

  it('retries only after the exact count clamps an out-of-range page', async () => {
    const { queries } = setup(21, true);

    const result = await teacherLessons('en', 9);

    expect(result).toMatchObject({
      lessons: [{ id: 'last' }],
      total: 21,
      page: 2,
      pageCount: 2,
      error: null,
    });
    const lessonQueries = queries.filter(query => query.table === 'lessons');
    expect(lessonQueries).toHaveLength(3);
    expect(lessonQueries.map(query => query.range)).toEqual([[160, 179], undefined, [20, 39]]);
    expect(lessonQueries[0].selectOptions).toEqual({ count: 'exact' });
    expect(lessonQueries[1].selectOptions).toEqual({ count: 'exact', head: true });
    for (const query of [lessonQueries[0], lessonQueries[1], lessonQueries[2]]) {
      expect(query.filters).toContainEqual(['eq', 'group.teacher_id', 'teacher-1']);
    }
    expect(lessonQueries[0].orders).toEqual(['starts_at', 'id']);
    expect(lessonQueries[2].orders).toEqual(['starts_at', 'id']);
  });
});
