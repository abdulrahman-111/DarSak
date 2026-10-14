import { describe, expect, it } from 'vitest';
import { attendancePageHref } from '@/features/teacher/attendance-data';

describe('attendance paging links', () => {
  it('keeps unrelated filters while changing the page', () => {
    expect(attendancePageHref('en', 'lesson-id', 3, { page: '2', retry: '1', filter: ['a', 'b'] }))
      .toBe('/en/teacher/lessons/lesson-id?retry=1&filter=a&filter=b&page=3');
  });

  it('omits page one and returns to the clean route when there are no other query values', () => {
    expect(attendancePageHref('ar', 'lesson-id', 1, { page: '4', ignored: undefined }))
      .toBe('/ar/teacher/lessons/lesson-id');
  });
});
