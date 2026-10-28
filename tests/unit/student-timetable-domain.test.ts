import { describe, expect, it } from 'vitest';
import {
  cairoDayBounds,
  cairoWeekBounds,
  normalizeTimetableSelection,
  normalizeTimetableWeek,
  shiftTimetableWeek,
  timetableDayDates,
  validTimetableDate,
  WEEK_START,
} from '@/features/student/timetable-domain';

describe('student timetable week domain', () => {
  it('starts the week on Saturday by default', () => {
    expect(WEEK_START).toBe(6);
  });

  it('returns Cairo-local Saturday to next Saturday, including the DST offset change', () => {
    // Fri 2026-04-24 belongs to the week that began Sat 2026-04-18.
    const week = cairoWeekBounds('2026-04-24');
    expect(week.startDate).toBe('2026-04-18');
    expect(week.endDate).toBe('2026-04-25');
    expect(week.start.toISOString()).toBe('2026-04-17T22:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-04-24T21:00:00.000Z');
    // Cairo DST began Fri 2026-04-24 at 00:00, so this week is one hour short.
    expect(week.end.getTime() - week.start.getTime()).toBe(7 * 24 * 3600_000 - 3600_000);
  });

  it('rolls over on Saturday, not Monday or Sunday', () => {
    expect(cairoWeekBounds('2026-10-16').startDate).toBe('2026-10-10'); // Friday
    expect(cairoWeekBounds('2026-10-17').startDate).toBe('2026-10-17'); // Saturday
    expect(cairoWeekBounds('2026-10-18').startDate).toBe('2026-10-17'); // Sunday
    expect(cairoWeekBounds('2026-10-19').startDate).toBe('2026-10-17'); // Monday
    expect(cairoWeekBounds('2026-10-23').startDate).toBe('2026-10-17'); // Friday
    expect(cairoWeekBounds('2026-10-24').startDate).toBe('2026-10-24'); // Saturday
  });

  it('supports other week starts when asked', () => {
    expect(cairoWeekBounds('2026-04-24', 1).startDate).toBe('2026-04-20');
    expect(cairoWeekBounds('2026-04-24', 0).startDate).toBe('2026-04-19');
    expect(cairoWeekBounds('2026-04-24', 5).startDate).toBe('2026-04-24');
  });

  it('keeps Cairo midnight correct across the autumn DST end', () => {
    // Cairo DST ends Fri 2026-10-30 at 24:00 (clocks go back at midnight).
    const week = cairoWeekBounds('2026-10-28');
    expect(week.startDate).toBe('2026-10-24');
    expect(week.endDate).toBe('2026-10-31');
    expect(week.start.toISOString()).toBe('2026-10-23T21:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-10-30T22:00:00.000Z');
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
    expect(normalized.weekStart).toBe('2026-10-17');
    expect(normalized.isCurrentWeek).toBe(true);
    expect(shiftTimetableWeek('2026-10-17', 1)).toBe('2026-10-24');
    expect(shiftTimetableWeek('2026-10-17', -1)).toBe('2026-10-10');
    expect(shiftTimetableWeek('2026-10-12', 1, 1)).toBe('2026-10-19');
  });

  it('builds seven Saturday-first days and rejects day or class values outside the selection', () => {
    const days = timetableDayDates('2026-10-17');
    expect(days.map(day => day.date)).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
    // weekday uses the native Sunday-zero index: Sat, Sun, Mon ... Fri.
    expect(days.map(day => day.weekday)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(timetableDayDates('2026-10-12', 1).map(day => day.weekday)).toEqual([
      1, 2, 3, 4, 5, 6, 0,
    ]);
    expect(
      normalizeTimetableSelection(
        '2026-10-17',
        '2026-10-23',
        '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0',
      ),
    ).toEqual({ day: '2026-10-23', group: '2d6a0d81-05f3-4d8e-baa0-8440e3e4a0d0' });
    expect(normalizeTimetableSelection('2026-10-17', '2026-10-24', 'bad')).toEqual({
      day: null,
      group: null,
    });
  });
});
