import { describe, expect, it } from 'vitest';
import {
  cairoDateString,
  defaultCalendarRange,
  formatCalendarIcs,
  parseCalendarDate,
  safeCalendarFilename,
  validateCalendarRange,
  type CalendarLesson,
} from '@/features/calendar/domain';

const lesson: CalendarLesson = {
  id: 'a1b2c3',
  title: 'Math, \n\u0001\u0002;\\',
  starts_at: '2026-03-20T10:00:00+02:00',
  ends_at: '2026-03-20T11:00:00+02:00',
  status: 'cancelled',
  created_at: '2026-03-01T00:00:00Z',
  group_name: 'مجموعة طويلة',
  location: 'Cairo',
};

describe('calendar date domain', () => {
  it('rejects impossible dates and checks inclusive range bounds', () => {
    expect(parseCalendarDate('2024-02-29')).not.toBeNull();
    expect(parseCalendarDate('2025-02-29')).toBeNull();
    expect(validateCalendarRange('2026-01-01', '2026-04-03')).toMatchObject({
      valid: true,
      days: 93,
    });
    expect(validateCalendarRange('2026-01-01', '2026-04-04')).toMatchObject({
      valid: false,
      reason: 'too-long',
    });
    expect(validateCalendarRange('2026-04-03', '2026-04-02')).toMatchObject({
      valid: false,
      reason: 'reversed',
    });
  });

  it('formats Cairo civil dates and a filename from validated dates', () => {
    expect(cairoDateString(new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-02');
    expect(defaultCalendarRange(new Date('2026-01-01T22:30:00Z'))).toEqual({
      from: '2026-01-02',
      until: '2026-02-01',
    });
    expect(safeCalendarFilename('2026-01-01', '2026-01-31')).toBe(
      'dars-lessons-2026-01-01-to-2026-01-31.ics',
    );
  });
});

describe('calendar ICS', () => {
  it('uses stable IDs, UTC times, cancellation status, and escapes unsafe text', () => {
    const ics = formatCalendarIcs([lesson], new Date('2026-03-01T12:30:00.123Z'));
    expect(ics).toContain('PRODID:-//DarSak//Lesson Calendar//EN\r\n');
    expect(ics).toContain('UID:a1b2c3@dars\r\n');
    expect(ics).toContain('DTSTAMP:20260301T123000Z\r\n');
    expect(ics).toContain('DTSTART:20260320T080000Z\r\n');
    expect(ics).toContain('STATUS:CANCELLED\r\n');
    expect(ics).toContain('SUMMARY:Math\\, \\n\\;\\\\\r\n');
    expect(ics).not.toContain('\u0001');
    expect(ics).toMatch(/\r\n$/);
  });

  it('folds lines by UTF-8 octets without splitting Arabic code points', () => {
    const long = { ...lesson, title: 'ع'.repeat(80), status: 'scheduled' };
    const ics = formatCalendarIcs([long], new Date('2026-01-01T00:00:00Z'));
    const summary = ics
      .split('\r\n')
      .filter(line => line.startsWith('SUMMARY:') || line.startsWith(' '));
    expect(summary.length).toBeGreaterThan(1);
    for (const line of summary)
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain('STATUS:CONFIRMED\r\n');
  });

  it('uses an allowed meeting URL as location and URL while retaining address fallbacks', () => {
    const online = formatCalendarIcs(
      [{ ...lesson, status: 'scheduled', meeting_url: 'https://MEET.GOOGLE.COM/abc' }],
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(online).toContain('LOCATION:https://meet.google.com/abc\r\n');
    expect(online).toContain('URL:https://meet.google.com/abc\r\n');

    const fallback = formatCalendarIcs(
      [{ ...lesson, status: 'scheduled', meeting_url: null }],
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(fallback).toContain('LOCATION:Cairo\r\n');
    expect(fallback).not.toContain('\r\nURL:');
  });

  it('validates configured exact hosts and omits unsafe, unlisted, or cancelled links', () => {
    const extra = formatCalendarIcs(
      [
        { ...lesson, status: 'scheduled', meeting_url: 'https://room.example.test/join' },
        {
          ...lesson,
          id: 'unsafe',
          status: 'scheduled',
          meeting_url: 'https://meet.google.com/ok\r\nURL:https://evil.test',
        },
        {
          ...lesson,
          id: 'unlisted',
          status: 'scheduled',
          meeting_url: 'https://meeting.evil.test/room',
        },
        {
          ...lesson,
          id: 'cancelled',
          status: 'cancelled',
          meeting_url: 'https://meet.google.com/old',
        },
      ],
      new Date('2026-01-01T00:00:00Z'),
      ['room.example.test'],
    );
    expect(extra).toContain('LOCATION:https://room.example.test/join\r\n');
    expect(extra).toContain('URL:https://room.example.test/join\r\n');
    expect(extra.match(/\r\nURL:/g)).toHaveLength(1);
    expect(extra).toContain('LOCATION:Cairo\r\n');
    expect(extra).not.toContain('evil.test');
  });

  it('folds long safe meeting URIs by UTF-8 octets without changing the URL value', () => {
    const meetingUrl = `https://meet.google.com/${'a'.repeat(430)}?comma=a,b;semi=c`;
    const ics = formatCalendarIcs(
      [{ ...lesson, status: 'scheduled', meeting_url: meetingUrl }],
      new Date('2026-01-01T00:00:00Z'),
    );
    const physicalLines = ics.split('\r\n');
    const propertyLines = (name: string) => {
      const start = physicalLines.findIndex(line => line.startsWith(`${name}:`));
      const lines = [physicalLines[start]];
      for (let index = start + 1; physicalLines[index]?.startsWith(' '); index++)
        lines.push(physicalLines[index]);
      return lines;
    };
    const urlLines = propertyLines('URL');
    expect(propertyLines('LOCATION').join('\r\n').replace(/\r\n /g, '')).toBe(
      `LOCATION:${meetingUrl.replace(/,/g, '\\,').replace(/;/g, '\\;')}`,
    );
    for (const line of urlLines)
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(urlLines.join('\r\n').replace(/\r\n /g, '')).toBe(`URL:${meetingUrl}`);
  });
});
