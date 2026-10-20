import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock, studentMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  studentMock: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/features/student/data', () => ({ student: studentMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { setLessonStatus } from '@/features/teacher/actions';
import { saveLessonAttendance } from '@/features/teacher/attendance-actions';
import { cancelTeacherGroup } from '@/features/teacher/management-actions';
import { saveGroupAnnouncement } from '@/features/groups/announcement-actions';
import { feedbackAction } from '@/features/feedback/actions';
import { studentResources } from '@/features/student/resource-data';

const teacherId = '11111111-1111-4111-8111-111111111111';
const groupId = '44444444-4444-4444-8444-444444444444';
const lessonId = '55555555-5555-4555-8555-555555555555';
const studentId = '66666666-6666-4666-8666-666666666666';
const status = {
  has_access: true,
  starts_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
  renewal_opens_at: null,
  can_renew: false,
  fees_enabled: false,
  fee_effective_at: null,
  announcement_en: null,
  announcement_ar: null,
  pending_request_id: null,
};

function configure(rpcResult: { data?: unknown; error: unknown } = { data: null, error: null }) {
  const rpc = vi.fn(async (name: string) =>
    name === 'teacher_access_status' ? { data: status, error: null } : rpcResult,
  );
  const profileQuery = {
    select: () => profileQuery,
    eq: () => profileQuery,
    single: async () => ({ data: { role: 'teacher', status: 'active' }, error: null }),
    maybeSingle: async () => ({ data: { role: 'teacher', status: 'active' }, error: null }),
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: teacherId } } }) },
    from: (table: string) =>
      table === 'profiles'
        ? profileQuery
        : {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          },
    rpc,
  };
  createClientMock.mockResolvedValue(db);
  return rpc;
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('mutation cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes student and teacher learning routes after a lesson status succeeds, in both locales', async () => {
    configure();
    await setLessonStatus('en', lessonId, 'completed');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/student/classes/[id]', 'page');
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/materials');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/timetable');
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/teacher/lessons/[id]', 'page');
  });

  it('does not invalidate any route when the lesson status RPC fails', async () => {
    configure({ data: null, error: { message: 'failed' } });
    await setLessonStatus('en', lessonId, 'completed');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('refreshes attendance workspace only after the attendance RPC succeeds', async () => {
    configure();
    await saveLessonAttendance('ar', lessonId, studentId, 'present');
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/classes/[id]', 'page');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/teacher/lessons');
    revalidatePathMock.mockClear();
    configure({ data: null, error: { message: 'failed' } });
    await saveLessonAttendance('en', lessonId, studentId, 'present');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('refreshes the learning surfaces after a group announcement succeeds', async () => {
    configure({ data: '2026-10-01T00:00:00Z', error: null });
    await saveGroupAnnouncement('en', groupId, null, form({ body: 'Update' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/groups/' + groupId);
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/classes/[id]', 'page');
  });

  it('does not invalidate routes when an announcement RPC fails', async () => {
    configure({ data: null, error: { message: 'failed' } });
    await saveGroupAnnouncement('en', groupId, null, form({ body: 'Update' }));
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('refreshes student class pages after feedback saves', async () => {
    configure({ data: 1, error: null });
    await feedbackAction(
      'en',
      'save',
      groupId,
      null,
      form({ version: '0', rating: '5', comment: 'A useful class with clear explanations.' }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/classes/[id]', 'page');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/timetable');
  });

  it('does not invalidate routes when feedback RPC fails', async () => {
    configure({ data: null, error: { message: 'failed', code: 'XX000' } });
    await feedbackAction(
      'en',
      'save',
      groupId,
      null,
      form({ version: '0', rating: '5', comment: 'A useful class with clear explanations.' }),
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('refreshes student and teacher workspaces after group cancellation', async () => {
    configure({ data: 2, error: null });
    await cancelTeacherGroup('en', groupId, null, form({}));
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/classes/[id]', 'page');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/teacher/groups/[id]', 'page');
  });

  it('does not invalidate routes when group cancellation fails', async () => {
    configure({ data: null, error: { message: 'failed' } });
    await cancelTeacherGroup('en', groupId, null, form({}));
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('student resource RPC response validation', () => {
  it('fails safely on malformed count or rows without retrying with an invalid offset', async () => {
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === 'student_resource_page'
          ? { data: { total: 'NaN', rows: null }, error: null }
          : { data: [], error: null },
      ),
    );
    const db = { rpc };
    studentMock.mockResolvedValue({ db });
    const result = await studentResources('en', { page: 3 });
    expect(result).toMatchObject({ rows: [], page: 1, pageCount: 1, total: 0, error: true });
    expect(rpc).toHaveBeenCalledTimes(2); // malformed page is not retried with an invalid offset
  });

  it('validates the out-of-range correction and uses its updated total', async () => {
    let pageCalls = 0;
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === 'student_resource_page'
          ? { data: { total: ++pageCalls === 1 ? 21 : 19, rows: [] }, error: null }
          : { data: [], error: null },
      ),
    );
    studentMock.mockResolvedValue({ db: { rpc } });
    const result = await studentResources('en', { page: 4 });
    expect(result).toMatchObject({ rows: [], page: 1, pageCount: 1, total: 19, error: false });
    expect(rpc.mock.calls.filter(([name]) => name === 'student_resource_page')).toHaveLength(3);
  });

  it('does not retry when a changed total leaves the corrected page unchanged', async () => {
    let pageCalls = 0;
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === 'student_resource_page'
          ? { data: { total: ++pageCalls === 1 ? 41 : 50, rows: [] }, error: null }
          : { data: [], error: null },
      ),
    );
    studentMock.mockResolvedValue({ db: { rpc } });
    const result = await studentResources('en', { page: 4 });
    expect(result).toMatchObject({ page: 3, pageCount: 3, total: 50, error: false });
    expect(rpc.mock.calls.filter(([name]) => name === 'student_resource_page')).toHaveLength(2);
  });

  it('fails safely when the total changes again and invalidates the fetched page', async () => {
    let pageCalls = 0;
    const totals = [61, 41, 21];
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === 'student_resource_page'
          ? { data: { total: totals[pageCalls++], rows: [{ id: 'stale-row' }] }, error: null }
          : { data: [], error: null },
      ),
    );
    studentMock.mockResolvedValue({ db: { rpc } });
    const result = await studentResources('en', { page: 9 });
    expect(result).toMatchObject({ rows: [], page: 2, pageCount: 2, total: 21, error: true });
    expect(pageCalls).toBe(3);
  });

  it('fails safely when the corrected page response is malformed', async () => {
    let pageCalls = 0;
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === 'student_resource_page'
          ? ++pageCalls === 1
            ? { data: { total: 1, rows: [] }, error: null }
            : { data: { total: 1, rows: null }, error: null }
          : { data: [], error: null },
      ),
    );
    studentMock.mockResolvedValue({ db: { rpc } });
    const result = await studentResources('en', { page: 3 });
    expect(result).toMatchObject({ rows: [], page: 1, pageCount: 1, total: 1, error: true });
  });
});
