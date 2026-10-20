import { cairoDateKey } from '@/features/teacher/dashboard-domain';

export type LessonCountdown = {
  kind: 'live' | 'soon' | 'today' | 'later' | 'ended';
  label: string;
};

const language = (locale: string) => (locale === 'ar' ? 'ar-EG' : 'en-GB');

function calendarDayGap(from: Date, to: Date): number {
  const day = (key: string) => {
    const [year, month, date] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((day(cairoDateKey(to)) - day(cairoDateKey(from))) / 86400000);
}

/** A short, human label for when a lesson starts, measured on the Cairo calendar. */
export function lessonCountdown(
  startsAt: string,
  endsAt: string,
  locale: string,
  now = new Date(),
): LessonCountdown {
  const ar = locale === 'ar';
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (end <= now) return { kind: 'ended', label: ar ? 'انتهت' : 'Ended' };
  if (start <= now) return { kind: 'live', label: ar ? 'جارية الآن' : 'Happening now' };
  const relative = new Intl.RelativeTimeFormat(language(locale), { numeric: 'auto' });
  const prefix = ar ? 'تبدأ' : 'Starts';
  const minutes = Math.max(1, Math.ceil((start.getTime() - now.getTime()) / 60000));
  if (minutes < 60)
    return { kind: 'soon', label: `${prefix} ${relative.format(minutes, 'minute')}` };
  const days = calendarDayGap(now, start);
  if (days === 0)
    return {
      kind: 'today',
      label: `${prefix} ${relative.format(Math.round(minutes / 60), 'hour')}`,
    };
  return { kind: 'later', label: `${prefix} ${relative.format(days, 'day')}` };
}

export function lessonTimeRange(startsAt: string, endsAt: string, locale: string) {
  const format = new Intl.DateTimeFormat(language(locale), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  });
  return `${format.format(new Date(startsAt))} – ${format.format(new Date(endsAt))}`;
}

/** Day-of-month and short month for a compact calendar tile, in Cairo time. */
export function lessonDateTile(startsAt: string, locale: string) {
  const date = new Date(startsAt);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language(locale), { ...options, timeZone: 'Africa/Cairo' }).format(
      date,
    );
  return {
    day: part({ day: 'numeric' }),
    month: part({ month: 'short' }),
    weekday: part({ weekday: 'long' }),
    label: part({ weekday: 'long', day: 'numeric', month: 'short' }),
    fullLabel: part({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
}
