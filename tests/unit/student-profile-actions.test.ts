import { beforeEach, describe, expect, it, vi } from 'vitest';

const { viewerMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  viewerMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock('@/features/student/data', () => ({ viewer: viewerMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import { saveStudentLearningProfile } from '@/features/student/student-profile-actions';

const studentId = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-10-16T10:00:00.123456+00:00';
const values = {
  full_name: ' Noor Learner ',
  age_range: '13_15',
  education_year: 'Year 8',
  interests: 'Math, قراءة',
  learning_goal: 'I want to understand science.',
  school_name: '',
  expected_updated_at: timestamp,
};
function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}
function result() {
  return {
    full_name: 'Noor Learner',
    age_range: '13_15',
    education_year: 'Year 8',
    interests: ['Math', 'قراءة'],
    learning_goal: 'I want to understand science.',
    school_name: '',
    onboarding_required: false,
    onboarding_completed_at: timestamp,
    updated_at: timestamp,
  };
}
function setup({
  expected = timestamp,
  rpcError = null,
}: { expected?: string; rpcError?: { code: string; message: string } | null } = {}) {
  const rpc = vi.fn(async () => ({ data: result(), error: rpcError }));
  const selects: string[] = [];
  const db = {
    from: (table: string) => {
      const builder = {
        select: (columns: string) => {
          selects.push(`${table}:${columns}`);
          return builder;
        },
        eq: () => builder,
        maybeSingle: async () => ({ data: { updated_at: expected }, error: null }),
        update: () => {
          throw new Error('Direct table writes are forbidden');
        },
      };
      return builder;
    },
    rpc,
  };
  viewerMock.mockResolvedValue({ db, id: studentId, role: 'student', status: 'active' });
  return { rpc, selects };
}
const redirectTarget = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return (error as Error).message.replace('NEXT_REDIRECT:', '');
  }
  return null;
};

describe('student learning profile save action', () => {
  beforeEach(() => {
    viewerMock.mockReset();
    revalidatePathMock.mockReset();
    redirectMock.mockClear();
  });

  it('validates before loading the viewer and returns field errors with the entries', async () => {
    const data = form({ ...values, interests: '' });
    const saved = await saveStudentLearningProfile('en', null, data);
    expect(saved?.fieldErrors).toMatchObject({ interests: 'invalid' });
    expect(saved?.values?.full_name).toBe(values.full_name);
    expect(viewerMock).not.toHaveBeenCalled();
  });

  it('saves through the owner-scoped RPC with the canonical name and original CAS version', async () => {
    const { rpc, selects } = setup();
    const destination = await redirectTarget(() =>
      saveStudentLearningProfile('en', null, form(values)),
    );
    expect(destination).toBe('/en/student');
    expect(rpc).toHaveBeenCalledWith('save_student_learning_profile', {
      p_full_name: 'Noor Learner',
      p_age_range: '13_15',
      p_education_year: 'Year 8',
      p_interests: ['Math', 'قراءة'],
      p_learning_goal: 'I want to understand science.',
      p_school_name: '',
      p_expected_updated_at: timestamp,
    });
    expect(selects).toEqual(['student_profiles:updated_at']);
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/account/learning-profile');
    expect(revalidatePathMock).toHaveBeenCalledWith('/ar/student');
  });

  it('keeps the original version and typed fields visible when the profile changed elsewhere', async () => {
    const { rpc } = setup({ expected: '2026-10-16T11:00:00Z' });
    const saved = await saveStudentLearningProfile('en', null, form(values));
    expect(saved?.error).toMatch(/Refresh to review the latest version/i);
    expect(saved?.values?.full_name).toBe(values.full_name);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('retains form values for a concurrent CAS conflict reported by the RPC', async () => {
    setup({ rpcError: { code: 'PT409', message: 'student profile changed' } });
    const saved = await saveStudentLearningProfile('en', null, form(values));
    expect(saved?.error).toMatch(/Refresh to review the latest version/i);
    expect(saved?.values).toMatchObject({
      full_name: values.full_name,
      interests_text: values.interests,
    });
    expect(saved).not.toHaveProperty('updatedAt');
  });
});
