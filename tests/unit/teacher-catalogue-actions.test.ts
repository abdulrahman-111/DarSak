import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { saveTeacherCatalogueCategory, saveTeacherCatalogueSubject, setTeacherCatalogueArchived } from '@/features/teacher/catalogue-actions';
import { filterTeacherCatalogueChoices } from '@/features/teacher/catalogue-domain';

const teacherId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';

function form(entries: Record<string, string>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(entries)) value.set(key, item);
  return value;
}

function setup(options: {
  rpcData?: string | null;
  rpcError?: { message: string } | null;
  profile?: { role: string; status: string };
  row?: { id: string; owner_teacher_id: string | null; archived_at: string | null; name_ar: string; name_en: string };
} = {}) {
  const { rpcData = subjectId, rpcError = null, profile = { role: 'teacher', status: 'active' }, row = { id: subjectId, owner_teacher_id: teacherId, archived_at: null, name_ar: 'رياضيات', name_en: 'Mathematics' } } = options;
  const rpc = vi.fn(async () => ({ data: rpcData, error: rpcError }));
  const from = (table: string) => ({
    select: () => {
      let filters: string[] = [];
      const builder = {
        eq: (_column: string, value: string) => { filters.push(value); return builder; },
        maybeSingle: async () => ({ data: table === 'profiles' ? profile : filters.includes(teacherId) && row.owner_teacher_id === teacherId ? row : null, error: null }),
      };
      return builder;
    },
  });
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from,
    rpc,
  });
  return { rpc };
}

describe('teacher catalogue actions', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('requires at least one language and returns field errors before opening a session', async () => {
    const result = await saveTeacherCatalogueSubject('en', null, form({ name_ar: ' ', name_en: '\t' }));

    expect(result?.fieldErrors).toHaveProperty('name_ar');
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('requires a live active teacher', async () => {
    const { rpc } = setup({ profile: { role: 'student', status: 'active' } });

    const result = await saveTeacherCatalogueSubject('en', null, form({ name_ar: 'جبر', name_en: '' }));

    expect(result?.error).toMatch(/active teacher/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls the fixed subject RPC without an owner and returns the own saved row', async () => {
    const { rpc } = setup();

    const result = await saveTeacherCatalogueSubject('en', null, form({ name_ar: ' رياضيات ', name_en: ' Mathematics ' }));

    expect(rpc).toHaveBeenCalledWith('save_teacher_subject', {
      p_id: null,
      p_name_ar: 'رياضيات',
      p_name_en: 'Mathematics',
    });
    expect(result).toMatchObject({ id: subjectId, row: { id: subjectId, name_en: 'Mathematics' }, success: expect.any(String) });
  });

  it('accepts a one-language label and localizes a foreign or archived row refusal', async () => {
    const { rpc } = setup({ rpcData: null, rpcError: { message: 'active owned subject not found' } });

    const result = await saveTeacherCatalogueSubject('ar', null, form({ id: subjectId, name_ar: '', name_en: 'Physics' }));

    expect(rpc).toHaveBeenCalledWith('save_teacher_subject', expect.objectContaining({ p_name_ar: '', p_name_en: 'Physics' }));
    expect(result?.error).toMatch(/تعذر حفظ هذا العنصر/);
    expect(result?.error).not.toMatch(/owned subject/);
  });

  it('preserves immutable category kind and localizes a server refusal', async () => {
    const { rpc } = setup({ rpcData: null, rpcError: { message: 'active owned category not found' } });

    const result = await saveTeacherCatalogueCategory('ar', null, form({ id: subjectId, kind: 'student_category', name_ar: 'طلاب', name_en: '' }));

    expect(rpc).toHaveBeenCalledWith('save_teacher_category', expect.objectContaining({ p_id: subjectId, p_kind: 'student_category' }));
    expect(result?.error).toMatch(/تعذر حفظ|لم تعد/);
    expect(result?.success).toBeUndefined();
  });

  it('does not claim success when the RPC returns no saved ID', async () => {
    setup({ rpcData: null });

    const result = await saveTeacherCatalogueSubject('en', null, form({ name_ar: '', name_en: 'Physics' }));

    expect(result?.success).toBeUndefined();
    expect(result?.error).toBeTruthy();
  });

  it('does not return a row outside the live teacher ownership filter', async () => {
    setup({ row: { id: subjectId, owner_teacher_id: '33333333-3333-4333-8333-333333333333', archived_at: null, name_ar: 'فيزياء', name_en: 'Physics' } });

    const result = await saveTeacherCatalogueSubject('en', null, form({ name_ar: 'فيزياء', name_en: 'Physics' }));

    expect(result?.success).toBeUndefined();
    expect(result?.row).toBeUndefined();
  });

  it('sends explicit archive state and kind to the RPC', async () => {
    const { rpc } = setup({ rpcData: null });

    const result = await setTeacherCatalogueArchived('en', null, form({ kind: 'subject', id: subjectId, archived: 'true' }));

    expect(rpc).toHaveBeenCalledWith('set_teacher_catalogue_archived', { p_kind: 'subject', p_id: subjectId, p_archived: true });
    expect(result?.success).toMatch(/archived/i);
  });
});

describe('teacher catalogue choices', () => {
  it('keeps active shared and owned choices, and removes publicly readable foreign and archived rows', () => {
    const sharedSubject = { id: 'shared-subject', owner_teacher_id: null, archived_at: null, name_ar: 'رياضيات', name_en: 'Math' };
    const ownSubject = { id: 'own-subject', owner_teacher_id: teacherId, archived_at: null, name_ar: 'علوم', name_en: 'Science' };
    const nodes = [
      { id: 'system', owner_teacher_id: null, archived_at: null, parent_id: null, kind: 'system', name_ar: 'مدرسة', name_en: 'School' },
      { id: 'grade', owner_teacher_id: null, archived_at: null, parent_id: 'system', kind: 'grade', name_ar: 'الصف العاشر', name_en: 'Grade 10' },
      { id: 'own-year', owner_teacher_id: teacherId, archived_at: null, parent_id: null, kind: 'custom_year', name_ar: 'سنة أولى', name_en: 'Year One' },
      { id: 'foreign-year', owner_teacher_id: '33333333-3333-4333-8333-333333333333', archived_at: null, parent_id: null, kind: 'custom_year', name_ar: 'سنة خاصة', name_en: 'Private year' },
      { id: 'archived-grade', owner_teacher_id: null, archived_at: '2026-01-01T00:00:00Z', parent_id: null, kind: 'grade', name_ar: 'قديم', name_en: 'Archived grade' },
    ];
    const offerings = [
      { id: 'shared-offering', owner_teacher_id: null, archived_at: null, node_id: 'grade', subject_id: sharedSubject.id },
      { id: 'own-offering', owner_teacher_id: teacherId, archived_at: null, node_id: 'own-year', subject_id: ownSubject.id },
      { id: 'foreign-offering', owner_teacher_id: '33333333-3333-4333-8333-333333333333', archived_at: null, node_id: 'grade', subject_id: sharedSubject.id },
      { id: 'archived-offering', owner_teacher_id: teacherId, archived_at: '2026-01-01T00:00:00Z', node_id: 'grade', subject_id: sharedSubject.id },
      { id: 'foreign-node-offering', owner_teacher_id: teacherId, archived_at: null, node_id: 'foreign-year', subject_id: sharedSubject.id },
      { id: 'archived-node-offering', owner_teacher_id: teacherId, archived_at: null, node_id: 'archived-grade', subject_id: sharedSubject.id },
    ];

    const choices = filterTeacherCatalogueChoices(
      [sharedSubject, ownSubject, { id: 'foreign-subject', owner_teacher_id: '33333333-3333-4333-8333-333333333333', archived_at: null, name_ar: 'خاص', name_en: 'Private' }],
      nodes,
      offerings,
      teacherId,
    );

    expect(choices.subjects.map(row => row.id)).toEqual(['shared-subject', 'own-subject']);
    expect(choices.nodes.map(row => row.id).sort()).toEqual(['grade', 'own-year', 'system']);
    expect(choices.offerings.map(row => row.id).sort()).toEqual(['own-offering', 'shared-offering']);
  });
});
