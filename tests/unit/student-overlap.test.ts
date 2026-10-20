import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isScheduleOverlap,
  normalizeScheduleOverlap,
  overlapMessage,
  scheduleOverlapCopy,
} from '@/features/student/overlap-domain';
import { student } from '@/features/student/data';
import { studentScheduleOverlap } from '@/features/student/overlap-data';

vi.mock('@/features/student/data', () => ({ student: vi.fn() }));
vi.mock('server-only', () => ({}));

const studentMock = vi.mocked(student);

describe('student schedule overlap warning', () => {
  beforeEach(() => studentMock.mockReset());

  it('reads the single PostgREST table row and softens RPC and malformed-payload errors', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ weekly_overlap: false, dated_overlap: true }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ weekly_overlap: true }], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    studentMock.mockResolvedValue({ db: { rpc } } as never);
    const groupId = '7e100000-0000-4000-8000-000000000001';

    expect(await studentScheduleOverlap('en', groupId)).toEqual({
      overlap: { weekly_overlap: false, dated_overlap: true },
      error: false,
    });
    expect(await studentScheduleOverlap('en', groupId)).toEqual({ overlap: null, error: true });
    expect(await studentScheduleOverlap('en', groupId)).toEqual({ overlap: null, error: true });
    expect(rpc).toHaveBeenCalledWith('student_group_schedule_overlap', { p_group_id: groupId });
  });

  it('accepts only the two safe boolean flags', () => {
    expect(isScheduleOverlap({ weekly_overlap: true, dated_overlap: false })).toBe(true);
    expect(normalizeScheduleOverlap([{ weekly_overlap: true, dated_overlap: false }])).toEqual({
      weekly_overlap: true,
      dated_overlap: false,
    });
    expect(normalizeScheduleOverlap([])).toBeNull();
    expect(
      normalizeScheduleOverlap([
        { weekly_overlap: true, dated_overlap: false },
        { weekly_overlap: false, dated_overlap: true },
      ]),
    ).toBeNull();
    expect(
      isScheduleOverlap({ weekly_overlap: true, dated_overlap: false, lesson_title: 'private' }),
    ).toBe(true);
    expect(isScheduleOverlap({ weekly_overlap: 1, dated_overlap: false })).toBe(false);
    expect(
      isScheduleOverlap({ weekly_overlap: false, dated_overlap: false, lesson_id: 'private' }),
    ).toBe(true);
  });

  it('explains template and dated conflicts independently in English and Arabic', () => {
    expect(overlapMessage('en', { weekly_overlap: true, dated_overlap: false })).toMatch(
      /weekly time/i,
    );
    expect(overlapMessage('en', { weekly_overlap: false, dated_overlap: true })).toMatch(
      /upcoming lesson/i,
    );
    expect(overlapMessage('en', { weekly_overlap: true, dated_overlap: true })).toMatch(
      /weekly time and an upcoming lesson/i,
    );
    expect(overlapMessage('en', { weekly_overlap: false, dated_overlap: false })).toBeNull();
    expect(overlapMessage('ar', { weekly_overlap: true, dated_overlap: false })).toBeTruthy();
    expect(scheduleOverlapCopy('ar').loadError).toMatch(/تعذر/);
    expect(scheduleOverlapCopy('en').loadError).toMatch(/still request to join/);
  });
});
