import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/action-diagnostics', () => ({ logActionFailure: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { addMaterial, deleteMaterial, uploadMaterial } from '@/features/teacher/actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const lessonId = '22222222-2222-4222-8222-222222222222';
const materialId = '33333333-3333-4333-8333-333333333333';
const path = `${teacherId}/${lessonId}/file.pdf`;

function setup(
  options: {
    objectPath?: string | null;
    removeData?: Array<{ name: string }> | null;
    removeError?: unknown;
    listData?: Array<{ name: string }> | null;
    listContainsMatch?: boolean;
    insertError?: unknown;
    ownedLesson?: boolean;
    metadataOnInsertError?: boolean;
    readbackError?: unknown;
  } = {},
) {
  const calls: string[] = [];
  const eqCalls: Array<[unknown, unknown]> = [];
  let insertedPath: string | undefined;
  const select = vi.fn((fields: string) => {
    const result = fields.includes('role,')
      ? { data: { role: 'teacher', status: 'active' }, error: null }
      : fields.includes('group:')
        ? { data: options.ownedLesson === false ? null : { id: lessonId }, error: null }
        : fields.includes('storage_path') && options.insertError && options.metadataOnInsertError
          ? { data: { storage_path: insertedPath }, error: null }
          : fields.includes('storage_path') && options.insertError && options.readbackError
            ? { data: null, error: options.readbackError }
            : {
                data:
                  options.objectPath === undefined
                    ? { storage_path: path }
                    : options.objectPath
                      ? { storage_path: options.objectPath }
                      : null,
                error: null,
              };
    const chain = {
      eq: (column: unknown, value: unknown) => {
        eqCalls.push([column, value]);
        return chain;
      },
      single: async () => result,
      maybeSingle: async () => result,
    };
    return chain;
  });
  const upload = vi.fn(async () => ({ data: { path }, error: null }));
  const storage = {
    upload,
    remove: async () => {
      calls.push('storage');
      return { data: options.removeData ?? [{ name: path }], error: options.removeError ?? null };
    },
    list: async (_parent: string, query: { search: string }) => ({
      data:
        options.listData !== undefined
          ? options.listData
          : options.listContainsMatch
            ? [{ name: query.search }]
            : [],
      error: null,
    }),
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from: (table: string) => ({
      select,
      insert: async (row: { storage_path?: string }) => {
        insertedPath = row.storage_path;
        return { error: options.insertError ?? null };
      },
      delete: () => ({
        eq: async () => {
          calls.push('metadata');
          return { error: null };
        },
      }),
    }),
    rpc: async () => ({
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
    }),
    storage: { from: () => storage },
  };
  createClientMock.mockResolvedValue(db);
  return { calls, eqCalls, select, upload };
}

describe('lesson material actions', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('filters ownership through the embedded group alias before adding a link', async () => {
    const { eqCalls, select } = setup();
    const form = new FormData();
    form.set('kind', 'link');
    form.set('title', 'Reference');
    form.set('url', 'https://example.com');

    expect(await addMaterial('en', lessonId, null, form)).toMatchObject({
      success: 'Material added.',
    });
    expect(select).toHaveBeenCalledWith('id,group:groups!inner(teacher_id)');
    expect(eqCalls).toContainEqual(['group.teacher_id', teacherId]);
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/materials');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/teacher/lessons/[id]', 'page');
  });

  it('does not invalidate routes when material insertion fails', async () => {
    setup({ insertError: { message: 'failed' } });
    const form = new FormData();
    form.set('kind', 'link');
    form.set('title', 'Reference');
    form.set('url', 'https://example.com');

    expect(await addMaterial('en', lessonId, null, form)).toMatchObject({
      error: 'Could not add the material.',
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('rejects new standalone notes so launch resources stay link-only', async () => {
    setup();
    const form = new FormData();
    form.set('kind', 'note');
    form.set('title', 'Reminder');
    form.set('content', 'Bring the worksheet.');

    expect(await addMaterial('en', lessonId, null, form)).toMatchObject({
      error: 'New lesson resources can only be links.',
    });
  });

  it('rejects a foreign lesson before inserting any material', async () => {
    const { select } = setup({ ownedLesson: false });
    const form = new FormData();
    form.set('kind', 'link');
    form.set('title', 'Reference');
    form.set('url', 'https://example.com');

    expect(await addMaterial('en', lessonId, null, form)).toMatchObject({
      error: 'Lesson not found.',
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('removes and confirms the exact file before deleting metadata', async () => {
    const { calls } = setup();

    expect(await deleteMaterial('en', lessonId, materialId)).toEqual({ ok: true });
    expect(calls).toEqual(['storage', 'metadata']);
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student/classes/[id]', 'page');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/timetable');
  });

  it('allows retry when the object was removed earlier but metadata remains', async () => {
    const { calls } = setup({ removeData: [], listData: [] });

    expect(await deleteMaterial('en', lessonId, materialId)).toEqual({ ok: true });
    expect(calls).toEqual(['storage', 'metadata']);
  });

  it('keeps metadata when Storage does not confirm removal', async () => {
    const { calls } = setup({ removeData: [], listData: [{ name: 'file.pdf' }] });

    expect(await deleteMaterial('en', lessonId, materialId)).toMatchObject({
      error: expect.stringMatching(/retry/i),
    });
    expect(calls).toEqual(['storage']);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('does not treat an unavailable listing as proof that an object is absent', async () => {
    const { calls } = setup({ removeData: [], listData: null });

    expect(await deleteMaterial('en', lessonId, materialId)).toMatchObject({
      error: expect.stringMatching(/retry/i),
    });
    expect(calls).toEqual(['storage']);
  });

  it('keeps metadata when Storage removal returns an error', async () => {
    const { calls } = setup({ removeError: new Error('storage denied') });

    expect(await deleteMaterial('en', lessonId, materialId)).toMatchObject({
      error: expect.stringMatching(/retry/i),
    });
    expect(calls).toEqual(['storage']);
  });

  it('rejects binary uploads before reading the form or calling Storage', async () => {
    const { upload } = setup();
    const form = {
      get: () => {
        throw new Error('form should not be inspected');
      },
    } as unknown as FormData;

    expect(await uploadMaterial('en', lessonId, null, form)).toMatchObject({
      error: expect.stringMatching(/uploads are unavailable.*link or lesson note/i),
    });
    expect(upload).not.toHaveBeenCalled();
  });
});
