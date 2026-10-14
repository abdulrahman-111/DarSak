import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/action-diagnostics', () => ({ logActionFailure: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { addMaterial, deleteMaterial, uploadMaterial } from '@/features/teacher/actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const lessonId = '22222222-2222-4222-8222-222222222222';
const materialId = '33333333-3333-4333-8333-333333333333';
const path = `${teacherId}/${lessonId}/file.pdf`;

function setup(options: { objectPath?: string | null; removeData?: Array<{ name: string }> | null; removeError?: unknown; listData?: Array<{ name: string }> | null; listContainsMatch?: boolean; insertError?: unknown; ownedLesson?: boolean } = {}) {
  const calls: string[] = [];
  const eqCalls: Array<[unknown, unknown]> = [];
  const select = vi.fn((fields: string) => {
    const result = fields.includes('role,')
      ? { data: { role: 'teacher', status: 'active' }, error: null }
      : fields.includes('group:')
        ? { data: options.ownedLesson === false ? null : { id: lessonId }, error: null }
        : { data: options.objectPath === undefined ? { storage_path: path } : options.objectPath ? { storage_path: options.objectPath } : null, error: null };
    const chain = { eq: (column: unknown, value: unknown) => { eqCalls.push([column, value]); return chain; }, single: async () => result, maybeSingle: async () => result };
    return chain;
  });
  const storage = {
    upload: async () => ({ data: { path }, error: null }),
    remove: async () => { calls.push('storage'); return { data: options.removeData ?? [{ name: path }], error: options.removeError ?? null }; },
    list: async (_parent: string, query: { search: string }) => ({ data: options.listData !== undefined ? options.listData : (options.listContainsMatch ? [{ name: query.search }] : []), error: null }),
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from: (table: string) => ({
      select,
      insert: async () => ({ error: options.insertError ?? null }),
      delete: () => ({ eq: async () => { calls.push('metadata'); return { error: null }; } }),
    }),
    storage: { from: () => storage },
  };
  createClientMock.mockResolvedValue(db);
  return { calls, eqCalls, select };
}

describe('lesson material actions', () => {
  beforeEach(() => { createClientMock.mockReset(); revalidatePathMock.mockReset(); });

  it('filters ownership through the embedded group alias before adding a link', async () => {
    const { eqCalls, select } = setup();
    const form = new FormData();
    form.set('kind', 'link'); form.set('title', 'Reference'); form.set('url', 'https://example.com');

    expect(await addMaterial('en', lessonId, null, form)).toMatchObject({ success: 'Material added.' });
    expect(select).toHaveBeenCalledWith('id,group:groups!inner(teacher_id)');
    expect(eqCalls).toContainEqual(['group.teacher_id', teacherId]);
  });

  it('rejects a foreign lesson before inserting any material', async () => {
    const { select } = setup({ ownedLesson: false });
    const form = new FormData();
    form.set('kind', 'link'); form.set('title', 'Reference'); form.set('url', 'https://example.com');

    expect(await addMaterial('en', lessonId, null, form)).toMatchObject({ error: 'Lesson not found.' });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('removes and confirms the exact file before deleting metadata', async () => {
    const { calls } = setup();

    expect(await deleteMaterial('en', lessonId, materialId)).toEqual({ ok: true });
    expect(calls).toEqual(['storage', 'metadata']);
  });

  it('allows retry when the object was removed earlier but metadata remains', async () => {
    const { calls } = setup({ removeData: [], listData: [] });

    expect(await deleteMaterial('en', lessonId, materialId)).toEqual({ ok: true });
    expect(calls).toEqual(['storage', 'metadata']);
  });

  it('keeps metadata when Storage does not confirm removal', async () => {
    const { calls } = setup({ removeData: [], listData: [{ name: 'file.pdf' }] });

    expect(await deleteMaterial('en', lessonId, materialId)).toMatchObject({ error: expect.stringMatching(/retry/i) });
    expect(calls).toEqual(['storage']);
  });

  it('does not treat an unavailable listing as proof that an object is absent', async () => {
    const { calls } = setup({ removeData: [], listData: null });

    expect(await deleteMaterial('en', lessonId, materialId)).toMatchObject({ error: expect.stringMatching(/retry/i) });
    expect(calls).toEqual(['storage']);
  });

  it('keeps metadata when Storage removal returns an error', async () => {
    const { calls } = setup({ removeError: new Error('storage denied') });

    expect(await deleteMaterial('en', lessonId, materialId)).toMatchObject({ error: expect.stringMatching(/retry/i) });
    expect(calls).toEqual(['storage']);
  });

  it('reports incomplete compensation when a failed insert leaves the object', async () => {
    setup({ insertError: new Error('insert failed'), removeData: [], listContainsMatch: true });
    const form = new FormData();
    form.set('title', 'worksheet');
    form.set('file', new File(['%PDF-1.4'], 'file.pdf', { type: 'application/pdf' }));

    expect(await uploadMaterial('en', lessonId, null, form)).toMatchObject({ error: expect.stringMatching(/cleanup is incomplete/i) });
  });
});
