import { describe, expect, it } from 'vitest';
import {
  assignmentPageOffset,
  assignmentInputSchema,
  normalizeAssignmentPage,
  parseStudentAssignmentPage,
  parseTeacherAssignmentPage,
  parseTeacherAssignmentSubmissions,
  reviewInputSchema,
  submissionInputSchema,
} from '@/features/assignments/domain';

const id = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';
const stamp = '2026-10-22T10:00:00Z';
const base = {
  id,
  group_id: id,
  title: 'Read chapter',
  instructions: '',
  resource_url: 'https://example.org/lesson',
  due_at: null,
  status: 'published',
  version: 1,
  created_at: stamp,
};
const submission = {
  id,
  url: 'https://example.org/work',
  student_note: '',
  first_submitted_at: stamp,
  last_submitted_at: stamp,
  revision: 1,
  is_late: false,
  teacher_feedback: null,
  feedback_at: null,
};

describe('assignment RPC parsers', () => {
  it('accepts actual student envelopes with nullable deadlines, submission, and feedback', () => {
    expect(
      parseStudentAssignmentPage({ rows: [{ ...base, submission: { ...submission } }], total: 1 }),
    ).toMatchObject({
      rows: [{ due_at: null, submission: { teacher_feedback: null, feedback_at: null } }],
      total: 1,
    });
    expect(
      parseStudentAssignmentPage({ rows: [{ ...base, submission: null }], total: 1 }),
    ).not.toBeNull();
  });

  it('validates teacher list and submission envelopes and rejects malformed counts or contact leakage', () => {
    expect(
      parseTeacherAssignmentPage({
        rows: [{ ...base, submitted_count: 2, accepted_student_count: 4 }],
        total: 1,
      }),
    ).not.toBeNull();
    expect(
      parseTeacherAssignmentSubmissions({
        rows: [
          {
            ...submission,
            student_id: id,
            student_name: 'Student',
            enrollment_status: 'accepted',
          },
        ],
        total: 1,
      }),
    ).not.toBeNull();
    expect(
      parseTeacherAssignmentPage({
        rows: [{ ...base, submitted_count: -1, accepted_student_count: 4 }],
        total: 1,
      }),
    ).toBeNull();
    const parsedWithExtraContact = parseTeacherAssignmentSubmissions({
      rows: [
        {
          ...submission,
          student_id: id,
          student_name: 'Student',
          enrollment_status: 'accepted',
          email: 'private@example.org',
        },
      ],
      total: 1,
    });
    expect(parsedWithExtraContact?.rows[0]).not.toHaveProperty('email');
  });

  it('rejects unsafe links, malformed timestamps and unsafe page totals', () => {
    expect(
      parseStudentAssignmentPage({
        rows: [{ ...base, submission: { ...submission, url: 'javascript:alert(1)' } }],
        total: 1,
      }),
    ).toBeNull();
    expect(
      parseStudentAssignmentPage({
        rows: [{ ...base, created_at: 'not a timestamp', submission: null }],
        total: 1,
      }),
    ).toBeNull();
    expect(parseStudentAssignmentPage({ rows: [], total: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
    expect(
      parseStudentAssignmentPage({
        rows: Array.from({ length: 21 }, () => ({ ...base, submission: null })),
        total: 21,
      }),
    ).toBeNull();
  });
});

describe('assignment page bounds', () => {
  it('normalizes page values and bounds offsets to one million', () => {
    expect(normalizeAssignmentPage('2')).toBe(2);
    expect(normalizeAssignmentPage('-1')).toBe(1);
    expect(normalizeAssignmentPage('nope')).toBe(1);
    expect(assignmentPageOffset(2)).toBe(20);
    expect(assignmentPageOffset(100_000)).toBe(1_000_000);
  });
});

describe('assignment form validation', () => {
  it('accepts HTTP(S) links without credentials and enforces field limits', () => {
    expect(
      assignmentInputSchema.safeParse({
        title: 'Reading',
        instructions: '',
        resourceUrl: 'https://example.org/resource',
        dueAt: '',
        assignmentId: '',
      }).success,
    ).toBe(true);
    expect(
      assignmentInputSchema.safeParse({
        title: 'Reading',
        instructions: '',
        resourceUrl: 'https://user:secret@example.org/resource',
        dueAt: '',
        assignmentId: '',
      }).success,
    ).toBe(false);
    expect(
      submissionInputSchema.safeParse({ url: 'javascript:alert(1)', studentNote: '' }).success,
    ).toBe(false);
    expect(
      submissionInputSchema.safeParse({
        url: 'https://example.org/work',
        studentNote: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      reviewInputSchema.safeParse({ feedback: 'x'.repeat(3001), expectedRevision: '1' }).success,
    ).toBe(false);
  });
});
