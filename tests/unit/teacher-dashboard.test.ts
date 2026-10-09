import { describe, expect, it } from 'vitest';
import {
  buildTeacherSetupTasks,
  cairoDayBounds,
  dashboardGroupIdBatches,
  dashboardListCount,
  dashboardNextPageOffset,
  isDashboardTodayLesson,
  isDashboardUpcomingLesson,
  teacherDashboardError,
} from '@/features/teacher/dashboard-domain';

describe('teacher dashboard date and setup domain', () => {
  it('uses Cairo calendar boundaries across the spring DST change', () => {
    const { start, end } = cairoDayBounds(new Date('2026-04-24T10:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-04-23T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-04-24T21:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('uses Cairo calendar boundaries across the autumn DST change', () => {
    const { start, end } = cairoDayBounds(new Date('2026-10-30T12:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-10-29T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-30T22:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    const longerDay = cairoDayBounds(new Date('2026-10-29T12:00:00.000Z'));
    expect(longerDay.end.getTime() - longerDay.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('includes lessons that intersect the Cairo day and excludes cancelled ones', () => {
    const bounds = cairoDayBounds(new Date('2026-05-03T12:00:00.000Z'));
    expect(isDashboardTodayLesson({ starts_at: bounds.start.toISOString(), ends_at: new Date(bounds.start.getTime() + 3600000).toISOString(), status: 'scheduled' }, bounds)).toBe(true);
    expect(isDashboardTodayLesson({ starts_at: new Date(bounds.start.getTime() - 3600000).toISOString(), ends_at: new Date(bounds.start.getTime() + 3600000).toISOString(), status: 'completed' }, bounds)).toBe(true);
    expect(isDashboardTodayLesson({ starts_at: bounds.start.toISOString(), ends_at: new Date(bounds.start.getTime() + 3600000).toISOString(), status: 'cancelled' }, bounds)).toBe(false);
    expect(isDashboardTodayLesson({ starts_at: new Date(bounds.end.getTime()).toISOString(), ends_at: new Date(bounds.end.getTime() + 3600000).toISOString(), status: 'scheduled' }, bounds)).toBe(false);
  });

  it('counts upcoming lessons only when scheduled and not yet started', () => {
    const now = new Date('2026-05-03T12:00:00.000Z');
    expect(isDashboardUpcomingLesson({ starts_at: '2026-05-03T12:00:00.000Z', status: 'scheduled' }, now)).toBe(true);
    expect(isDashboardUpcomingLesson({ starts_at: '2026-05-03T12:00:00.001Z', status: 'completed' }, now)).toBe(false);
    expect(isDashboardUpcomingLesson({ starts_at: '2026-05-03T11:59:59.999Z', status: 'scheduled' }, now)).toBe(false);
  });

  it('keeps exact counts separate from the limited preview rows', () => {
    expect(dashboardListCount(27, Array.from({ length: 8 }, (_, index) => index))).toBe(27);
    expect(dashboardListCount(null, ['one', 'two'])).toBe(2);
  });

  it('paginates every owned-group page and batches large ID lists without losing IDs', () => {
    expect(dashboardNextPageOffset(0, 1000)).toBe(1000);
    expect(dashboardNextPageOffset(1000, 1000)).toBe(2000);
    expect(dashboardNextPageOffset(2000, 17)).toBeNull();
    const ids = Array.from({ length: 2501 }, (_, index) => `group-${index}`);
    const batches = dashboardGroupIdBatches(ids);
    expect(batches).toHaveLength(26);
    expect(batches.slice(0, -1).every(batch => batch.length === 100)).toBe(true);
    expect(batches.at(-1)).toHaveLength(1);
    expect(batches.flat()).toEqual(ids);
  });

  it('creates setup tasks for incomplete profile, approval, drafts, missing slots, and no upcoming lessons', () => {
    const tasks = buildTeacherSetupTasks({
      teacher: { headline: '', bio: '', approved: false },
      specializationCount: 0,
      groups: [
        { id: 'draft-id', name: 'Draft group', status: 'draft' },
        { id: 'published-id', name: 'Published group', status: 'published' },
      ],
      groupIdsWithSlots: new Set(['draft-id']),
      upcomingLessonCount: 0,
    });
    expect(tasks.map(task => task.id)).toEqual(['profile', 'approval', 'draft', 'schedule', 'lessons']);
    expect(tasks.find(task => task.id === 'draft')?.href).toContain('/groups/draft-id/setup?step=details');
    expect(tasks.find(task => task.id === 'schedule')?.href).toContain('/groups/published-id');
    expect(tasks.find(task => task.id === 'lessons')?.href).toBe('/teacher/lessons?new=1');
  });

  it('treats contacts and avatar as optional for profile completeness', () => {
    const tasks = buildTeacherSetupTasks({
      teacher: { headline: 'Math teacher', bio: 'About me', approved: true, avatar_path: null },
      specializationCount: 1,
      groups: [],
      groupIdsWithSlots: new Set(),
      upcomingLessonCount: 0,
      contacts: null,
    });
    expect(tasks.map(task => task.id)).toEqual(['lessons']);
  });

  it('returns a visible error message for failed dashboard data reads', () => {
    expect(teacherDashboardError('en')).toContain('Could not load');
    expect(teacherDashboardError('ar').length).toBeGreaterThan(0);
  });
});
