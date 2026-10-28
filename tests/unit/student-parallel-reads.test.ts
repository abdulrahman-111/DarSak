import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn(), announcement: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: () => true }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/platform/data', () => ({
  catalogue: vi.fn(),
  publicGroupDetail: vi.fn(),
  publicGroups: vi.fn(),
  publicTeachers: vi.fn(),
}));
vi.mock('@/features/groups/announcement-data', () => ({ groupAnnouncement: mocks.announcement }));

import { lessonDetail } from '@/features/student/data';
import { savedGroups } from '@/features/student/saved-data';
import { studentClassWorkspace } from '@/features/student/class-workspace-data';

const lessonId = '44444444-4444-4444-8444-444444444444';
const groupId = '55555555-5555-4555-8555-555555555555';

function viewer(db: unknown) {
  mocks.getRequestViewer.mockResolvedValue({
    db,
    user: { id: 'student-id' },
    profile: { id: 'student-id', full_name: 'Student', role: 'student', status: 'active' },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => (resolve = done));
  return { promise, resolve };
}
/** Chainable query builder that records the table and resolves to `result` when awaited. */
function builder(table: string, log: string[], result: (table: string) => unknown) {
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gt', 'gte', 'lt', 'order', 'range', 'limit', 'in', 'neq'])
    b[method] = () => b;
  b.maybeSingle = () => {
    log.push(table);
    return Promise.resolve(result(table));
  };
  b.then = (resolve: (value: unknown) => unknown) => {
    log.push(table);
    return Promise.resolve(resolve(result(table)));
  };
  return b;
}

describe('student reads that no longer wait on each other', () => {
  beforeEach(() => {
    mocks.getRequestViewer.mockReset();
    mocks.announcement.mockReset();
  });

  it('loads lesson membership, materials and the announcement in one round trip', async () => {
    const started: string[] = [];
    const gate = deferred<void>();
    const db = {
      from(table: string) {
        const b = builder(table, started, t =>
          t === 'lessons'
            ? { data: { id: lessonId, group_id: groupId, title: 'L' }, error: null }
            : t === 'enrollments'
              ? { data: { id: 'e' }, error: null }
              : { data: [], error: null },
        );
        // Hold membership open: the other reads must start without waiting for it.
        if (table === 'enrollments') {
          b.maybeSingle = async () => {
            started.push(table);
            await gate.promise;
            return { data: { id: 'e' }, error: null };
          };
        }
        return b;
      },
    };
    viewer(db);
    mocks.announcement.mockImplementation(async () => {
      started.push('announcement');
      return null;
    });
    const pending = lessonDetail('en', lessonId);
    await vi.waitFor(() =>
      expect(started).toEqual(
        expect.arrayContaining(['lessons', 'enrollments', 'lesson_materials', 'announcement']),
      ),
    );
    gate.resolve();
    expect(await pending).toMatchObject({ lesson: { id: lessonId }, announcement: null });
  });

  it('returns nothing when the student is not accepted in the lesson group', async () => {
    const db = {
      from: (table: string) =>
        builder(table, [], t =>
          t === 'lessons'
            ? { data: { id: lessonId, group_id: groupId, title: 'L' }, error: null }
            : t === 'enrollments'
              ? { data: null, error: null }
              : { data: [{ id: 'secret-material' }], error: null },
        ),
    };
    viewer(db);
    mocks.announcement.mockResolvedValue({ body: 'private', edited_at: 'x' });
    expect(await lessonDetail('en', lessonId)).toBeNull();
  });

  it('reads the saved-groups count and the page together and only re-reads when clamped', async () => {
    const order: string[] = [];
    const rpc = vi.fn(async (_name: string, args: { p_offset: number }) => {
      order.push(`rpc:${args.p_offset}`);
      return { data: [], error: null };
    });
    const db = {
      rpc,
      from: () => ({
        select: () => ({
          eq: async () => {
            order.push('count');
            return { count: 25, error: null };
          },
        }),
      }),
    };
    viewer(db);
    await savedGroups('en', '2');
    expect(order.sort()).toEqual(['count', 'rpc:20']);
    expect(rpc).toHaveBeenCalledTimes(1);

    order.length = 0;
    rpc.mockClear();
    const result = await savedGroups('en', '99');
    // Page 99 is out of range for 25 rows, so it is clamped to page 2 and re-read once.
    expect(result.page).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1].p_offset).toBe(20);
  });

  it('starts overview section reads with the access check and drops them when access fails', async () => {
    const started: string[] = [];
    const access = deferred<{ data: unknown; error: null }>();
    const db = {
      rpc: () => access.promise,
      from: (table: string) => builder(table, started, () => ({ data: [], error: null })),
    };
    viewer(db);
    const pending = studentClassWorkspace('en', groupId, { view: 'overview' });
    await vi.waitFor(() =>
      expect(started).toEqual(
        expect.arrayContaining(['lessons', 'group_schedule_slots', 'group_pinned_announcements']),
      ),
    );
    access.resolve({ data: null, error: null });
    expect(await pending).toBeNull();
  });
});
