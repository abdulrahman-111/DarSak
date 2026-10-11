import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({ createClientMock: vi.fn(), revalidatePathMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { saveGroupDraft } from '@/features/teacher/setup-actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const groupId = '44444444-4444-4444-8444-444444444444';
const subjectId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const exactTimestamp = '2026-10-11T12:13:14.123456+00:00';

function form(entries: Record<string, string>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(entries)) value.set(key, item);
  return value;
}

function setup({ rpcData = groupId, rpcError = null, profile = { role: 'teacher', status: 'active' } }: {
  rpcData?: string | null;
  rpcError?: { code: string; message: string } | null;
  profile?: { role: string; status: string };
} = {}) {
  const rpc = vi.fn(async () => ({ data: rpcData, error: rpcError }));
  const writes: string[] = [];
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: table === 'profiles' ? profile : { id: groupId, updated_at: exactTimestamp }, error: null }),
      update: () => { writes.push('update'); return builder; },
      insert: () => { writes.push('insert'); return builder; },
    };
    return builder;
  };
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from,
    rpc,
  });
  return { rpc, writes };
}

const fields = {
  name: ' Algebra group ', description: ' weekly ', subject_id: subjectId, category_id: categoryId,
  capacity: '12', location: ' Room 2 ',
};

describe('teacher group draft action', () => {
  beforeEach(() => { createClientMock.mockReset(); revalidatePathMock.mockReset(); });

  it('creates through one atomic RPC and never directly writes the group or pair', async () => {
    const { rpc, writes } = setup();
    const result = await saveGroupDraft('en', null, form(fields));

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('save_teacher_group_draft', {
      p_group_id: null, p_subject_id: subjectId, p_category_id: categoryId,
      p_name: 'Algebra group', p_description: 'weekly', p_capacity: 12, p_location: 'Room 2', p_expected_updated_at: null,
    });
    expect(writes).toEqual([]);
    expect(result).toMatchObject({ id: groupId, updated_at: exactTimestamp });
  });

  it('passes the loaded microsecond timestamp string unchanged when editing', async () => {
    const { rpc, writes } = setup();
    const result = await saveGroupDraft('en', null, form({ ...fields, group_id: groupId, expected_updated_at: exactTimestamp }));

    expect(rpc).toHaveBeenCalledWith('save_teacher_group_draft', expect.objectContaining({ p_group_id: groupId, p_expected_updated_at: exactTimestamp }));
    expect(writes).toEqual([]);
    expect(result?.id).toBe(groupId);
  });

  it('returns localized stale-save and archived-choice feedback without losing form state', async () => {
    const stale = setup({ rpcError: { code: '40001', message: 'draft changed' } });
    const staleResult = await saveGroupDraft('ar', null, form({ ...fields, group_id: groupId, expected_updated_at: exactTimestamp }));
    expect(staleResult?.error).toMatch(/تغيرت هذه المسودة/);
    expect(stale.writes).toEqual([]);

    const archived = setup({ rpcError: { code: 'P0001', message: 'active category required' } });
    const archivedResult = await saveGroupDraft('en', null, form({ ...fields, group_id: groupId, expected_updated_at: exactTimestamp }));
    expect(archivedResult?.error).toMatch(/selection or draft is no longer available/i);
    expect(archived.writes).toEqual([]);
  });
});
