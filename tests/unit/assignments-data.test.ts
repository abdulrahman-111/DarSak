import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ student: vi.fn(), teacherIdentity: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/student/data', () => ({ student: mocks.student }));
vi.mock('@/features/teacher/data', () => ({ teacherIdentity: mocks.teacherIdentity }));

import { getStudentAssignmentPage } from '@/features/assignments/data';

const id = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';

describe('assignment data loaders', () => {
  beforeEach(() => vi.resetAllMocks());

  it('clamps an out-of-range page and refetches with bounded page arguments', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { rows: [], total: 21 }, error: null })
      .mockResolvedValueOnce({ data: { rows: [], total: 21 }, error: null });
    mocks.student.mockResolvedValue({ db: { rpc } });
    const result = await getStudentAssignmentPage('en', id, 4);
    expect(result).toMatchObject({ page: 2, pageCount: 2, total: 21, error: null });
    expect(rpc).toHaveBeenNthCalledWith(1, 'student_assignment_page', {
      p_group_id: id,
      p_offset: 60,
      p_limit: 20,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'student_assignment_page', {
      p_group_id: id,
      p_offset: 20,
      p_limit: 20,
    });
  });

  it('returns RPC errors rather than silently treating them as an empty page', async () => {
    const error = { message: 'permission denied' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    mocks.student.mockResolvedValue({ db: { rpc } });
    const result = await getStudentAssignmentPage('en', id, 1);
    expect(result.error).toBe(error);
    expect(result.rows).toEqual([]);
  });
});
