'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { ANONYMOUS_VIEWER, type ViewerState } from '@/features/platform/viewer-state-types';

const MIN_FOCUS_REFRESH_MS = 30_000;

let snapshot: ViewerState | null = null;
let verifiedSnapshot: ViewerState | null = null;
let workspaceHint: { token: number; value: WorkspaceViewerHint } | null = null;
let nextHintToken = 0;
let lastFetchAt = 0;
let lastFetchFailed = false;
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

function hasAuthCookie() {
  try {
    return document.cookie.split(';').some(part => part.trim().startsWith('sb-'));
  } catch {
    return false;
  }
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
  if (!hasAuthCookie()) {
    sequence += 1;
    workspaceHint = null;
    verifiedSnapshot = null;
    lastFetchFailed = false;
    publish(ANONYMOUS_VIEWER);
    return () => undefined;
  }
  if (verifiedSnapshot && !verifiedSnapshot.signedIn) {
    workspaceHint = null;
    publish(verifiedSnapshot);
    return () => undefined;
  }
  const token = ++nextHintToken;
  const previous = workspaceHint?.value;
  workspaceHint = { token, value };

  if (!previous || previous.userId !== value.userId || previous.role !== value.role) {
    sequence += 1;
    if (
      !verifiedSnapshot ||
      verifiedSnapshot.userId !== value.userId ||
      verifiedSnapshot.activeRole !== value.role
    ) {
      verifiedSnapshot = null;
      publish(lastFetchFailed ? hintedViewer(value) : null);
    }
  }

  return () => {
    if (workspaceHint?.token !== token) return;
    workspaceHint = null;
    sequence += 1;
    if (verifiedSnapshot === null) publish(null);
  };
}

/**
 * Loads the display-only viewer snapshot. Visitors without a Supabase session
 * cookie are anonymous without any request. Server-authorized workspace hints
 * are memory-only and are used only while the private /api/viewer read fails.
 */
export async function refreshViewerState() {
  if (!hasAuthCookie()) {
    sequence += 1;
    workspaceHint = null;
    verifiedSnapshot = null;
    lastFetchFailed = false;
    publish(ANONYMOUS_VIEWER);
    return;
  }
  const current = ++sequence;
  lastFetchAt = Date.now();
  try {
    const response = await fetch('/api/viewer', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('viewer unavailable');
    const body: unknown = await response.json();
    if (!isViewerState(body)) throw new Error('invalid viewer response');
    const next = body;
    if (current !== sequence) return;
    verifiedSnapshot = next;
    lastFetchFailed = false;
    if (
      !next.signedIn ||
      !next.userId ||
      (workspaceHint &&
        (workspaceHint.value.userId !== next.userId ||
          workspaceHint.value.role !== next.activeRole))
    ) {
      workspaceHint = null;
    }
    publish(next);
  } catch {
    if (current !== sequence) return;
    lastFetchFailed = true;
    const hint = workspaceHint?.value;
    const currentVerified =
      hint && verifiedSnapshot?.userId === hint.userId && verifiedSnapshot.activeRole === hint.role
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
    if (!hasAuthCookie()) {
      void refreshViewerState();
      return;
    }
    let current = true;
    queueMicrotask(() => {
      if (current) void refreshViewerState();
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
