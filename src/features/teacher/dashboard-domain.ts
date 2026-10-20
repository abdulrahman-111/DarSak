const cairoCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function cairoDateKey(instant: Date): string {
  const parts = Object.fromEntries(
    cairoCalendar.formatToParts(instant).map(part => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function nextDateKey(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function firstInstantOfCairoDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  let low = Date.UTC(year, month - 1, day) - 36 * 60 * 60 * 1000;
  let high = Date.UTC(year, month - 1, day) + 36 * 60 * 60 * 1000;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (cairoDateKey(new Date(middle)) >= dateKey) high = middle;
    else low = middle;
  }
  return new Date(high);
}

export type CairoDayBounds = { start: Date; end: Date };

export function cairoDayBounds(now: Date): CairoDayBounds {
  const today = cairoDateKey(now);
  return {
    start: firstInstantOfCairoDate(today),
    end: firstInstantOfCairoDate(nextDateKey(today)),
  };
}

export function isDashboardTodayLesson(
  lesson: { starts_at: string; ends_at: string; status: string },
  bounds: CairoDayBounds,
): boolean {
  return (
    lesson.status !== 'cancelled' &&
    new Date(lesson.starts_at) < bounds.end &&
    new Date(lesson.ends_at) > bounds.start
  );
}

export function isDashboardUpcomingLesson(
  lesson: { starts_at: string; status: string },
  now: Date,
): boolean {
  return lesson.status === 'scheduled' && new Date(lesson.starts_at) >= now;
}

export function dashboardListCount<T>(exactCount: number | null, items: T[]): number {
  return exactCount ?? items.length;
}

export type SetupTaskId = 'profile' | 'approval' | 'draft' | 'schedule' | 'lessons';
export type TeacherSetupTask = { id: SetupTaskId; href: string; groupName?: string };

type SetupGroup = { id: string; name: string; status: string };

export function buildTeacherSetupTasks({
  teacher,
  specializationCount,
  groups,
  groupIdsWithSlots,
  upcomingLessonCount,
  draftCandidate,
  missingScheduleCandidate,
}: {
  teacher: {
    headline: string | null;
    bio: string | null;
    approved: boolean;
    avatar_path?: string | null;
  };
  contacts?: unknown;
  specializationCount: number;
  groups: SetupGroup[];
  groupIdsWithSlots: Set<string>;
  upcomingLessonCount: number;
  draftCandidate?: SetupGroup | null;
  missingScheduleCandidate?: SetupGroup | null;
}): TeacherSetupTask[] {
  const tasks: TeacherSetupTask[] = [];
  if (!teacher.headline?.trim() || !teacher.bio?.trim() || specializationCount === 0) {
    tasks.push({ id: 'profile', href: '/account/profile' });
  }
  if (!teacher.approved) tasks.push({ id: 'approval', href: '/account/application' });
  const draft =
    draftCandidate !== undefined ? draftCandidate : groups.find(group => group.status === 'draft');
  if (draft)
    tasks.push({
      id: 'draft',
      href: `/teacher/groups/${draft.id}/setup?step=details`,
      groupName: draft.name,
    });
  const groupWithoutSlots =
    missingScheduleCandidate !== undefined
      ? missingScheduleCandidate
      : groups.find(group => group.status !== 'archived' && !groupIdsWithSlots.has(group.id));
  if (groupWithoutSlots) {
    const href =
      groupWithoutSlots.status === 'draft'
        ? `/teacher/groups/${groupWithoutSlots.id}/setup?step=schedule`
        : `/teacher/groups/${groupWithoutSlots.id}`;
    tasks.push({ id: 'schedule', href, groupName: groupWithoutSlots.name });
  }
  if (upcomingLessonCount === 0) tasks.push({ id: 'lessons', href: '/teacher/lessons?new=1' });
  return tasks;
}

export function teacherDashboardError(locale: 'ar' | 'en'): string {
  return locale === 'ar'
    ? 'تعذر تحميل لوحة المعلم. حدّث الصفحة وحاول مرة أخرى.'
    : 'Could not load your teacher dashboard. Refresh and try again.';
}
