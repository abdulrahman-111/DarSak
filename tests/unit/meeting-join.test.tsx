import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/features/platform/actions', () => ({ saveLesson: vi.fn() }));
import { LessonForm } from '@/components/platform/forms';
import {
  MeetingJoin,
  meetingJoinState,
  scheduleMeetingJoinBoundary,
} from '@/features/lessons/meeting-join';

const lesson = {
  id: '55555555-5555-4555-8555-555555555555',
  starts_at: '2027-01-01T10:00:00.000Z',
  ends_at: '2027-01-01T11:00:00.000Z',
  status: 'scheduled',
};
const meetingUrl = 'https://meet.google.com/abc-defg-hij';

afterEach(() => vi.useRealTimers());

describe('private meeting join', () => {
  it('opens at the inclusive 15-minute boundary and closes at the exclusive end', () => {
    const start = new Date(lesson.starts_at).getTime();
    expect(meetingJoinState(lesson, meetingUrl, start - 15 * 60_000 - 1)).toBe('before');
    expect(meetingJoinState(lesson, meetingUrl, start - 15 * 60_000)).toBe('open');
    expect(meetingJoinState(lesson, meetingUrl, new Date(lesson.ends_at).getTime() - 1)).toBe(
      'open',
    );
    expect(meetingJoinState(lesson, meetingUrl, new Date(lesson.ends_at).getTime())).toBe('hidden');
  });

  it('hides missing links, cancelled, completed, archived and invalid lesson times', () => {
    const now = new Date(lesson.starts_at).getTime();
    expect(meetingJoinState(lesson, null, now)).toBe('hidden');
    for (const status of ['cancelled', 'completed', 'archived'])
      expect(meetingJoinState({ ...lesson, status }, meetingUrl, now)).toBe('hidden');
    expect(meetingJoinState({ ...lesson, starts_at: 'bad-date' }, meetingUrl, now)).toBe('hidden');
  });

  it('renders the trusted provider hostname and safe external-link attributes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T09:45:00.000Z'));
    const html = renderToStaticMarkup(
      createElement(MeetingJoin, { locale: 'en', lesson, meetingUrl, initialNow: Date.now() }),
    );
    expect(html).toContain('Join meeting · meet.google.com');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('min-h-11');
  });

  it('uses the serialized server time for its first render before reconciling the browser clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(lesson.starts_at));
    const initialNow = new Date(lesson.starts_at).getTime() - 15 * 60_000 - 1;
    const html = renderToStaticMarkup(
      createElement(MeetingJoin, { locale: 'en', lesson, meetingUrl, initialNow }),
    );
    expect(html).toContain('opens 15 minutes before the lesson');
    expect(html).not.toContain('<a ');
  });

  it('formats the before-start message in Cairo time across a Cairo midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T22:00:00.000Z'));
    const overnight = {
      ...lesson,
      starts_at: '2026-11-06T22:30:00.000Z', // 00:30 the next day in Cairo
      ends_at: '2026-11-06T23:30:00.000Z',
    };
    const html = renderToStaticMarkup(
      createElement(MeetingJoin, {
        locale: 'en',
        lesson: overnight,
        meetingUrl,
        initialNow: Date.now(),
      }),
    );
    expect(html).toContain('7 Nov 2026');
    expect(html).toContain('Cairo time');
    expect(html).not.toContain('<a ');
  });

  it('prefills only the explicit override and leaves inheritance empty', () => {
    const formLesson = {
      id: lesson.id,
      title: 'Lesson',
      starts_at: lesson.starts_at,
      ends_at: lesson.ends_at,
      notes: '',
    };
    const explicit = renderToStaticMarkup(
      createElement(LessonForm, {
        locale: 'en',
        groupId: '44444444-4444-4444-8444-444444444444',
        lesson: formLesson,
        meetingUrl,
      }),
    );
    const inherited = renderToStaticMarkup(
      createElement(LessonForm, {
        locale: 'en',
        groupId: '44444444-4444-4444-8444-444444444444',
        lesson: formLesson,
        meetingUrl: null,
      }),
    );
    expect(explicit).toMatch(
      /name="meetingUrl"[^>]*value="https:\/\/meet\.google\.com\/abc-defg-hij"/,
    );
    expect(inherited).toMatch(/name="meetingUrl"[^>]*value=""/);
  });

  it('updates at both timed boundaries and clears the pending timer on cleanup', () => {
    vi.useFakeTimers();
    const start = new Date(lesson.starts_at).getTime();
    vi.setSystemTime(start - 15 * 60_000 - 1);
    let state = meetingJoinState(lesson, meetingUrl, Date.now());
    const openCleanup = scheduleMeetingJoinBoundary(lesson, state, () => {
      state = meetingJoinState(lesson, meetingUrl, Date.now());
    });
    vi.advanceTimersByTime(1);
    expect(state).toBe('open');

    const closeCleanup = scheduleMeetingJoinBoundary(lesson, state, () => {
      state = meetingJoinState(lesson, meetingUrl, Date.now());
    });
    vi.advanceTimersByTime(75 * 60_000);
    expect(state).toBe('hidden');
    closeCleanup();
    openCleanup();

    state = 'before';
    vi.setSystemTime(start - 15 * 60_000 - 1);
    const cleanup = scheduleMeetingJoinBoundary(lesson, state, () => {
      state = 'open';
    });
    cleanup();
    vi.advanceTimersByTime(1);
    expect(state).toBe('before');
  });
});
