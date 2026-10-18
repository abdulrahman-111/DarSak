import { cairoDateString } from '@/features/calendar/domain';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

export function validTimetableDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateAtCairoMidnight(date: string): Date {
  const target = Date.parse(`${date}T00:00:00Z`);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += target - localAsUtc;
  }
  return new Date(guess);
}

export function cairoWeekBounds(date: string) {
  const base = new Date(`${date}T12:00:00Z`);
  const weekday = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - weekday);
  const startDate = base.toISOString().slice(0, 10);
  const endDate = new Date(base.getTime() + 7 * DAY_MS).toISOString().slice(0, 10);
  return { startDate, endDate, start: dateAtCairoMidnight(startDate), end: dateAtCairoMidnight(endDate) };
}

export function cairoDayBounds(date: string) {
  const nextDate = new Date(`${date}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const next = nextDate.toISOString().slice(0, 10);
  return { start: dateAtCairoMidnight(date), end: dateAtCairoMidnight(next) };
}

export function normalizeTimetableWeek(input: unknown, now = new Date()) {
  const today = cairoDateString(now);
  const parsed = validTimetableDate(input) ? input : today;
  const week = cairoWeekBounds(parsed);
  const todayWeek = cairoWeekBounds(today);
  const distance = Math.abs(Date.parse(`${week.startDate}T00:00:00Z`) - Date.parse(`${todayWeek.startDate}T00:00:00Z`));
  const selected = distance <= 370 * DAY_MS ? week : todayWeek;
  return { ...selected, today, weekStart: selected.startDate, isCurrentWeek: selected.startDate === todayWeek.startDate };
}

export function timetableDayDates(weekStart: string) {
  const monday = new Date(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, day) => {
    const date = new Date(monday.getTime() + day * DAY_MS);
    return { date: date.toISOString().slice(0, 10), weekday: (day + 1) % 7 };
  });
}

export function normalizeTimetableSelection(weekStart: string, day: unknown, group: unknown) {
  const days = timetableDayDates(weekStart).map(item => item.date);
  return { day: typeof day === 'string' && days.includes(day) ? day : null, group: typeof group === 'string' && UUID_RE.test(group) ? group : null };
}

export function shiftTimetableWeek(weekStart: string, amount: number) {
  const shifted = new Date(`${weekStart}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + amount * 7);
  return cairoWeekBounds(shifted.toISOString().slice(0, 10)).startDate;
}

export const TIMETABLE_LESSON_LIMIT = 50;
export const TIMETABLE_GROUP_LIMIT = 200;
