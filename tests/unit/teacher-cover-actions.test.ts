import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { removeTeacherCover } from '@/features/teacher/profile-cover-actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const oldCover = `${teacherId}/cover/22222222-2222-4222-8222-222222222222.png`;
const newCover = `${teacherId}/cover/33333333-3333-4333-8333-333333333333.webp`;

function setupRemoval({ rpc, reads, removalError = false }: {
  rpc: { data: boolean | null; error: unknown };
  reads: Array<{ path: string | null; error?: unknown }>;
  removalError?: boolean;
}) {
  let teacherReadIndex = 0;
  const remove = vi.fn(async (paths: string[]) => removalError
    ? { data: null, error: new Error('storage cleanup failed') }
    : { data: paths.map(name => ({ name })), error: null });
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === 'profiles'
            ? { data: { role: 'teacher', status: 'active' }, error: null }
            : (() => {
              const read = reads[teacherReadIndex++];
              return { data: read ? { cover_path: read.path } : null, error: read?.error ?? null };
            })(),
        }),
      }),
    }),
    rpc: async () => rpc,
    storage: { from: () => ({ remove }) },
  });
  return { remove };
}

describe('removeTeacherCover concurrent result handling', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('reports a conflict when another save selected a newer cover', async () => {
    const { remove } = setupRemoval({ rpc: { data: false, error: null }, reads: [{ path: oldCover }, { path: newCover }] });

    const result = await removeTeacherCover('en', null, new FormData());

    expect(result?.error).toMatch(/newer cover was kept/i);
    expect(result?.success).toBeUndefined();
    expect(remove).toHaveBeenCalledWith([oldCover]);
  });

  it('reports the same conflict when the CAS errors but verification finds a newer cover', async () => {
    const { remove } = setupRemoval({ rpc: { data: null, error: new Error('rpc timeout') }, reads: [{ path: oldCover }, { path: newCover }] });

    const result = await removeTeacherCover('en', null, new FormData());

    expect(result?.error).toMatch(/newer cover was kept/i);
    expect(result?.success).toBeUndefined();
    expect(remove).toHaveBeenCalledWith([oldCover]);
  });

  it('reports success after a false CAS only when verification confirms no current cover', async () => {
    setupRemoval({ rpc: { data: false, error: null }, reads: [{ path: oldCover }, { path: null }] });

    const result = await removeTeacherCover('en', null, new FormData());

    expect(result?.success).toMatch(/cover removed/i);
    expect(result?.error).toBeUndefined();
  });

  it('preserves the current cover when a failed CAS verifies the old cover remains selected', async () => {
    const { remove } = setupRemoval({ rpc: { data: null, error: new Error('rpc failed') }, reads: [{ path: oldCover }, { path: oldCover }] });

    const result = await removeTeacherCover('en', null, new FormData());

    expect(result?.error).toMatch(/could not be removed/i);
    expect(remove).not.toHaveBeenCalled();
  });

  it('leaves the object private and reports uncertainty when verification cannot read the reference', async () => {
    const { remove } = setupRemoval({ rpc: { data: null, error: new Error('rpc failed') }, reads: [{ path: oldCover }, { path: null, error: new Error('read failed') }] });

    const result = await removeTeacherCover('en', null, new FormData());

    expect(result?.error).toMatch(/could not be confirmed/i);
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not return success when the reference is cleared but Storage cleanup fails', async () => {
    const { remove } = setupRemoval({ rpc: { data: true, error: null }, reads: [{ path: oldCover }], removalError: true });

    const result = await removeTeacherCover('en', null, new FormData());

    expect(result?.error).toMatch(/could not be cleaned up/i);
    expect(result?.success).toBeUndefined();
    expect(remove).toHaveBeenCalledWith([oldCover]);
  });
});
