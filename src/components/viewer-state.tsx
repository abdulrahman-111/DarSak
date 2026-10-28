'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { ANONYMOUS_VIEWER, type ViewerState } from '@/features/platform/viewer-state-types';

const STORAGE_KEY = 'darsak:viewer:v1';
const MIN_FOCUS_REFRESH_MS = 30_000;

let snapshot: ViewerState | null = null;
let lastFetchAt = 0;
let sequence = 0;
const listeners = new Set<() => void>();

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

function readStored(): ViewerState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as ViewerState) : null;
    return value && typeof value.signedIn === 'boolean' && value.assistant ? value : null;
  } catch {
    return null;
  }
}

function writeStored(value: ViewerState | null) {
  try {
    if (value?.signedIn) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is only a first-paint convenience.
  }
}

/**
 * Loads the display-only viewer snapshot. Visitors without a Supabase session
 * cookie are anonymous without any request. Everyone else gets the last known
 * snapshot immediately (tab storage) and a fresh private /api/viewer read.
 */
export async function refreshViewerState() {
  if (!hasAuthCookie()) {
    writeStored(null);
    publish(ANONYMOUS_VIEWER);
    return;
  }
  const current = ++sequence;
  lastFetchAt = Date.now();
  try {
    const response = await fetch('/api/viewer', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('viewer unavailable');
    const next = (await response.json()) as ViewerState;
    if (current !== sequence) return;
    writeStored(next);
    publish(next);
  } catch {
    if (current === sequence && snapshot === null) publish(ANONYMOUS_VIEWER);
  }
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
    if (snapshot === null && hasAuthCookie()) {
      const stored = readStored();
      if (stored) publish(stored);
    }
    void refreshViewerState();
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
