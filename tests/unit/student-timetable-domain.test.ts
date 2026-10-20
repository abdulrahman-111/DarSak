import { describe, expect, it } from 'vitest';
import {
  cairoDayBounds,
  cairoWeekBounds,
  normalizeTimetableSelection,
  normalizeTimetableWeek,
  shiftTimetableWeek,
  timetableDayDates,
  validTimetableDate,
} from '@/features/student/timetable-domain';

describe('student timetable week domain', () => {
  it('returns Cairo-local Monday to next Monday, including the DST offset change', () => {
    const week = cairoWeekBounds('2026-04-24');
    expect(week.startDate).toBe('2026-04-20');
    expect(week.endDate).toBe('2026-04-27');
    expect(week.start.toISOString()).toBe('2026-04-19T22:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-04-26T21:00:00.000Z');
  });

  it('bounds a selected Cairo day by local midnight, including a 23-hour DST-transition day', () => {
    const day = cairoDayBounds('2026-04-23');
    expect(day.start.toISOString()).toBe('2026-04-22T22:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-04-23T21:00:00.000Z');
    expect(day.end.getTime() - day.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('validates calendar dates and keeps week navigation within a year of today', () => {
    expect(validTimetableDate('2026-02-28')).toBe(true);
    expect(validTimetableDate('2026-02-30')).toBe(false);
    const normalized = normalizeTimetableWeek('1900-01-01', new Date('2026-10-18T12:00:00Z'));
    expect(normalized.weekStart).toBe('2026-10-12');
    expect(normalized.isCurrentWeek).toBe(true);
    expect(shiftTimetableWeek('2026-10-12', 1)).toBe('2026-10-19');
  });

  it('builds seven Monday-first days and rejects day or class values outside the selection', () => {
    const days = timetableDayDates('2026-10-12');
    expect(days.map(day => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(
      normalizeTimetableSelection(
        '2026-10-12',
        '2026-10-18',
        '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0',
      ),
    ).toEqual({ day: '2026-10-18', group: '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0' });
    expect(normalizeTimetableSelection('2026-10-12', '2026-10-19', 'bad')).toEqual({
      day: null,
      group: null,
    });
  });
});
