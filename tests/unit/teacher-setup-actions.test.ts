import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));
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

function setup({
  rpcData = groupId,
  rpcError = null,
  profile = { role: 'teacher', status: 'active' },
}: {
  rpcData?: string | null;
  rpcError?: { code: string; message: string } | null;
  profile?: { role: string; status: string };
} = {}) {
  const rpc = vi.fn(async (name: string) =>
    name === 'teacher_access_status'
      ? {
          data: {
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
          },
          error: null,
        }
      : { data: rpcData, error: rpcError },
  );
  const writes: string[] = [];
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: table === 'profiles' ? profile : { id: groupId, updated_at: exactTimestamp },
        error: null,
      }),
      update: () => {
        writes.push('update');
        return builder;
      },
      insert: () => {
        writes.push('insert');
        return builder;
      },
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
  name: ' Algebra group ',
  description: ' weekly ',
  subject_id: subjectId,
  category_id: categoryId,
  capacity: '12',
  location: ' Room 2 ',
};

describe('teacher group draft action', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('creates through one atomic RPC and never directly writes the group or pair', async () => {
    const { rpc, writes } = setup();
    const result = await saveGroupDraft('en', 'draft', null, form(fields));

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('save_teacher_group_draft', {
      p_group_id: null,
      p_subject_id: subjectId,
      p_category_id: categoryId,
      p_name: 'Algebra group',
      p_description: 'weekly',
      p_capacity: 12,
      p_location: 'Room 2',
      p_expected_updated_at: null,
    });
    expect(writes).toEqual([]);
    expect(result).toMatchObject({ id: groupId, updated_at: exactTimestamp });
  });

  it('passes the loaded microsecond timestamp string unchanged when editing', async () => {
    const { rpc, writes } = setup();
    const result = await saveGroupDraft(
      'en',
      'draft',
      null,
      form({ ...fields, group_id: groupId, expected_updated_at: exactTimestamp }),
    );

    expect(rpc).toHaveBeenCalledWith(
      'save_teacher_group_draft',
      expect.objectContaining({ p_group_id: groupId, p_expected_updated_at: exactTimestamp }),
    );
    expect(writes).toEqual([]);
    expect(result?.id).toBe(groupId);
  });

  it('returns localized stale-save and archived-choice feedback without losing form state', async () => {
    const stale = setup({ rpcError: { code: '40001', message: 'draft changed' } });
    const staleResult = await saveGroupDraft(
      'ar',
      'draft',
      null,
      form({ ...fields, group_id: groupId, expected_updated_at: exactTimestamp }),
    );
    expect(staleResult?.error).toMatch(/تغيرت هذه المجموعة/);
    expect(stale.writes).toEqual([]);

    const archived = setup({ rpcError: { code: 'P0001', message: 'active category required' } });
    const archivedResult = await saveGroupDraft(
      'en',
      'draft',
      null,
      form({ ...fields, group_id: groupId, expected_updated_at: exactTimestamp }),
    );
    expect(archivedResult?.error).toMatch(/selection or draft is no longer available/i);
    expect(archived.writes).toEqual([]);
  });

  it('uses the existing atomic RPC and invalidates public and student views for published edits', async () => {
    const { rpc, writes } = setup();
    const result = await saveGroupDraft(
      'ar',
      'published-edit',
      null,
      form({ ...fields, group_id: groupId, expected_updated_at: exactTimestamp }),
    );

    expect(rpc).toHaveBeenCalledWith(
      'save_teacher_group_draft',
      expect.objectContaining({ p_group_id: groupId, p_expected_updated_at: exactTimestamp }),
    );
    expect(result?.success).toMatch(/تم حفظ تفاصيل المجموعة/);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/ar/groups/${groupId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/teachers');
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/classes');
    expect(writes).toEqual([]);
  });
});

describe('unified group details save', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });
  const learning = {
    learning_details: '1',
    outcomes: 'Build useful programs',
    prerequisites: 'No experience needed',
    delivery_mode: 'online',
    fee_egp: '150',
    fee_basis: 'month',
    fee_includes: 'Practice sheets',
    expected_learning_updated_at: '',
  };
  it('saves basics and learning information together in one atomic RPC from first creation', async () => {
    const { rpc, writes } = setup();
    const result = await saveGroupDraft('en', 'draft', null, form({ ...fields, ...learning }));
    expect(rpc).toHaveBeenCalledWith('save_teacher_group_details', {
      p_group_id: null,
      p_subject_id: subjectId,
      p_category_id: categoryId,
      p_name: 'Algebra group',
      p_description: 'weekly',
      p_capacity: 12,
      p_location: 'Room 2',
      p_expected_updated_at: null,
      p_expected_learning_updated_at: null,
      p_learning_values: {
        outcomes: 'Build useful programs',
        prerequisites: 'No experience needed',
        delivery_mode: 'online',
        fee_egp: 150,
        fee_basis: 'month',
        fee_includes: 'Practice sheets',
      },
    });
    expect(rpc).not.toHaveBeenCalledWith('save_teacher_group_draft', expect.anything());
    expect(writes).toEqual([]);
    expect(result?.id).toBe(groupId);
  });
  it('rejects an incomplete fee before any database work and identifies the field', async () => {
    const result = await saveGroupDraft(
      'en',
      'draft',
      null,
      form({ ...fields, ...learning, fee_basis: '' }),
    );
    expect(result?.fieldErrors).toHaveProperty('fee_basis');
    expect(createClientMock).not.toHaveBeenCalled();
  });
  it('preserves both exact version tokens for an existing published group', async () => {
    const { rpc } = setup();
    await saveGroupDraft(
      'ar',
      'published-edit',
      null,
      form({
        ...fields,
        ...learning,
        group_id: groupId,
        expected_updated_at: exactTimestamp,
        expected_learning_updated_at: exactTimestamp,
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'save_teacher_group_details',
      expect.objectContaining({
        p_group_id: groupId,
        p_expected_updated_at: exactTimestamp,
        p_expected_learning_updated_at: exactTimestamp,
      }),
    );
  });
  it('allows every optional learning field to remain blank', async () => {
    const { rpc } = setup();
    const result = await saveGroupDraft(
      'en',
      'draft',
      null,
      form({
        ...fields,
        learning_details: '1',
        outcomes: '',
        prerequisites: '',
        delivery_mode: '',
        fee_egp: '',
        fee_basis: '',
        fee_includes: '',
      }),
    );
    expect(result?.id).toBe(groupId);
    expect(rpc).toHaveBeenCalledWith(
      'save_teacher_group_details',
      expect.objectContaining({
        p_learning_values: {
          outcomes: '',
          prerequisites: '',
          delivery_mode: null,
          fee_egp: null,
          fee_basis: null,
          fee_includes: '',
        },
      }),
    );
  });
});
