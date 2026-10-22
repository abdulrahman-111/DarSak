import { describe, expect, it } from 'vitest';
import {
  parseStudentWaitlistPage,
  parseTeacherWaitlistPage,
  waitlistPageOffset,
} from '@/features/student/waitlist-domain';

describe('waitlist RPC response parsing', () => {
  it('accepts the JSON RPC object with nullable history fields', () => {
    expect(
      parseStudentWaitlistPage({
        rows: [
          {
            id: 'entry-1',
            group_id: 'group-1',
            group_name: null,
            teacher_name: null,
            status: 'promoted',
            enrollment_id: null,
            created_at: '2026-10-22T10:00:00Z',
            updated_at: '2026-10-22T10:00:00Z',
          },
        ],
        total: 1,
      }),
    ).toEqual({
      rows: [
        {
          id: 'entry-1',
          group_id: 'group-1',
          group_name: null,
          teacher_name: null,
          status: 'promoted',
          enrollment_id: null,
          created_at: '2026-10-22T10:00:00Z',
          updated_at: '2026-10-22T10:00:00Z',
        },
      ],
      total: 1,
    });
  });

  it('parses teacher eligibility and rejects malformed pages', () => {
    expect(
      parseTeacherWaitlistPage({
        rows: [
          {
            id: 'entry-1',
            group_id: 'group-1',
            group_name: 'Algebra',
            teacher_name: null,
            student_id: 'student-1',
            student_name: 'Sam',
            status: 'waiting',
            enrollment_id: null,
            created_at: '2026-10-22T10:00:00Z',
            updated_at: '2026-10-22T10:00:00Z',
            can_promote: false,
          },
        ],
        total: 1,
      })?.rows[0].can_promote,
    ).toBe(false);
    expect(parseStudentWaitlistPage({ rows: null, total: 0 })).toBeNull();
    expect(parseTeacherWaitlistPage({ rows: [], total: -1 })).toBeNull();
  });

  it('bounds untrusted offsets to the supported range', () => {
    expect(waitlistPageOffset(1)).toBe(0);
    expect(waitlistPageOffset(4)).toBe(60);
    expect(waitlistPageOffset(100000)).toBe(1_000_000);
    expect(waitlistPageOffset(Number.NaN)).toBe(0);
  });
});
