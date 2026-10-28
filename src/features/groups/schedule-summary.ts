import { WEEK_START } from '@/features/student/timetable-domain';

export type ScheduleSlotLike = { weekday: number; start_time: string; end_time: string };
export type SlotGroup = { weekdays: number[]; start: string; end: string };
type ScheduleLocale = 'ar' | 'en';

const hhmm = (value: string) => value.slice(0, 5);

/**
 * Collapses equal slots and merges weekdays that share one time range.
 * Weekdays use the Sunday-zero index and are ordered from `weekStart`.
 */
export function groupScheduleSlots(
  slots: ScheduleSlotLike[],
  weekStart: number = WEEK_START,
): SlotGroup[] {
  const order = (weekday: number) => (weekday - weekStart + 7) % 7;
  const byTime = new Map<string, SlotGroup>();
  for (const slot of slots) {
    const start = hhmm(slot.start_time);
    const end = hhmm(slot.end_time);
    const key = `${start}-${end}`;
    const group = byTime.get(key) ?? { weekdays: [], start, end };
    if (!group.weekdays.includes(slot.weekday)) group.weekdays.push(slot.weekday);
    byTime.set(key, group);
  }
  const groups = [...byTime.values()];
  for (const group of groups) group.weekdays.sort((a, b) => order(a) - order(b));
  return groups.sort(
    (a, b) =>
      order(a.weekdays[0]) - order(b.weekdays[0]) ||
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end),
  );
}

const SHORT_DAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

function joinDays(days: string[], locale: ScheduleLocale) {
  if (days.length < 2) return days[0] ?? '';
  const head = days.slice(0, -1);
  const last = days[days.length - 1];
  if (locale === 'ar') return `${head.join('، ')} و${last}`;
  return `${head.join(', ')} & ${last}`;
}

function arabicTime(value: string) {
  const [h, m] = value.split(':').map(Number);
  const digits = new Intl.NumberFormat('ar-EG', { useGrouping: false });
  const minutes = new Intl.NumberFormat('ar-EG', { minimumIntegerDigits: 2, useGrouping: false });
  return {
    text: `${digits.format(h % 12 || 12)}:${minutes.format(m)}`,
    period: h < 12 ? 'ص' : 'م',
  };
}

export function formatSlotGroup(group: SlotGroup, locale: ScheduleLocale): string {
  const days = joinDays(
    group.weekdays.map(day => SHORT_DAYS[locale][day]),
    locale,
  );
  if (locale === 'ar') {
    const start = arabicTime(group.start);
    const end = arabicTime(group.end);
    const range =
      start.period === end.period
        ? `${start.text}–${end.text} ${end.period}`
        : `${start.text} ${start.period}–${end.text} ${end.period}`;
    return `${days} · ${range} (القاهرة)`;
  }
  return `${days} · ${group.start}–${group.end} (Cairo)`;
}

export function lessonsPerWeekLabel(count: number, locale: ScheduleLocale): string {
  if (locale === 'en') return `${count} ${count === 1 ? 'lesson' : 'lessons'} a week`;
  if (count === 1) return 'حصة واحدة في الأسبوع';
  if (count === 2) return 'حصتان في الأسبوع';
  const n = new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(count);
  return `${n} ${count >= 3 && count <= 10 ? 'حصص' : 'حصة'} في الأسبوع`;
}

export function summarizeSchedule(
  slots: ScheduleSlotLike[],
  locale: ScheduleLocale,
  weekStart: number = WEEK_START,
) {
  const groups = groupScheduleSlots(slots, weekStart);
  const count = groups.reduce((total, group) => total + group.weekdays.length, 0);
  return {
    lines: groups.map(group => formatSlotGroup(group, locale)),
    count,
    countLabel: count ? lessonsPerWeekLabel(count, locale) : '',
  };
}
