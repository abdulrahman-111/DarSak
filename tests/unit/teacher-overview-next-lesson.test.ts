import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));

import { teacherOverview } from '@/features/teacher/data';

describe('teacher overview next lesson query', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getRequestViewer.mockReset();
  });

  it('redirects unauthenticated viewers before starting measured loader reads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getRequestViewer.mockResolvedValue({ db: {}, user: null, profile: null });
    await expect(teacherOverview('en')).rejects.toThrow('redirect:/en/login');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'student', '/en/student'],
    ['ar', 'student', '/ar/student'],
    ['en', 'admin', '/en/admin'],
    ['ar', 'admin', '/ar/admin'],
  ] as const)('sends an active %s wrong-role viewer to %s', async (locale, role, destination) => {
    const reads = vi.fn();
    mocks.getRequestViewer.mockResolvedValue({
      db: { from: reads, rpc: reads },
      user: { id: 'other-role' },
      profile: { id: 'other-role', role, status: 'active', full_name: 'Other Role' },
    });
    await expect(teacherOverview(locale)).rejects.toThrow(`redirect:${destination}`);
    expect(reads).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'missing-user', '/en/login'],
    ['ar', 'missing-profile', '/ar/login'],
    ['en', 'suspended', '/en/login'],
    ['ar', 'suspended', '/ar/login'],
    ['en', 'unknown-role', '/en/login'],
    ['ar', 'unknown-role', '/ar/login'],
  ] as const)(
    'sends missing, suspended, or unknown %s profile to login',
    async (locale, kind, destination) => {
      const reads = vi.fn();
      mocks.getRequestViewer.mockResolvedValue({
        db: { from: reads, rpc: reads },
        user: kind === 'missing-user' ? null : { id: 'teacher' },
        profile:
          kind === 'missing-user' || kind === 'missing-profile'
            ? null
            : {
                id: 'teacher',
                role: kind === 'unknown-role' ? 'visitor' : 'teacher',
                status: kind === 'suspended' ? 'suspended' : 'active',
                full_name: 'Taylor',
              },
      });
      await expect(teacherOverview(locale)).rejects.toThrow(`redirect:${destination}`);
      expect(reads).not.toHaveBeenCalled();
    },
  );

  it('reads one earliest owned scheduled lesson that has not ended', async () => {
    const now = new Date('2026-10-13T12:00:00.000Z');
    const query = {
      filters: [] as Array<[string, string, unknown]>,
      orders: [] as Array<[string, boolean]>,
      limit: 0,
      columns: '',
    };
    const lesson = {
      id: 'ongoing-lesson',
      group_id: 'group-1',
      title: 'Ongoing session',
      starts_at: '2026-10-13T11:30:00.000Z',
      ends_at: '2026-10-13T12:30:00.000Z',
      status: 'scheduled',
      group: { id: 'group-1', name: 'Algebra', teacher_id: 'teacher-1' },
    };
    const db = {
      from(table: string) {
        const builder: any = {
          select(columns: string) {
            if (table === 'lessons') query.columns = columns;
            return builder;
          },
          eq(column: string, value: unknown) {
            if (table === 'lessons') query.filters.push(['eq', column, value]);
            return builder;
          },
          gt(column: string, value: unknown) {
            query.filters.push(['gt', column, value]);
            return builder;
          },
          order(column: string, options: { ascending: boolean }) {
            query.orders.push([column, options.ascending]);
            return builder;
          },
          limit(value: number) {
            query.limit = value;
            return builder;
          },
          maybeSingle: async () => ({
            data: { headline: 'Math', bio: 'Teacher', approved: true },
            error: null,
          }),
          then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
            return Promise.resolve({ data: [lesson], error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
      rpc(name: string) {
        const data =
          name === 'teacher_dashboard_summary'
            ? {
                groups: [{ id: 'group-1', name: 'Algebra', status: 'published' }],
                group_count: 1,
                today: [],
                today_count: 0,
                upcoming: [],
                upcoming_count: 0,
                has_specializations: true,
                draft_candidate: null,
                missing_schedule_candidate: null,
              }
            : { rows: [], total: 0 };
        return Promise.resolve({ data, error: null });
      },
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'teacher-1' },
      profile: { id: 'teacher-1', role: 'teacher', status: 'active', full_name: 'Taylor Teacher' },
    });

    const result = await teacherOverview('en', now);

    expect(result.error).toBeNull();
    expect(result.nextLesson).toEqual(lesson);
    expect(query.columns).toContain('group:groups!inner(id,name,teacher_id)');
    expect(query.filters).toEqual([
      ['eq', 'group.teacher_id', 'teacher-1'],
      ['eq', 'status', 'scheduled'],
      ['gt', 'ends_at', now.toISOString()],
    ]);
    expect(query.orders).toEqual([
      ['starts_at', true],
      ['id', true],
    ]);
    expect(query.limit).toBe(1);
  });

  it('starts profile, summary, pending enrollment, and next lesson reads before profile resolves', async () => {
    let resolveProfile!: (value: unknown) => void;
    const profile = new Promise(resolve => {
      resolveProfile = resolve;
    });
    const started = new Set<string>();
    const db = {
      from(table: string) {
        const builder: any = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          gt() {
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          maybeSingle() {
            started.add('profile');
            return profile;
          },
          then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
            started.add('next-lesson');
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
      rpc(name: string) {
        started.add(name === 'teacher_dashboard_summary' ? 'summary' : 'pending-enrollment');
        const data =
          name === 'teacher_dashboard_summary'
            ? {
                groups: [],
                group_count: 0,
                today: [],
                today_count: 0,
                upcoming: [],
                upcoming_count: 0,
                has_specializations: false,
                draft_candidate: null,
                missing_schedule_candidate: null,
              }
            : { rows: [], total: 0 };
        return Promise.resolve({ data, error: null });
      },
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'teacher-1' },
      profile: { id: 'teacher-1', role: 'teacher', status: 'active', full_name: 'Taylor Teacher' },
    });

    const result = teacherOverview('en', new Date('2026-10-13T12:00:00.000Z'));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(started).toEqual(new Set(['profile', 'summary', 'pending-enrollment', 'next-lesson']));

    resolveProfile({ data: { headline: 'Math', bio: 'Teacher', approved: true }, error: null });
    await expect(result).resolves.toMatchObject({
      error: null,
      me: { teacher: { headline: 'Math' } },
    });
  });
});
