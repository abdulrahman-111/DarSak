import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/features/student/data', () => ({ viewer: mocks.viewer }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { saveStudentMatchingPreferences } from '@/features/student-matching/actions';

const id = '11111111-1111-4111-8111-111111111111';
const updatedAt = '2026-10-20T10:00:00.123456+00:00';
function form(values: { days: string[]; expected?: string }) {
  const value = new FormData();
  for (const day of values.days) value.append('preferred_weekdays', day);
  value.set('expected_updated_at', values.expected ?? updatedAt);
  return value;
}
function viewerSetup({ stale = false } = {}) {
  const rpc = vi.fn(async () => ({
    data: { preferred_weekdays: [1, 5], updated_at: '2026-10-21T11:00:00Z' },
    error: null,
  }));
  const db = {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: { preferred_weekdays: [2], updated_at: stale ? '2026-10-20T11:00:00Z' : updatedAt },
          error: null,
        }),
      };
      return builder;
    },
    rpc,
  };
  mocks.viewer.mockResolvedValue({ db, id, role: 'student', status: 'active' });
  return { rpc };
}

describe('student matching preference action', () => {
  beforeEach(() => {
    mocks.viewer.mockReset();
    mocks.revalidatePath.mockReset();
  });

  it('saves optional weekdays through the versioned RPC and refreshes both locales', async () => {
    const { rpc } = viewerSetup();
    const result = await saveStudentMatchingPreferences('en', null, form({ days: ['5', '1'] }));
    expect(rpc).toHaveBeenCalledWith('save_student_matching_preferences', {
      p_preferred_weekdays: [1, 5],
      p_expected_updated_at: updatedAt,
    });
    expect(result?.success).toContain('saved');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ar/student/recommendations');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/account/learning-profile');
  });

  it('returns stale feedback without writing when another profile save changed the version', async () => {
    const { rpc } = viewerSetup({ stale: true });
    const result = await saveStudentMatchingPreferences('en', null, form({ days: ['1'] }));
    expect(result?.error).toMatch(/changed in another tab/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts clearing every optional weekday', async () => {
    const { rpc } = viewerSetup();
    await saveStudentMatchingPreferences('ar', null, form({ days: [] }));
    expect(rpc).toHaveBeenCalledWith('save_student_matching_preferences', {
      p_preferred_weekdays: [],
      p_expected_updated_at: updatedAt,
    });
  });
});
