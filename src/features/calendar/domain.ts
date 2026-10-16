export const MAX_CALENDAR_DAYS = 93;
export const MAX_CALENDAR_EVENTS = 500;

export type CalendarLesson = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
  group_name: string;
  location: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarDate(value: string | null): Date | null {
  if (!value || !DATE_RE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function validateCalendarRange(from: string | null, until: string | null) {
  const start = parseCalendarDate(from), end = parseCalendarDate(until);
  if (!start || !end || !from || !until) return { valid: false as const, reason: 'invalid' as const };
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  if (days < 1) return { valid: false as const, reason: 'reversed' as const };
  if (days > MAX_CALENDAR_DAYS) return { valid: false as const, reason: 'too-long' as const };
  return { valid: true as const, from, until, days };
}

export function cairoDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function defaultCalendarRange(now = new Date()) {
  const from = cairoDateString(now);
  const end = new Date(`${from}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  return { from, until: end.toISOString().slice(0, 10) };
}

export function safeCalendarFilename(from: string, until: string) {
  return `dars-lessons-${from}-to-${until}.ics`;
}

function escapeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line: string): string {
  const result: string[] = [];
  let current = '', bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 75) {
      result.push(current);
      current = ` ${character}`;
      bytes = 1 + size;
    } else {
      current += character;
      bytes += size;
    }
  }
  result.push(current);
  return result.join('\r\n');
}

function utcStamp(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid calendar timestamp');
  return timestamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function formatCalendarIcs(rows: CalendarLesson[], exportedAt: Date): string {
  const stamp = utcStamp(exportedAt.toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DarSak//Lesson Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const lesson of rows) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${lesson.id}@dars`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(lesson.starts_at)}`,
      `DTEND:${utcStamp(lesson.ends_at)}`,
      `SUMMARY:${escapeText(lesson.title)}`,
      `DESCRIPTION:${escapeText(lesson.group_name)}`,
      `LOCATION:${escapeText(lesson.location)}`,
      `STATUS:${lesson.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
