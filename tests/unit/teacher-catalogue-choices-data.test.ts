import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { teacherCatalogueChoices } from '@/features/teacher/catalogue-data';

const teacherId = 'teacher-a';

function database(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  const from = vi.fn();
  return { db: { rpc, from } as never, rpc, from };
}

describe('teacher catalogue choice loader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses one RPC and keeps archived shared ancestors for the existing filter', async () => {
    const { db, rpc, from } = database({
      data: {
        subjects: [
          {
            id: 'subject',
            owner_teacher_id: null,
            archived_at: null,
            name_ar: 'رياضيات',
            name_en: 'Math',
          },
        ],
        nodes: [
          {
            id: 'parent',
            owner_teacher_id: null,
            archived_at: '2026-01-01',
            parent_id: null,
            kind: 'system',
            name_ar: 'مرحلة',
            name_en: 'Stage',
          },
          {
            id: 'child',
            owner_teacher_id: null,
            archived_at: null,
            parent_id: 'parent',
            kind: 'grade',
            name_ar: 'صف',
            name_en: 'Grade',
          },
        ],
        offerings: [
          {
            id: 'offering',
            owner_teacher_id: null,
            archived_at: null,
            node_id: 'child',
            subject_id: 'subject',
          },
        ],
      },
      error: null,
    });

    await expect(teacherCatalogueChoices(db, teacherId)).resolves.toMatchObject({
      subjects: [{ id: 'subject' }],
      nodes: [{ id: 'parent' }, { id: 'child' }],
      offerings: [{ id: 'offering' }],
      error: { error: false },
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('teacher_catalogue_choices');
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: { subjects: [], nodes: [], offerings: [], extra: true }, error: null },
    {
      data: {
        subjects: [
          {
            id: 's',
            owner_teacher_id: null,
            archived_at: null,
            name_ar: '',
            name_en: '',
            secret: 'x',
          },
        ],
        nodes: [],
        offerings: [],
      },
      error: null,
    },
    { data: { subjects: [], nodes: [], offerings: [] }, error: { message: 'failed' } },
  ])('fails closed for malformed or failed RPC results', async result => {
    const { db } = database(result);
    await expect(teacherCatalogueChoices(db, teacherId)).resolves.toEqual({
      subjects: [],
      nodes: [],
      offerings: [],
      error: { error: true },
    });
  });

  it('accepts empty arrays as an empty catalogue', async () => {
    const { db } = database({ data: { subjects: [], nodes: [], offerings: [] }, error: null });
    await expect(teacherCatalogueChoices(db, teacherId)).resolves.toEqual({
      subjects: [],
      nodes: [],
      offerings: [],
      error: { error: false },
    });
  });

  it('fails closed if the RPC promise rejects', async () => {
    const { db } = database(null);
    const rpc = vi.fn().mockRejectedValue(new Error('transport failed'));
    (db as { rpc: typeof rpc }).rpc = rpc;
    await expect(teacherCatalogueChoices(db, teacherId)).resolves.toEqual({
      subjects: [],
      nodes: [],
      offerings: [],
      error: { error: true },
    });
  });

  it('returns complete arrays from a large RPC payload without client-side truncation', async () => {
    const size = 1_025;
    const subjects = Array.from({ length: size }, (_, i) => ({
      id: `subject-${i}`,
      owner_teacher_id: null,
      archived_at: null,
      name_ar: `مادة ${i}`,
      name_en: `Subject ${i}`,
    }));
    const { db } = database({ data: { subjects, nodes: [], offerings: [] }, error: null });
    const result = await teacherCatalogueChoices(db, teacherId);
    expect(result.subjects).toHaveLength(size);
    expect(result.subjects.at(-1)?.id).toBe(`subject-${size - 1}`);
  });
});
