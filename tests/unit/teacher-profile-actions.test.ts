import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { addTeacherSpecialization, saveTeacherProfile } from '@/features/teacher/profile-actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const offeringId = '44444444-4444-4444-8444-444444444444';

function formPair(subject = subjectId, category = categoryId) {
  const form = new FormData();
  form.set('subject_id', subject);
  form.set('category_id', category);
  return form;
}

function setup(rpcResult: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => rpcResult);
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === 'offerings'
                ? {
                    id: offeringId,
                    owner_teacher_id: teacherId,
                    archived_at: null,
                    node_id: categoryId,
                    subject_id: subjectId,
                  }
                : { role: 'teacher', status: 'active' },
            error: null,
          }),
        }),
      }),
    }),
    rpc,
  });
  return { rpc };
}

describe('teacher profile actions', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('validates pair IDs before opening a database session', async () => {
    const result = await addTeacherSpecialization('en', null, formPair('bad'));
    expect(result?.fieldErrors).toEqual({ subject_id: 'invalid' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('creates or resolves one pair through the narrow RPC and returns its offering reference', async () => {
    const { rpc } = setup({ data: offeringId, error: null });
    const result = await addTeacherSpecialization('en', null, formPair());
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('save_teacher_offering', {
      p_subject_id: subjectId,
      p_category_id: categoryId,
    });
    expect(result).toMatchObject({
      success: 'Specialization added to your profile draft.',
      id: offeringId,
      row: { id: offeringId, subject_id: subjectId, node_id: categoryId },
    });
  });

  it('localizes archived and unavailable pair refusals', async () => {
    setup({
      data: null,
      error: { message: 'restore the archived specialization before adding it' },
    });
    const english = await addTeacherSpecialization('en', null, formPair());
    setup({ data: null, error: { message: 'choose active shared or owned catalogue components' } });
    const arabic = await addTeacherSpecialization('ar', null, formPair());
    expect(english?.error).toMatch(/archived/i);
    expect(arabic?.error).toMatch(/غير متاحة/);
  });

  it('preserves the account RPC signature and excludes private details and bio', async () => {
    const { rpc } = setup({ data: null, error: null });
    const form = new FormData();
    form.set('full_name', 'Mona Ali');
    form.set('headline', 'Math teacher');
    form.set('offering_ids', offeringId);
    form.set('phone_number', '');
    form.set('whatsapp_number', '');
    form.set('contact_email', '');
    form.set('visibility', 'enrolled');
    form.set('bio', 'private');
    form.set('details', '{"about":{"en":"private"}}');
    form.set('expected_version', '12');

    await saveTeacherProfile('en', null, form);

    expect(rpc).toHaveBeenCalledWith('save_teacher_profile_account', {
      p_full_name: 'Mona Ali',
      p_headline: 'Math teacher',
      p_offering_ids: [offeringId],
      p_phone_number: null,
      p_whatsapp_number: null,
      p_contact_email: null,
      p_visibility: 'enrolled',
    });
  });
});
