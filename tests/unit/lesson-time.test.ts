import { describe, expect, it } from 'vitest';
import { lessonCountdown, lessonTimeRange } from '@/components/platform/lesson-time';

const now = new Date('2026-10-20T10:00:00.000Z'); // 13:00 in Cairo

describe('lesson countdown', () => {
  it('marks ongoing and ended lessons', () => {
    expect(lessonCountdown('2026-10-20T09:30:00Z', '2026-10-20T10:30:00Z', 'en', now)).toEqual({
      kind: 'live',
      label: 'Happening now',
    });
    expect(lessonCountdown('2026-10-20T08:00:00Z', '2026-10-20T09:00:00Z', 'en', now).kind).toBe(
      'ended',
    );
  });

  it('counts minutes for lessons starting within the hour', () => {
    expect(lessonCountdown('2026-10-20T10:25:00Z', '2026-10-20T11:25:00Z', 'en', now)).toEqual({
      kind: 'soon',
      label: 'Starts in 25 minutes',
    });
  });

  it('counts hours later the same Cairo day', () => {
    expect(lessonCountdown('2026-10-20T13:00:00Z', '2026-10-20T14:00:00Z', 'en', now)).toEqual({
      kind: 'today',
      label: 'Starts in 3 hours',
    });
  });

  it('uses Cairo calendar days, not 24-hour gaps', () => {
    // 23:30 UTC is 02:30 the next day in Cairo.
    expect(lessonCountdown('2026-10-20T23:30:00Z', '2026-10-21T00:30:00Z', 'en', now)).toEqual({
      kind: 'later',
      label: 'Starts tomorrow',
    });
    expect(lessonCountdown('2026-10-23T10:00:00Z', '2026-10-23T11:00:00Z', 'en', now).label).toBe(
      'Starts in 3 days',
    );
  });

  it('writes Arabic labels', () => {
    expect(lessonCountdown('2026-10-21T10:00:00Z', '2026-10-21T11:00:00Z', 'ar', now).label).toBe(
      'تبدأ غدًا',
    );
  });
});

describe('lesson time range', () => {
  it('formats the start and end in Cairo time', () => {
    expect(lessonTimeRange('2026-10-20T10:00:00Z', '2026-10-20T11:30:00Z', 'en')).toBe(
      '13:00 – 14:30',
    );
  });
});
