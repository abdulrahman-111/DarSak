import { cairoDateString } from '@/features/calendar/domain';
import { cairoDayBounds, cairoWeekBounds, normalizeTimetableSelection, normalizeTimetableWeek, timetableDayDates, validTimetableDate } from '@/features/student/timetable-domain';

export { cairoDayBounds, cairoWeekBounds, normalizeTimetableSelection, normalizeTimetableWeek, timetableDayDates, validTimetableDate };

export type TeacherCalendarView = 'week' | 'all';

export function normalizeTeacherCalendarView(value: unknown): TeacherCalendarView {
  return value === 'all' ? 'all' : 'week';
}

export function normalizeTeacherCalendarDate(value: unknown, now = new Date()) {
  return validTimetableDate(value) ? value : cairoDateString(now);
}

export function teacherCalendarWeekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export type TeacherCalendarLesson = {
  id: string;
  group_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  group: { id: string; name: string } | null;
};

export function groupTeacherLessonsByCairoDay(lessons: TeacherCalendarLesson[], dates: string[]) {
  const grouped = new Map<string, TeacherCalendarLesson[]>();
  for (const date of dates) grouped.set(date, []);
  for (const date of dates) {
    const bounds = cairoDayBounds(date);
    for (const lesson of lessons) {
      if (new Date(lesson.starts_at) >= bounds.end || new Date(lesson.ends_at) <= bounds.start) continue;
      grouped.get(date)!.push(lesson);
    }
  }
  return grouped;
}
