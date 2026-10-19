import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock, logActionFailureMock } = vi.hoisted(() => ({ createClientMock: vi.fn(), revalidatePathMock: vi.fn(), logActionFailureMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/action-diagnostics', () => ({ logActionFailure: logActionFailureMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { deleteMaterial, setLessonStatus } from '@/features/teacher/actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const lessonId = '22222222-2222-4222-8222-222222222222';
const materialId = '33333333-3333-4333-8333-333333333333';
const currentStatus = { has_access: true, starts_at: '2026-01-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', renewal_opens_at: null, can_renew: false, fees_enabled: false, fee_effective_at: null, announcement_en: null, announcement_ar: null, pending_request_id: null };

function setup(options: { rpcError?: { code?: string; message: string } | null; deleteError?: { message: string } | null; access?: unknown } = {}) {
  const rpc = vi.fn(async (name: string) => name === 'teacher_access_status' ? ({ data: options.access === undefined ? currentStatus : options.access, error: null }) : ({ error: options.rpcError ?? { message: 'sensitive database detail' } }));
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: teacherId } } }) },
    from: (table: string) => {
      if (table === 'profiles') {
        const builder = { select: () => builder, eq: () => builder, single: async () => ({ data: { role: 'teacher', status: 'active' } }) };
        return builder;
      }
      const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: { storage_path: null }, error: null }) };
      return {
        select: () => builder,
        delete: () => ({ eq: async () => ({ error: options.deleteError ?? { message: 'sensitive database detail' } }) }),
      };
    },
    rpc,
  };
  createClientMock.mockResolvedValue(db);
  return rpc;
}

describe('teacher action feedback', () => {
  beforeEach(() => { createClientMock.mockReset(); logActionFailureMock.mockReset(); revalidatePathMock.mockReset(); });

  it('localizes lesson status errors and retains server diagnostics', async () => {
    const rpc = setup({ rpcError: { message: 'not authorized: database policy detail' } });
    const result = await setLessonStatus('ar', lessonId, 'completed');
    expect(result.error).toMatch(/ليست لديك صلاحية/);
    expect(result.error).not.toContain('database policy detail');
    expect(logActionFailureMock).toHaveBeenCalledWith('lesson_status.save', expect.any(Number), { message: 'not authorized: database policy detail' }, 'DB_ERROR');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['teacher_access_status', 'set_lesson_status']);
  });

  it('localizes material deletion failures while logging the database error', async () => {
    setup({ deleteError: { message: 'sensitive database detail' } });
    const result = await deleteMaterial('en', lessonId, materialId);
    expect(result.error).toMatch(/could not delete the material/i);
    expect(result.error).not.toContain('sensitive database detail');
    expect(logActionFailureMock).toHaveBeenCalledWith('materials.metadata.delete', expect.any(Number), { message: 'sensitive database detail' }, 'DB_ERROR');
  });

  it('returns renewal guidance for expired access and retry guidance for unavailable access', async () => {
    setup({ access: { ...currentStatus, has_access: false } });
    const expired = await setLessonStatus('en', lessonId, 'completed');
    expect(expired.error).toMatch(/access has expired.*renew/i);

    setup({ access: null });
    const unavailable = await setLessonStatus('ar', lessonId, 'completed');
    expect(unavailable.error).toMatch(/تعذر التحقق من صلاحية التدريس/);
  });
});
