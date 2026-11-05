'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { ANONYMOUS_VIEWER, type ViewerState } from '@/features/platform/viewer-state-types';

const MIN_FOCUS_REFRESH_MS = 30_000;

let snapshot: ViewerState | null = null;
let verifiedSnapshot: ViewerState | null = null;
let verifiedSessionStamp: string | null = null;
let workspaceHint: { token: number; sessionStamp: string; value: WorkspaceViewerHint } | null =
  null;
let nextHintToken = 0;
let lastFetchAt = 0;
let sessionStamp: string | null = null;
let failedSessionStamp: string | null = null;
let inFlight: { sequence: number; sessionStamp: string } | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

export type WorkspaceViewerHint = {
  userId: string;
  role: 'student' | 'teacher';
  name: string;
  unreadCount: number | null;
};

function publish(next: ViewerState | null) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

function readAuthSessionStamp(): string | null {
  try {
    const cookies = document.cookie
      .split(';')
      .map(part => part.trim())
      .filter(part => part.startsWith('sb-'))
      .sort();
    if (!cookies.length) return null;

    // This opaque, memory-only digest only detects cookie changes. It never grants access.
    const input = cookies.join(';');
    let first = 2166136261;
    let second = 0x9e3779b9;
    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ (code + index), 2246822519);
    }
    return `${cookies.length}.${(first >>> 0).toString(36)}.${(second >>> 0).toString(36)}`;
  } catch {
    return null;
  }
}

function adoptSession(next: string | null) {
  if (sessionStamp === next) return false;
  sessionStamp = next;
  sequence += 1;
  inFlight = null;
  workspaceHint = null;
  verifiedSnapshot = null;
  verifiedSessionStamp = null;
  failedSessionStamp = null;
  publish(next === null ? ANONYMOUS_VIEWER : null);
  return true;
}

function hasCurrentRequest(stamp: string) {
  return inFlight?.sequence === sequence && inFlight.sessionStamp === stamp;
}

function hintedViewer(hint: WorkspaceViewerHint): ViewerState {
  return {
    signedIn: true,
    userId: hint.userId,
    activeRole: hint.role,
    fullName: hint.name,
    unreadCount: hint.unreadCount,
    assistant: { access: null, key: 'guest', aiEnabled: false },
  };
}

function isViewerState(value: unknown): value is ViewerState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ViewerState>;
  const assistant = candidate.assistant;
  return (
    typeof candidate.signedIn === 'boolean' &&
    (candidate.signedIn ? typeof candidate.userId === 'string' : candidate.userId === null) &&
    (candidate.activeRole === null ||
      candidate.activeRole === 'student' ||
      candidate.activeRole === 'teacher') &&
    typeof candidate.fullName === 'string' &&
    (candidate.unreadCount === null ||
      (typeof candidate.unreadCount === 'number' && Number.isFinite(candidate.unreadCount))) &&
    !!assistant &&
    typeof assistant.key === 'string' &&
    typeof assistant.aiEnabled === 'boolean' &&
    (assistant.access === null || typeof assistant.access === 'object')
  );
}

/** Register the current identity from a server-authorized workspace shell. */
export function registerWorkspaceViewerHint(value: WorkspaceViewerHint) {
  const stamp = readAuthSessionStamp();
  if (!stamp) {
    adoptSession(null);
    publish(ANONYMOUS_VIEWER);
    return () => undefined;
  }
  adoptSession(stamp);
  if (verifiedSnapshot && verifiedSessionStamp === stamp && !verifiedSnapshot.signedIn) {
    workspaceHint = null;
    publish(verifiedSnapshot);
    return () => undefined;
  }
  const token = ++nextHintToken;
  const previous = workspaceHint?.sessionStamp === stamp ? workspaceHint.value : null;
  workspaceHint = { token, sessionStamp: stamp, value };
  const verifiedIdentityMismatch =
    verifiedSnapshot?.signedIn === true &&
    verifiedSessionStamp === stamp &&
    (verifiedSnapshot.userId !== value.userId || verifiedSnapshot.activeRole !== value.role);
  const identityChanged =
    (previous !== null && (previous.userId !== value.userId || previous.role !== value.role)) ||
    verifiedIdentityMismatch;
  const requestWasInvalidated = identityChanged && hasCurrentRequest(stamp);
  if (identityChanged) {
    sequence += 1;
    inFlight = null;
  }

  const verifiedMatchesHint =
    verifiedSessionStamp === stamp &&
    verifiedSnapshot?.signedIn === true &&
    verifiedSnapshot.userId === value.userId &&
    verifiedSnapshot.activeRole === value.role;
  const hasRequest = hasCurrentRequest(stamp);
  const failedThisSession = failedSessionStamp === stamp;
  if (verifiedMatchesHint) publish(verifiedSnapshot);
  else if (failedThisSession) publish(hintedViewer(value));
  else if (!hasRequest) {
    verifiedSnapshot = null;
    verifiedSessionStamp = null;
    publish(null);
    if (!requestWasInvalidated) void refreshViewerState();
  }
  if (requestWasInvalidated) void refreshViewerState();

  return () => {
    if (workspaceHint?.token !== token) return;
    workspaceHint = null;
    if (verifiedSnapshot && verifiedSessionStamp === stamp) publish(verifiedSnapshot);
    else if (!hasCurrentRequest(stamp)) publish(ANONYMOUS_VIEWER);
  };
}

/**
 * Loads the display-only viewer snapshot. Visitors without a Supabase session
 * cookie are anonymous without any request. Server-authorized workspace hints
 * are memory-only and are used only while the private /api/viewer read fails.
 */
export async function refreshViewerState() {
  const stamp = readAuthSessionStamp();
  if (!stamp) {
    adoptSession(null);
    publish(ANONYMOUS_VIEWER);
    return;
  }
  adoptSession(stamp);
  const current = ++sequence;
  inFlight = { sequence: current, sessionStamp: stamp };
  lastFetchAt = Date.now();
  try {
    const response = await fetch('/api/viewer', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('viewer unavailable');
    const body: unknown = await response.json();
    if (!isViewerState(body)) throw new Error('invalid viewer response');
    const next = body;
    const latestStamp = readAuthSessionStamp();
    if (latestStamp !== stamp) {
      const changed = adoptSession(latestStamp);
      if (latestStamp) {
        if (changed) void refreshViewerState();
      } else publish(ANONYMOUS_VIEWER);
      return;
    }
    if (current !== sequence) return;
    inFlight = null;
    verifiedSnapshot = next;
    verifiedSessionStamp = stamp;
    failedSessionStamp = null;
    if (
      !next.signedIn ||
      !next.userId ||
      (workspaceHint &&
        (workspaceHint.sessionStamp !== stamp ||
          workspaceHint.value.userId !== next.userId ||
          workspaceHint.value.role !== next.activeRole))
    ) {
      workspaceHint = null;
    }
    publish(next);
  } catch {
    const latestStamp = readAuthSessionStamp();
    if (latestStamp !== stamp) {
      const changed = adoptSession(latestStamp);
      if (latestStamp) {
        if (changed) void refreshViewerState();
      } else publish(ANONYMOUS_VIEWER);
      return;
    }
    if (current !== sequence) return;
    inFlight = null;
    failedSessionStamp = stamp;
    const hint = workspaceHint?.sessionStamp === stamp ? workspaceHint.value : null;
    const currentVerified =
      hint &&
      verifiedSessionStamp === stamp &&
      verifiedSnapshot?.userId === hint.userId &&
      verifiedSnapshot.activeRole === hint.role
        ? verifiedSnapshot
        : null;
    publish(currentVerified ?? (hint ? hintedViewer(hint) : ANONYMOUS_VIEWER));
  }
}

export function getViewerStateSnapshot() {
  return snapshot;
}

export function useViewerState(): ViewerState | null {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => null,
  );
}

/**
 * Keeps the snapshot fresh: on first mount, on every route change, after a server
 * render with a new `stamp` (server actions that revalidate the layout) and when the
 * tab regains focus.
 */
export function ViewerStateSync({ stamp }: { stamp?: number }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!readAuthSessionStamp()) {
      void refreshViewerState();
      return;
    }
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const currentStamp = readAuthSessionStamp();
      if (!currentStamp || !hasCurrentRequest(currentStamp)) void refreshViewerState();
    });
    return () => {
      current = false;
    };
  }, [pathname, stamp]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchAt > MIN_FOCUS_REFRESH_MS)
        void refreshViewerState();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  return null;
}

/** Supplies a bounded fallback from the currently rendered, authorized workspace shell. */
export function WorkspaceViewerSync(hint: WorkspaceViewerHint) {
  useEffect(
    () =>
      registerWorkspaceViewerHint({
        userId: hint.userId,
        role: hint.role,
        name: hint.name,
        unreadCount: hint.unreadCount,
      }),
    [hint.userId, hint.role, hint.name, hint.unreadCount],
  );
  return null;
}
