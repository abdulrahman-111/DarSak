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
          archived_at: '2026-01-01T00:00:00Z',
          name_ar: 'رياضيات',
          name_en: 'Math',
        },
        error: null,
      },
      education_nodes: {
        data: {
          id: 'node-1',
          owner_teacher_id: null,
          archived_at: '2026-01-01T00:00:00Z',
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
    await expect(result).resolves.toMatchObject({
      group,
      error: null,
      catalogue: {
        retained: { label: 'Math · Grade' },
        subjects: [{ id: 'subject-1', archived_at: '2026-01-01T00:00:00Z' }],
        nodes: [{ id: 'node-1', archived_at: '2026-01-01T00:00:00Z' }],
      },
    });
  });

  it('reuses a complete saved catalogue selection without selected-row queries', async () => {
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
    const rows: Record<string, { data: unknown; error: null }> = {
      groups: { data: group, error: null },
      teacher_profiles: { data: { approved: true }, error: null },
    };
    const db = {
      from: (table: string) => {
        started.add(table);
        const query: any = {
          select: () => query,
          eq: () => query,
          order: () => query,
          maybeSingle: () => Promise.resolve(rows[table] ?? { data: [], error: null }),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
        return query;
      },
    };
    mocks.viewer.mockResolvedValue({ id: 'teacher-1', db });
    mocks.choices.mockResolvedValue({
      subjects: [
        {
          id: 'subject-1',
          owner_teacher_id: null,
          archived_at: null,
          name_ar: 'رياضيات',
          name_en: 'Math',
        },
      ],
      nodes: [
        {
          id: 'node-1',
          owner_teacher_id: null,
          archived_at: null,
          parent_id: null,
          kind: 'grade',
          name_ar: 'الصف',
          name_en: 'Grade',
        },
      ],
      offerings: [
        {
          id: 'offering-1',
          owner_teacher_id: null,
          archived_at: null,
          subject_id: 'subject-1',
          node_id: 'node-1',
        },
      ],
      error: { error: false },
    });

    const result = await teacherGroupSetup('en', groupId);

    expect(result).toMatchObject({ group, error: null, values: { subject_id: 'subject-1' } });
    expect(started).not.toContain('offerings');
    expect(started).not.toContain('subjects');
    expect(started).not.toContain('education_nodes');
  });

  it.each([
    ['missing saved offering', { data: null, error: null }],
    [
      'foreign saved offering',
      {
        data: {
          id: 'offering-1',
          owner_teacher_id: 'another-teacher',
          archived_at: null,
          subject_id: 'subject-1',
          node_id: 'node-1',
        },
        error: null,
      },
    ],
  ])('fails closed for %s when the catalogue row is unavailable', async (_case, offering) => {
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
    const rows: Record<string, { data: unknown; error: null }> = {
      groups: { data: group, error: null },
      offerings: offering,
      teacher_profiles: { data: { approved: true }, error: null },
    };
    const db = {
      from: (table: string) => {
        const query: any = {
          select: () => query,
          eq: () => query,
          order: () => query,
          maybeSingle: () => Promise.resolve(rows[table] ?? { data: [], error: null }),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
        return query;
      },
    };
    mocks.viewer.mockResolvedValue({ id: 'teacher-1', db });
    mocks.choices.mockResolvedValue({
      subjects: [],
      nodes: [],
      offerings: [],
      error: { error: false },
    });

    await expect(teacherGroupSetup('en', groupId)).resolves.toMatchObject({
      group: null,
      error: 'Could not load group setup or its saved catalogue items. Please try again.',
    });
  });
});
