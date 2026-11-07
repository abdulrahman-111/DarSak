import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { redirect } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  dashboard: vi.fn(),
  meetingLinks: vi.fn(),
}));
vi.mock('@/components/platform/access', () => ({ requireViewer: mocks.requireViewer }));
vi.mock('@/features/student/data', () => ({ studentDashboard: mocks.dashboard }));
vi.mock('@/features/lessons/data', () => ({ meetingLinks: mocks.meetingLinks }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => createElement('a', { href, ...props }, children),
}));
vi.mock('next/image', () => ({ default: (props: any) => createElement('img', props) }));
import StudentDashboard from '@/app/[locale]/student/page';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  let settled = false;
  const promise = new Promise<T>((res, rej) => {
    resolve = value => {
      settled = true;
      res(value);
    };
    reject = reason => {
      settled = true;
      rej(reason);
    };
  });
  return {
    promise,
    resolve,
    reject,
    get settled() {
      return settled;
    },
  };
}

async function readStream(tree: ReactElement) {
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(tree, {
    onError: error => {
      errors.push(error);
    },
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      html += decoder.decode(part.value, { stream: true });
    }
    html += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { html, errors };
}

const empty = {
  error: null,
  calendarError: false,
  lessons: [],
  occupiedDays: [],
  classes: [],
  acceptedCount: 0,
  pendingCount: 0,
};
const viewer = { fullName: 'Amina Student', db: {} };
const params = (locale = 'en') => ({ params: Promise.resolve({ locale }) });
const scheduledLesson = {
  id: 'lesson-1',
  title: 'Science lesson',
  starts_at: '2026-11-07T12:15:00Z',
  ends_at: '2026-11-07T13:15:00Z',
  status: 'scheduled',
  group: { name: 'Class one' },
};

beforeEach(() => {
  mocks.requireViewer.mockReset();
  mocks.dashboard.mockReset();
  mocks.meetingLinks.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('student dashboard streaming', () => {
  it('returns the authorized greeting while summary is pending, then streams content', async () => {
    const summary = deferred<typeof empty>();
    mocks.requireViewer.mockResolvedValue(viewer);
    mocks.dashboard.mockReturnValue(summary.promise);
    const tree = (await StudentDashboard(params())) as ReactElement;
    const stream = await renderToReadableStream(tree);
    const reader = stream.getReader();
    const first = await reader.read();
    const initial = new TextDecoder().decode(first.value);
    expect(initial).toContain('Welcome back, Amina');
    expect(initial).toContain('Loading learning space');
    expect(initial).not.toContain('Your learning library');
    summary.resolve(empty);
    await stream.allReady;
    let full = initial;
    try {
      while (!full.includes('Your learning library')) {
        const part = await reader.read();
        if (part.done) break;
        full += new TextDecoder().decode(part.value);
      }
      expect(full).toContain('Your learning library');
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        full += new TextDecoder().decode(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    expect(mocks.dashboard.mock.calls[0][1]).toBeInstanceOf(Date);
  });

  it('keeps populated classes and calendar visible while the optional meeting lookup is pending', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T12:10:00Z'));
    const meeting = deferred<Record<string, string>>();
    mocks.requireViewer.mockResolvedValue(viewer);
    mocks.dashboard.mockResolvedValue({
      ...empty,
      lessons: [scheduledLesson],
      occupiedDays: ['2026-11-07'],
      classes: [
        { id: 'enrollment-1', group_id: 'group-1', group: { name: 'Class one', status: 'active' } },
      ],
      acceptedCount: 1,
    });
    mocks.meetingLinks.mockReturnValue(meeting.promise);
    const tree = (await StudentDashboard(params())) as ReactElement;
    const errors: unknown[] = [];
    const stream = await renderToReadableStream(tree, {
      onError: error => {
        errors.push(error);
      },
    });
    const reader = stream.getReader();
    let full = '';
    try {
      while (!full.includes('Your learning week')) {
        const part = await reader.read();
        if (part.done) break;
        full += new TextDecoder().decode(part.value);
      }
      expect(mocks.meetingLinks).toHaveBeenCalledOnce();
      expect(full).toContain('Science lesson');
      expect(full).toContain('/en/student/lessons/lesson-1');
      expect(full).toContain('Class one');
      expect(full).toContain('Your learning week');
      expect(full).toContain('/en/timetable');
      expect(meeting.settled).toBe(false);
    } finally {
      meeting.resolve({});
      try {
        await stream.allReady;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          full += new TextDecoder().decode(part.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    expect(errors).toEqual([]);
  });

  it('omits the join control when the meeting lookup rejects but keeps the scheduled lesson', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T12:10:00Z'));
    mocks.requireViewer.mockResolvedValue(viewer);
    mocks.dashboard.mockResolvedValue({ ...empty, lessons: [scheduledLesson] });
    mocks.meetingLinks.mockRejectedValue(new Error('optional lookup failed'));
    const { html, errors } = await readStream((await StudentDashboard(params())) as ReactElement);
    expect(html).toContain('Science lesson');
    expect(html).toContain('/en/student/lessons/lesson-1');
    expect(html).not.toContain('Join meeting');
    expect(html).not.toContain('https://meet.example.com/lesson-1');
    expect(errors).toEqual([]);
  });

  it('shows the meeting join control for a scheduled lesson with a valid link inside its join window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T12:10:00Z'));
    mocks.requireViewer.mockResolvedValue(viewer);
    mocks.dashboard.mockResolvedValue({ ...empty, lessons: [scheduledLesson] });
    mocks.meetingLinks.mockResolvedValue({ 'lesson-1': 'https://meet.example.com/lesson-1' });
    const { html, errors } = await readStream((await StudentDashboard(params())) as ReactElement);
    expect(html).toContain('Join meeting · meet.example.com');
    expect(html).toContain('href="https://meet.example.com/lesson-1"');
    expect(errors).toEqual([]);
  });

  it('streams the existing summary error state and omits ordinary summary content', async () => {
    mocks.requireViewer.mockResolvedValue(viewer);
    mocks.dashboard.mockResolvedValue({ ...empty, error: 'failed' });
    const { html, errors } = await readStream((await StudentDashboard(params())) as ReactElement);
    expect(html).toContain('Could not load your learning space. Refresh to try again.');
    expect(html).toContain('Welcome back, Amina');
    expect(html).not.toContain('Your learning library');
    expect(html).not.toContain('No classes yet');
    expect(errors).toEqual([]);
  });

  it.each([
    [
      'en',
      'No classes yet',
      'Your first class will appear here once your enrollment is accepted.',
      'No other lessons are scheduled yet.',
    ],
    [
      'ar',
      'لا توجد مجموعات بعد',
      'ستظهر مجموعتك الأولى هنا بمجرد قبول انضمامك.',
      'لا توجد حصص أخرى مجدولة بعد.',
    ],
  ])(
    'preserves the %s localized empty state after summary resolves',
    async (locale, classes, description, lessons) => {
      mocks.requireViewer.mockResolvedValue(viewer);
      mocks.dashboard.mockResolvedValue(empty);
      const { html, errors } = await readStream(
        (await StudentDashboard(params(locale))) as ReactElement,
      );
      expect(html).toContain(classes);
      expect(html).toContain(description);
      expect(html).toContain(lessons);
      expect(errors).toEqual([]);
    },
  );

  it('authorizes before rendering and propagates a deferred onboarding redirect from the summary boundary', async () => {
    mocks.requireViewer.mockRejectedValue(new Error('redirect:/en/login'));
    await expect(StudentDashboard(params())).rejects.toThrow('redirect:');
    expect(mocks.dashboard).not.toHaveBeenCalled();

    mocks.requireViewer.mockResolvedValue(viewer);
    mocks.dashboard.mockReturnValue(Promise.resolve().then(() => redirect('/en/account/setup')));
    const tree = (await StudentDashboard(params())) as ReactElement;
    const errors: unknown[] = [];
    const streamPromise = renderToReadableStream(tree, {
      onError: error => {
        errors.push(error);
      },
    });
    const stream = await streamPromise;
    const reader = stream.getReader();
    try {
      while (!(await reader.read()).done) {
        /* drain the boundary */
      }
    } finally {
      reader.releaseLock();
    }
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('NEXT_REDIRECT');
    expect((errors[0] as { digest?: string }).digest).toContain('/en/account/setup');
  });
});
