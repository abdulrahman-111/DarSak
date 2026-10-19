import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, publicGroupsMock, readTeacherCoverMock, createSignedUrlMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  publicGroupsMock: vi.fn(),
  readTeacherCoverMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
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

type SpecializationLabel = { offering_id: string; subject_name_ar: string; subject_name_en: string; context_ar: string; context_en: string };

function setup(coverPath: string | null, specializationRows: SpecializationLabel[] = [], avatarPath: string | null = null) {
  const teacher = { id: teacherId, full_name: 'Cover Teacher', headline: null, avatar_path: avatarPath };
  const db = {
    rpc: vi.fn((name: string) => {
      if (name === 'public_teachers') return query({ data: teacher, error: null });
      if (name === 'public_teacher_specialization_labels') return Promise.resolve({ data: specializationRows, error: null });
      if (name === 'public_teacher_profile_details') return Promise.resolve({ data: null, error: null });
      if (name === 'public_teacher_cover_path') return Promise.resolve({ data: coverPath, error: null });
      throw new Error(`Unexpected RPC: ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table === 'teacher_contacts') return query({ data: null, error: null });
      throw new Error(`Unexpected table query: ${table}`);
    }),
    storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
  };
  createClientMock.mockResolvedValue(db);
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'signed-avatar-url' }, error: null });
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

  it('loads public bilingual specialization labels through the narrow RPC without catalogue table reads', async () => {
    const db = setup(null, [{
      offering_id: 'offering-public',
      subject_name_ar: 'رياضيات',
      subject_name_en: 'Math',
      context_ar: 'جامعة › طلاب',
      context_en: 'University › Students',
    }]);

    const english = await publicTeacherDetail('en', teacherId);
    const arabic = await publicTeacherDetail('ar', teacherId);

    expect(english.error).toBeNull();
    expect(english.visitor?.specializations).toEqual([{ id: 'offering-public', subject: 'Math', context: 'University › Students' }]);
    expect(arabic.visitor?.specializations).toEqual([{ id: 'offering-public', subject: 'رياضيات', context: 'جامعة › طلاب' }]);
    expect(db.rpc).toHaveBeenCalledWith('public_teacher_specialization_labels', { p_teacher_id: teacherId });
    expect(db.from).not.toHaveBeenCalledWith('offerings');
    expect(db.from).not.toHaveBeenCalledWith('subjects');
    expect(db.from).not.toHaveBeenCalledWith('education_nodes');
    expect(db.from).not.toHaveBeenCalledWith('teacher_profiles');
  });

  it('falls back to available specialization labels for both locales', async () => {
    setup(null, [
      { offering_id: 'arabic-only', subject_name_ar: 'رياضيات', subject_name_en: '', context_ar: 'المرحلة الثانوية', context_en: '' },
      { offering_id: 'english-only', subject_name_ar: '', subject_name_en: 'Science', context_ar: '', context_en: 'Grade 8' },
    ]);

    const english = await publicTeacherDetail('en', teacherId);
    const arabic = await publicTeacherDetail('ar', teacherId);

    expect(english.visitor?.specializations).toEqual([
      { id: 'arabic-only', subject: 'رياضيات', context: 'المرحلة الثانوية' },
      { id: 'english-only', subject: 'Science', context: 'Grade 8' },
    ]);
    expect(arabic.visitor?.specializations).toEqual(english.visitor?.specializations);
  });

  it('starts public cover signing while avatar signing is still pending', async () => {
    let resolveAvatar!: (value: { data: { signedUrl: string }; error: null }) => void;
    setup('cover/path.webp', [], 'avatar/path.webp');
    createSignedUrlMock.mockReturnValue(new Promise(resolve => { resolveAvatar = resolve; }));

    const resultPromise = publicTeacherDetail('en', teacherId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(readTeacherCoverMock).toHaveBeenCalledWith(expect.anything(), 'cover/path.webp');
    resolveAvatar({ data: { signedUrl: 'signed-avatar-url' }, error: null });
    await expect(resultPromise).resolves.toMatchObject({ error: null, avatarUrl: 'signed-avatar-url' });
  });

  it('starts all six public profile reads before the teacher row resolves', async () => {
    const db = setup(null);
    let resolveTeacher!: (value: { data: unknown; error: null }) => void;
    db.rpc.mockImplementation((name: string) => {
      if (name === 'public_teachers') return {
        eq: vi.fn(() => ({ maybeSingle: () => new Promise(resolve => { resolveTeacher = resolve; }) })),
      };
      return name === 'public_teacher_specialization_labels'
        ? Promise.resolve({ data: [], error: null })
        : Promise.resolve({ data: null, error: null });
    });
    const pending = publicTeacherDetail('en', teacherId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(db.rpc).toHaveBeenCalledWith('public_teacher_profile_details', { p_teacher_id: teacherId });
    expect(db.rpc).toHaveBeenCalledWith('public_teacher_cover_path', { p_teacher_id: teacherId });
    expect(publicGroupsMock).toHaveBeenCalled();
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining([
      'public_teachers', 'public_teacher_specialization_labels', 'public_teacher_profile_details', 'public_teacher_cover_path',
    ]));
    resolveTeacher({ data: { id: teacherId, full_name: 'Cover Teacher', headline: null, avatar_path: null }, error: null });
    await expect(pending).resolves.toMatchObject({ error: null });
  });
});
