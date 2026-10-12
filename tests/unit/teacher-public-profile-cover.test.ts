import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, publicGroupsMock, readTeacherCoverMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  publicGroupsMock: vi.fn(),
  readTeacherCoverMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/features/teacher/data', () => ({ teacherViewer: vi.fn() }));
vi.mock('@/features/platform/data', () => ({ publicGroups: publicGroupsMock }));
vi.mock('@/features/teacher/profile-cover-data', () => ({ readTeacherCover: readTeacherCoverMock }));
vi.mock('@/features/teacher/profile-details-data', () => ({
  safePublicTeacherProfileDetails: vi.fn(() => null),
  teacherProfileDetails: vi.fn(),
}));

import { publicTeacherDetail } from '@/features/teacher/profile-data';

const teacherId = '34000000-0000-4000-8000-000000000001';

function query(result: { data?: unknown; error?: unknown }) {
  let filter: { column: string; values: unknown[] } | null = null;
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn((column: string, values: unknown[]) => { filter = { column, values }; return builder; }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = Array.isArray(result.data) && filter
        ? result.data.filter((row: Record<string, unknown>) => filter?.values.includes(row[filter.column]))
        : result.data;
      return Promise.resolve({ ...result, data: rows }).then(resolve, reject);
    },
  };
  return builder;
}

function setup(coverPath: string | null, fixture?: { offeringId: string; subjectId: string; nodeId: string }) {
  const emptyRows = { data: [], error: null };
  const teacher = { id: teacherId, full_name: 'Cover Teacher', headline: null, avatar_path: null };
  const offeringId = fixture?.offeringId ?? 'offering-1';
  const subjectId = fixture?.subjectId ?? 'subject-1';
  const nodeId = fixture?.nodeId ?? 'node-1';
  const rows: Record<string, unknown[]> = {
    offerings: fixture ? [{ id: offeringId, node_id: nodeId, subject_id: subjectId }] : [],
    subjects: fixture ? [{ id: subjectId, name_ar: 'رياضيات', name_en: 'Math' }, { id: 'unrelated-subject', name_ar: 'خارج', name_en: 'Unrelated' }] : [],
    education_nodes: fixture ? [
      { id: nodeId, parent_id: 'parent-node', kind: 'stage', name_ar: 'مرحلة', name_en: 'Stage' },
      { id: 'parent-node', parent_id: nodeId, kind: 'grade', name_ar: 'صف', name_en: 'Grade' },
      { id: 'unrelated-node', parent_id: null, kind: 'stage', name_ar: 'آخر', name_en: 'Other' },
    ] : [],
  };
  const db = {
    rpc: vi.fn((name: string) => {
      if (name === 'public_teachers') return query({ data: teacher, error: null });
      if (name === 'public_teacher_specializations') return Promise.resolve({ data: fixture ? [{ offering_id: offeringId }] : [], error: null });
      if (name === 'public_teacher_profile_details') return Promise.resolve({ data: null, error: null });
      if (name === 'public_teacher_cover_path') return Promise.resolve({ data: coverPath, error: null });
      throw new Error(`Unexpected RPC: ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table === 'teacher_contacts') return query({ data: null, error: null });
      if (table in rows) return query({ data: rows[table], error: null });
      throw new Error(`Unexpected table query: ${table}`);
    }),
  };
  createClientMock.mockResolvedValue(db);
  publicGroupsMock.mockResolvedValue({ data: [], error: null });
  readTeacherCoverMock.mockImplementation(async (_client: unknown, path: string | null) => path ? 'signed-cover-url' : null);
  return db;
}

describe('public teacher profile cover projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the RPC scalar reference to cover signing without querying teacher_profiles', async () => {
    const coverPath = `${teacherId}/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    const db = setup(coverPath);

    const result = await publicTeacherDetail('en', teacherId);

    expect(readTeacherCoverMock).toHaveBeenCalledWith(db, coverPath);
    expect(result.visitor?.coverUrl).toBe('signed-cover-url');
    expect(db.rpc).toHaveBeenCalledWith('public_teacher_cover_path', { p_teacher_id: teacherId });
    expect(db.from).not.toHaveBeenCalledWith('teacher_profiles');
  });

  it('passes the null RPC result through without attempting a raw profile query', async () => {
    const db = setup(null);

    const result = await publicTeacherDetail('en', teacherId);

    expect(readTeacherCoverMock).toHaveBeenCalledWith(db, null);
    expect(result.visitor?.coverUrl).toBeNull();
    expect(db.from).not.toHaveBeenCalledWith('teacher_profiles');
  });

  it('loads only referenced public specialization rows and their ancestor chain, stopping at cycles', async () => {
    const db = setup(null, { offeringId: 'offering-public', subjectId: 'subject-public', nodeId: 'node-public' });

    const result = await publicTeacherDetail('en', teacherId);

    expect(result.error).toBeNull();
    expect(result.visitor?.specializations).toEqual([{ id: 'offering-public', subject: 'Math', context: 'Grade › Stage' }]);
    const offeringLookup = db.from.mock.results.find((entry, index) => db.from.mock.calls[index]?.[0] === 'offerings')?.value;
    expect(offeringLookup.select).toHaveBeenCalledWith('id,node_id,subject_id');
    expect(offeringLookup.in).toHaveBeenCalledWith('id', ['offering-public']);
    const nodeLookups = db.from.mock.results.flatMap((entry, index) => db.from.mock.calls[index]?.[0] === 'education_nodes' ? [entry.value] : []);
    expect(nodeLookups).toHaveLength(2);
    expect(nodeLookups.map(lookup => lookup.in.mock.calls[0][1])).toEqual([['node-public'], ['parent-node']]);
    expect(db.from).not.toHaveBeenCalledWith('teacher_profiles');
  });
});
