import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attendancePageHref,
  clampAttendancePage,
  normalizeAttendancePage,
} from '@/features/teacher/attendance-data';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { saveLessonAttendance } from '@/features/teacher/attendance-actions';

describe('attendance paging links', () => {
  it('keeps unrelated filters while changing the page', () => {
    expect(
      attendancePageHref('en', 'lesson-id', 3, {
        page: '2',
        attendance_page: '4',
        retry: '1',
        filter: ['a', 'b'],
      }),
    ).toBe('/en/teacher/lessons/lesson-id?page=2&retry=1&filter=a&filter=b&attendance_page=3');
  });

  it('omits page one and returns to the clean route when there are no other query values', () => {
    expect(
      attendancePageHref('ar', 'lesson-id', 1, {
        page: '4',
        attendance_page: '4',
        ignored: undefined,
      }),
    ).toBe('/ar/teacher/lessons/lesson-id?page=4');
  });

  it('normalizes invalid pages and clamps requested pages to the actual result count', () => {
    expect(normalizeAttendancePage('Infinity')).toBe(1);
    expect(normalizeAttendancePage('4.5')).toBe(1);
    expect(normalizeAttendancePage('70000')).toBe(50_000);
    expect(clampAttendancePage(99, 41)).toBe(3);
    expect(clampAttendancePage(99, 0)).toBe(1);
  });
});

describe('attendance action input validation', () => {
  beforeEach(() => vi.mocked(createClient).mockClear());

  it('rejects malformed IDs before creating a database client', async () => {
    const result = await saveLessonAttendance('en', 'not-a-uuid', 'also-not-a-uuid', 'present');
    expect(result?.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });
});
