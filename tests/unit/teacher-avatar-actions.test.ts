import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('node:crypto', () => ({ randomUUID: () => '33333333-3333-4333-8333-333333333333' }));

import { removeTeacherAvatar, uploadTeacherAvatar } from '@/features/teacher/profile-actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const oldPath = `${teacherId}/22222222-2222-4222-8222-222222222222.png`;
const newerPath = `${teacherId}/33333333-3333-4333-8333-333333333333.webp`;
const uploadedPath = `${teacherId}/33333333-3333-4333-8333-333333333333.png`;

function setup({ initialPath = oldPath, reads = [oldPath], rpc = { data: true, error: null }, removalError = false }: {
  initialPath?: string | null;
  reads?: Array<string | null | { path: string | null; error: Error }>;
  rpc?: { data: boolean | null; error: Error | null };
  removalError?: boolean;
} = {}) {
  let teacherReadIndex = 0;
  const remove = vi.fn(async (paths: string[]) => removalError
    ? { data: null, error: new Error('storage cleanup failed') }
    : { data: paths.map(name => ({ name })), error: null });
  const rpcMock = vi.fn(async () => rpc);
  const upload = vi.fn(async () => ({ data: { path: newerPath }, error: null }));
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => {
        if (table === 'profiles') return { data: { role: 'teacher', status: 'active' }, error: null };
        const read = reads[teacherReadIndex++];
        if (read && typeof read === 'object') return { data: { avatar_path: read.path }, error: read.error };
        return { data: { avatar_path: read === undefined ? initialPath : read }, error: null };
      } }) }),
    }),
    rpc: rpcMock,
    storage: { from: () => ({ upload, remove }) },
  });
  return { remove, rpcMock, upload };
}

function imageForm() {
  const form = new FormData();
  form.set('avatar', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));
  return form;
}

describe('teacher avatar compare-and-set actions', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('rejects avatar uploads before inspecting the form or calling Storage', async () => {
    const { upload } = setup();
    const form = { get: () => { throw new Error('form should not be inspected'); } } as unknown as FormData;

    const result = await uploadTeacherAvatar('en', null, form);

    expect(result?.error).toMatch(/photo uploads are unavailable/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it('leaves a newer photo intact when a stale removal loses the CAS', async () => {
    const { remove, rpcMock } = setup({ rpc: { data: false, error: null }, reads: [oldPath, newerPath] });

    const result = await removeTeacherAvatar('en', null, new FormData());

    expect(rpcMock).toHaveBeenCalledWith('set_teacher_avatar_path', { p_avatar_path: null, p_expected_path: oldPath });
    expect(result?.error).toMatch(/newer photo was kept/i);
    expect(remove).toHaveBeenCalledWith([oldPath]);
    expect(remove).not.toHaveBeenCalledWith([newerPath]);
  });

  it('does not clear or delete a still-current photo after a stale removal', async () => {
    const { remove } = setup({ rpc: { data: false, error: null }, reads: [oldPath, oldPath] });

    const result = await removeTeacherAvatar('en', null, new FormData());

    expect(result?.error).toMatch(/could not be removed/i);
    expect(remove).not.toHaveBeenCalled();
  });
});
