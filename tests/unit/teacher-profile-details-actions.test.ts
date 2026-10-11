import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { saveTeacherProfileDetails } from '@/features/teacher/profile-details-actions';
import { emptyRichProfile } from '@/features/teacher/profile-details-domain';

const teacherId = '11111111-1111-4111-8111-111111111111';

function formFor(details = emptyRichProfile()) {
  const form = new FormData();
  form.set('details', JSON.stringify(details));
  form.set('expected_version', '0');
  return form;
}

function setup(rpcResult: { data: unknown; error: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => rpcResult);
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { role: 'teacher', status: 'active' }, error: null }) }),
      }),
    }),
    rpc,
  });
  return { rpc };
}

describe('saveTeacherProfileDetails', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('saves validated canonical details with the expected version and revalidates both locales', async () => {
    const { rpc } = setup({ data: 1, error: null });
    const result = await saveTeacherProfileDetails('en', null, formFor());

    expect(result).toMatchObject({ success: 'Profile details saved.', version: 1 });
    expect(rpc).toHaveBeenCalledWith('save_teacher_profile_details', {
      p_details: emptyRichProfile(),
      p_expected_version: 0,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/teachers');
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/teachers');
    expect(revalidatePathMock).toHaveBeenCalledWith('/[locale]/teachers/[id]', 'page');
  });

  it('returns localized stale retry feedback when the compare-and-set version is outdated', async () => {
    setup({ data: null, error: { code: '40001', message: 'profile details version conflict' } });

    const en = await saveTeacherProfileDetails('en', null, formFor());
    const ar = await saveTeacherProfileDetails('ar', null, formFor());

    expect(en?.error).toMatch(/profile changed while you were editing/i);
    expect(ar?.error).toMatch(/تغير ملفك الشخصي أثناء التعديل/);
  });

  it('rejects malformed JSON before opening a database session', async () => {
    const form = new FormData();
    form.set('details', '{');
    form.set('expected_version', '0');

    const result = await saveTeacherProfileDetails('en', null, form);

    expect(result?.fieldErrors).toEqual({ form: 'invalid' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('keeps the last confirmed version on later validation failures', async () => {
    const details = { ...emptyRichProfile(), about: { en: 'x'.repeat(5_001), ar: '' } };
    const result = await saveTeacherProfileDetails('en', { version: 7 }, formFor(details));

    expect(result).toMatchObject({ version: 7, error: expect.any(String) });
    expect(result?.fieldErrors).toHaveProperty('about.en');
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('removes blank repeater drafts before saving canonical details', async () => {
    const blank = {
      id: 'blank-draft', title: { ar: '', en: '' }, organization: { ar: '', en: '' }, description: { ar: '', en: '' },
      start_year: null, end_year: null, current: false,
    };
    const { rpc } = setup({ data: 1, error: null });
    await saveTeacherProfileDetails('en', null, formFor({ ...emptyRichProfile(), qualifications: [blank] }));

    expect(rpc).toHaveBeenCalledWith('save_teacher_profile_details', expect.objectContaining({
      p_details: expect.objectContaining({ qualifications: [] }),
      p_expected_version: 0,
    }));
  });

  it('keeps invalid repeater field paths aligned after blank rows in both lists', async () => {
    const blank = {
      id: 'blank-draft', title: { ar: '', en: '' }, organization: { ar: '', en: '' }, description: { ar: '', en: '' },
      start_year: null, end_year: null, current: false,
    };
    const invalid = {
      id: 'invalid-qualification', title: { ar: '', en: 'Tutor' }, organization: { ar: '', en: '' }, description: { ar: '', en: '' },
      start_year: 2025, end_year: 2020, current: false,
    };
    const details = {
      ...emptyRichProfile(),
      qualifications: [blank, invalid],
      experience: [blank, { ...invalid, id: 'invalid-experience' }],
    };

    const result = await saveTeacherProfileDetails('en', null, formFor(details));

    expect(result?.fieldErrors).toHaveProperty('qualifications.1.end_year');
    expect(result?.fieldErrors).toHaveProperty('experience.1.end_year');
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
