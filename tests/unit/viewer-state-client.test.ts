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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function response(body: ViewerState, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe('client viewer state races', () => {
  beforeEach(async () => {
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('window', {
      sessionStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
    });
    await refreshViewerState();
    document.cookie = 'sb-access-token=session-a';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not republish a delayed signed-in response after logout', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
    const request = refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 1,
    });

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

  it('lets a healthy same-session request settle when the first streamed shell hint mounts', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    const request = refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 1,
    });
    pending.resolve(response(student));
    await request;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getViewerStateSnapshot()).toEqual(student);
  });

  it('uses a valid anonymous API response as authoritative and clears the shell hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(ANONYMOUS_VIEWER))
        .mockRejectedValueOnce(new Error('network down')),
    );
    await refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 1,
    });

    await refreshViewerState();

    expect(getViewerStateSnapshot()).toEqual(ANONYMOUS_VIEWER);
  });

  it('does not let a late shell hint override an authoritative anonymous API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(ANONYMOUS_VIEWER))
        .mockRejectedValueOnce(new Error('network down')),
    );
    await refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Late Shell Student',
      unreadCount: 1,
    });

    await refreshViewerState();
    expect(getViewerStateSnapshot()).toEqual(ANONYMOUS_VIEWER);
  });

  it('uses a new authorized shell hint after the auth cookie stamp changes', async () => {
    const failingRead = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(ANONYMOUS_VIEWER))
      .mockReturnValueOnce(failingRead.promise);
    vi.stubGlobal('fetch', fetchMock);
    await refreshViewerState();
    document.cookie = 'sb-access-token=session-b';
    registerWorkspaceViewerHint({
      userId: teacher.userId!,
      role: 'teacher',
      name: 'Session B Teacher',
      unreadCount: 4,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    failingRead.reject(new Error('network down'));
    await failingRead.promise.catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(getViewerStateSnapshot()).toMatchObject({
      userId: teacher.userId,
      activeRole: 'teacher',
      fullName: 'Session B Teacher',
      unreadCount: 4,
      assistant: { aiEnabled: false },
    });
  });

  it('rejects an old session response and keeps the new session hint through stale cleanup', async () => {
    const pendingA = deferred<Response>();
    const pendingB = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise),
    );
    const requestA = refreshViewerState();
    const cleanupA = registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Session A Student',
      unreadCount: 2,
    });

    document.cookie = 'sb-access-token=session-b';
    registerWorkspaceViewerHint({
      userId: teacher.userId!,
      role: 'teacher',
      name: 'Session B Teacher',
      unreadCount: 4,
    });
    cleanupA();
    pendingB.resolve(response(teacher));
    await pendingB.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(getViewerStateSnapshot()).toEqual(teacher);
    pendingA.resolve(response(student));
    await requestA;

    expect(getViewerStateSnapshot()).toEqual(teacher);
  });

  it('settles guest state on logout and keeps a same-user prop refresh from stranding a read', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
    const cleanupOldHint = registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 1,
    });
    const request = refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Updated Shell Student',
      unreadCount: 5,
    });
    cleanupOldHint();
    document.cookie = '';
    await refreshViewerState();
    pending.resolve(response(student));
    await request;

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

  it('applies a server shell hint that mounts after the viewer request has failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Late Shell Student',
      unreadCount: 7,
    });

    expect(getViewerStateSnapshot()).toMatchObject({
      userId: student.userId,
      fullName: 'Late Shell Student',
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
    const request = refreshViewerState();
    registerWorkspaceViewerHint({
      userId: student.userId!,
      role: 'student',
      name: 'Shell Student',
      unreadCount: 7,
    });

    await request;
    await refreshViewerState();

    expect(getViewerStateSnapshot()).toEqual(student);
  });
});
