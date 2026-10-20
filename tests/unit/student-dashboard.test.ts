import { describe, expect, it } from 'vitest';
import { upcomingScheduledLessons } from '../../src/features/student/dashboard-domain';

describe('student dashboard lesson projection', () => {
  it('counts scheduled lessons that are ongoing or upcoming and excludes completed or ended lessons', () => {
    const lessons = [
      {
        id: 'future',
        status: 'scheduled',
        starts_at: '2026-10-12T12:00:00Z',
        ends_at: '2026-10-12T13:00:00Z',
      },
      {
        id: 'ongoing',
        status: 'scheduled',
        starts_at: '2026-10-12T09:30:00Z',
        ends_at: '2026-10-12T10:30:00Z',
      },
      {
        id: 'completed',
        status: 'completed',
        starts_at: '2026-10-12T12:00:00Z',
        ends_at: '2026-10-12T13:00:00Z',
      },
      {
        id: 'ended',
        status: 'scheduled',
        starts_at: '2026-10-12T08:00:00Z',
        ends_at: '2026-10-12T09:00:00Z',
      },
    ];
    expect(
      upcomingScheduledLessons(lessons, Date.parse('2026-10-12T10:00:00Z')).map(
        lesson => lesson.id,
      ),
    ).toEqual(['future', 'ongoing']);
  });
});
