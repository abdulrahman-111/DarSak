import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), choices: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/teacher/data', () => ({ teacherIdentity: mocks.viewer }));
vi.mock('@/features/teacher/catalogue-data', () => ({ teacherCatalogueChoices: mocks.choices }));
vi.mock('@/features/teacher/setup-domain', () => ({ setupCatalogueChoices: () => [] }));
vi.mock('@/features/teacher/catalogue-domain', () => ({
  catalogueDisplayName: (row: { name_en: string }) => row.name_en,
}));

import { teacherGroupSetup } from '@/features/teacher/setup-data';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('teacher group setup independent reads', () => {
  it('starts schedule reads while the saved offering read is pending', async () => {
    const pendingOffering = deferred<{ data: unknown; error: null }>();
    const started = new Set<string>();
    const groupId = '22222222-2222-4222-8222-222222222222';
    const group = {
      id: groupId,
      teacher_id: 'teacher-1',
      name: 'Algebra',
      description: '',
      offering_id: 'offering-1',
      capacity: 10,
      location: '',
      status: 'draft',
      updated_at: null,
    };
    const rows = {
      groups: { data: group, error: null },
      teacher_profiles: { data: { approved: true }, error: null },
      subjects: {
        data: {
          id: 'subject-1',
          owner_teacher_id: null,
          archived_at: null,
          name_ar: 'رياضيات',
          name_en: 'Math',
        },
        error: null,
      },
      education_nodes: {
        data: {
          id: 'node-1',
          owner_teacher_id: null,
          archived_at: null,
          parent_id: null,
          kind: 'grade',
          name_ar: 'الصف',
          name_en: 'Grade',
        },
        error: null,
      },
    } as Record<string, { data: unknown; error: null }>;
    const db = {
      from: (table: string) => {
        const query: any = {
          select: () => query,
          eq: () => query,
          order: () => query,
          maybeSingle: () => {
            started.add(table);
            return table === 'offerings' ? pendingOffering.promise : Promise.resolve(rows[table]);
          },
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
            started.add(table);
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    };
    mocks.viewer.mockResolvedValue({ id: 'teacher-1', db });
    mocks.choices.mockResolvedValue({
      subjects: [],
      nodes: [],
      offerings: [],
      error: { error: null },
    });

    const result = teacherGroupSetup('en', groupId);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(started.has('teacher_profiles')).toBe(true);
    expect(started.has('group_schedule_slots')).toBe(true);
    expect(started.has('group_lesson_exclusions')).toBe(true);

    pendingOffering.resolve({
      data: {
        id: 'offering-1',
        owner_teacher_id: null,
        archived_at: null,
        subject_id: 'subject-1',
        node_id: 'node-1',
      },
      error: null,
    });
    await expect(result).resolves.toMatchObject({ group, error: null });
  });
});
