import { beforeEach, describe, it, expect, vi } from 'vitest';
const { student } = vi.hoisted(() => ({ student: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/student/data', () => ({ student }));
import { studentClassWorkspace } from '@/features/student/class-workspace-data';
const id = '44444444-4444-4444-8444-444444444444';
beforeEach(() => vi.clearAllMocks());
describe('student private class boundary', () => {
  it('stops all lesson, resource and contact reads when membership is not accepted', async () => {
    const from = vi.fn();
    student.mockResolvedValue({
      id: 'student',
      db: { rpc: vi.fn(async () => ({ data: null, error: null })), from },
    });
    expect(await studentClassWorkspace('en', id, { view: 'teacher' })).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it('reports an overview lookup failure instead of treating access as accepted', async () => {
    const from = vi.fn();
    student.mockResolvedValue({
      id: 'student',
      db: { rpc: vi.fn(async () => ({ data: null, error: { message: 'unavailable' } })), from },
    });
    await expect(studentClassWorkspace('ar', id, { view: 'materials' })).rejects.toThrow(
      'Student class could not be loaded',
    );
    expect(from).not.toHaveBeenCalled();
  });
  it('clamps an out-of-range lessons tab page in its bounded projection', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        group: {
          id,
          name: 'Class',
          teacher_id: 'teacher',
          enrollment_id: 'enrollment',
          subject: {},
          category: {},
          attendance: {},
        },
        lessons: [
          {
            id: 'last',
            group_id: id,
            title: 'Last',
            starts_at: '2027-01-01T00:00:00Z',
            ends_at: '2027-01-01T01:00:00Z',
            status: 'scheduled',
          },
        ],
        attendance: [],
        page: 3,
        total: 45,
      },
      error: null,
    }));
    const db = { rpc, from: vi.fn() };
    student.mockResolvedValue({ id: 'student', db });

    const result = await studentClassWorkspace('en', id, { view: 'lessons', page: '9999' });

    expect(result).toMatchObject({
      page: 3,
      total: 45,
      pageCount: 3,
      error: false,
      lessons: [{ id: 'last' }],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'student_class_lessons_page',
      expect.objectContaining({
        p_group_id: id,
        p_page: 9999,
        p_history: false,
      }),
    );
    expect(db.from).not.toHaveBeenCalled();
  });
});
