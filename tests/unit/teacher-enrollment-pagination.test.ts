import { describe, expect, it } from 'vitest';
import {
  clampTeacherPage,
  normalizeTeacherPage,
  teacherPageOffset,
  TEACHER_PAGE_SIZE,
} from '@/features/teacher/enrollment-pagination';

describe('teacher enrollment paging', () => {
  it('normalizes malformed query values and clamps requests to count and Postgres int bounds', () => {
    expect(normalizeTeacherPage('2')).toBe(2);
    expect(normalizeTeacherPage(['3', '90'])).toBe(3);
    expect(normalizeTeacherPage('1.5')).toBe(1);
    expect(normalizeTeacherPage('-1')).toBe(1);
    expect(clampTeacherPage(9, 21)).toBe(2);
    expect(clampTeacherPage(9, 0)).toBe(1);

    const hugePage = normalizeTeacherPage('999999999');
    expect(teacherPageOffset(hugePage)).toBeLessThanOrEqual(2_147_483_647);
    expect(teacherPageOffset(2)).toBe(TEACHER_PAGE_SIZE);
  });
});
