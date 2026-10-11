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

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function setup(coverPath: string | null) {
  const emptyRows = { data: [], error: null };
  const teacher = { id: teacherId, full_name: 'Cover Teacher', headline: null, avatar_path: null };
  const db = {
    rpc: vi.fn((name: string) => {
      if (name === 'public_teachers') return query({ data: teacher, error: null });
      if (name === 'public_teacher_specializations') return Promise.resolve(emptyRows);
      if (name === 'public_teacher_profile_details') return Promise.resolve({ data: null, error: null });
      if (name === 'public_teacher_cover_path') return Promise.resolve({ data: coverPath, error: null });
      throw new Error(`Unexpected RPC: ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table === 'teacher_contacts') return query({ data: null, error: null });
      if (table === 'education_nodes' || table === 'subjects') return query(emptyRows);
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
});
