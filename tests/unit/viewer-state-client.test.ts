import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getViewerStateSnapshot,
  refreshViewerState,
  registerWorkspaceViewerHint,
} from '@/components/viewer-state';
import { ANONYMOUS_VIEWER, type ViewerState } from '@/features/platform/viewer-state-types';

const student: ViewerState = {
  signedIn: true,
  userId: 'student-1',
  activeRole: 'student',
  fullName: 'Verified Student',
  unreadCount: 2,
  assistant: { access: { role: 'student', canTeach: false }, key: 'student-1', aiEnabled: true },
};
const teacher: ViewerState = {
  signedIn: true,
  userId: 'teacher-1',
  activeRole: 'teacher',
  fullName: 'Verified Teacher',
  unreadCount: 3,
  assistant: { access: { role: 'teacher', canTeach: true }, key: 'teacher-1', aiEnabled: true },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body: ViewerState, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe('client viewer state races', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { cookie: 'sb-access-token=present' });
    vi.stubGlobal('window', {
      sessionStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not republish a delayed signed-in response after logout', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('network down')),
    );
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 1,
    });

    const request = refreshViewerState();
    document.cookie = '';
    await refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Stale Shell Student',
      unreadCount: 1,
    });
    pending.resolve(response(student));
    await request;

    expect(getViewerStateSnapshot()).toEqual(ANONYMOUS_VIEWER);
  });

  it('does not publish a delayed response from the previous workspace identity', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('network down')),
    );
    const unregisterStudent = registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 1,
    });
    const request = refreshViewerState();

    registerWorkspaceViewerHint({
      userId: teacher.userId!,
      role: 'teacher',
      name: 'Shell Teacher',
      unreadCount: 0,
    });
    unregisterStudent();
    pending.resolve(response(student));
    await request;
    expect(getViewerStateSnapshot()).toBeNull();
    await refreshViewerState();

    expect(getViewerStateSnapshot()).toMatchObject({
      userId: teacher.userId,
      activeRole: 'teacher',
      fullName: 'Shell Teacher',
      assistant: { aiEnabled: false },
    });
  });

  it('uses a valid anonymous API response as authoritative and clears the shell hint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(ANONYMOUS_VIEWER)));
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 1,
    });

    await refreshViewerState();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));
    await refreshViewerState();

    expect(getViewerStateSnapshot()).toEqual(ANONYMOUS_VIEWER);
  });

  it('falls back to the current authorized shell on an unavailable endpoint with AI disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(ANONYMOUS_VIEWER, false)));
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 7,
    });

    await refreshViewerState();

    expect(getViewerStateSnapshot()).toMatchObject({
      signedIn: true,
      userId: student.userId,
      activeRole: 'student',
      fullName: 'Shell Student',
      unreadCount: 7,
      assistant: { access: null, key: 'guest', aiEnabled: false },
    });
  });

  it('treats a malformed successful response as a fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: true }) }),
    );
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 7,
    });

    await refreshViewerState();

    expect(getViewerStateSnapshot()).toMatchObject({
      userId: student.userId,
      fullName: 'Shell Student',
      assistant: { aiEnabled: false },
    });
  });

  it('keeps a verified same-user snapshot through a later transport failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(student))
        .mockRejectedValueOnce(new Error('network down')),
    );
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 7,
    });

    await refreshViewerState();
    await refreshViewerState();

    expect(getViewerStateSnapshot()).toEqual(student);
  });
});
