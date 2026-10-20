import { describe, expect, it } from 'vitest';
import { cairoDayBounds } from '@/features/student/timetable-domain';
import {
  groupTeacherLessonsByCairoDay,
  normalizeTeacherCalendarDate,
  normalizeTeacherCalendarView,
  teacherCalendarWeekday,
} from '@/features/teacher/timetable-domain';

describe('teacher timetable domain', () => {
  it('normalizes calendar view and native date input', () => {
    expect(normalizeTeacherCalendarView('all')).toBe('all');
    expect(normalizeTeacherCalendarView('unknown')).toBe('week');
    expect(normalizeTeacherCalendarDate('2026-02-30', new Date('2026-10-18T12:00:00Z'))).toBe(
      '2026-10-18',
    );
    expect(normalizeTeacherCalendarDate('2026-10-13')).toBe('2026-10-13');
  });

  it('uses the native Sunday-zero weekday index used by the weekday label helper', () => {
    expect(teacherCalendarWeekday('2026-10-12')).toBe(1);
    expect(teacherCalendarWeekday('2026-10-18')).toBe(0);
  });

  it('groups overnight lessons by every Cairo day they overlap, including a prior-day start', () => {
    const firstDay = '2026-10-13';
    const nextDay = '2026-10-14';
    const firstBounds = cairoDayBounds(firstDay);
    const nextBounds = cairoDayBounds(nextDay);
    const lessons = [
      {
        id: 'starts-before',
        group_id: 'g1',
        title: 'Overnight',
        starts_at: new Date(firstBounds.start.getTime() - 60 * 60_000).toISOString(),
        ends_at: new Date(firstBounds.start.getTime() + 30 * 60_000).toISOString(),
        status: 'scheduled',
        group: null,
      },
      {
        id: 'spans-forward',
        group_id: 'g1',
        title: 'Long lesson',
        starts_at: new Date(firstBounds.end.getTime() - 30 * 60_000).toISOString(),
        ends_at: new Date(nextBounds.start.getTime() + 30 * 60_000).toISOString(),
        status: 'scheduled',
        group: null,
      },
    ];
    const grouped = groupTeacherLessonsByCairoDay(lessons, [firstDay, nextDay]);
    expect(grouped.get(firstDay)?.map(lesson => lesson.id)).toEqual([
      'starts-before',
      'spans-forward',
    ]);
    expect(grouped.get(nextDay)?.map(lesson => lesson.id)).toEqual(['spans-forward']);
  });
});
