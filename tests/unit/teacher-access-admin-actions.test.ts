import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, getAdminActorMock, afterMock, revalidatePathMock, flushMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    getAdminActorMock: vi.fn(),
    afterMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    flushMock: vi.fn(),
  }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: afterMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@admin/lib/access', () => ({ getAdminActor: getAdminActorMock }));

import { decideTeacherAccess } from '@admin/features/teacher-access/admin-actions';

const requestId = '11111111-1111-4111-8111-111111111111';
function setup(error: { code?: string; message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: null, error }));
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'admin', status: 'active' }, error: null }),
        }),
      }),
    }),
    rpc,
  };
  createClientMock.mockResolvedValue(db);
  getAdminActorMock.mockResolvedValue({ db, id: '22222222-2222-4222-8222-222222222222' });
  return rpc;
}
function form(decision: string) {
  const data = new FormData();
  data.set('request_id', requestId);
  data.set('decision', decision);
  return data;
}

beforeEach(() => {
  createClientMock.mockReset();
  getAdminActorMock.mockReset();
  afterMock.mockReset();
  revalidatePathMock.mockReset();
  flushMock.mockReset();
});

describe('monthly teacher access decisions', () => {
  it('maps a stale opposing decision to refresh feedback without success effects', async () => {
    const rpc = setup({ code: 'PT409', message: 'access request already reviewed' });
    const result = await decideTeacherAccess('en', null, form('approve'));

    expect(result?.error).toMatch(/already been reviewed/i);
    expect(result?.success).toBeUndefined();
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps an applied same-decision repeat successful and idempotent', async () => {
    const rpc = setup();
    const result = await decideTeacherAccess('en', null, form('approve'));

    expect(result).toMatchObject({ success: 'Decision saved.' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});
