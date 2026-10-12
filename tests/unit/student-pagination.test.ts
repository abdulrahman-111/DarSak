import { describe, expect, it } from 'vitest';
import { normalizeStudentPage, STUDENT_PAGE_SIZE, studentPageCount } from '@/features/student/pagination-domain';

describe('student history paging', () => {
  it('normalizes invalid page inputs and computes bounded pages from exact totals', () => {
    expect(normalizeStudentPage('3')).toBe(3);
    expect(normalizeStudentPage('0')).toBe(1);
    expect(normalizeStudentPage('1.5')).toBe(1);
    expect(studentPageCount(0)).toBe(1);
    expect(studentPageCount(STUDENT_PAGE_SIZE + 1)).toBe(2);
  });
});
