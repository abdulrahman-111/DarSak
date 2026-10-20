export type DashboardLesson = { status: string; starts_at: string; ends_at: string };

export function upcomingScheduledLessons<T extends DashboardLesson>(
  lessons: T[],
  now: number,
): T[] {
  return lessons.filter(
    lesson => lesson.status === 'scheduled' && new Date(lesson.ends_at).getTime() > now,
  );
}
