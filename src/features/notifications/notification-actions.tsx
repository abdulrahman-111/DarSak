'use client';

import { useActionState, useEffect, useRef } from 'react';
import { markNotificationsViewed, type NotificationActionState } from './actions';

/** Marks the listed unread notifications as read once, shortly after the page is shown. */
export function MarkViewedOnOpen({ locale, ids }: { locale: string; ids: string[] }) {
  const done = useRef<string>('');
  const key = ids.join(',');
  useEffect(() => {
    if (!key || done.current === key) return;
    done.current = key;
    const timer = setTimeout(() => void markNotificationsViewed(locale, key.split(',')), 1200);
    return () => clearTimeout(timer);
  }, [locale, key]);
  return null;
}

export function NotificationSubmit({
  children,
  pending,
  action,
}: {
  children: string;
  pending: string;
  action: (state: NotificationActionState, formData: FormData) => Promise<NotificationActionState>;
}) {
  const [state, formAction, busy] = useActionState(action, null);
  return (
    <form action={formAction} className="grid justify-items-start gap-1">
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg border border-teal px-3 py-2 text-sm font-bold text-teal disabled:opacity-60"
      >
        {busy ? pending : children}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
      {state?.success && (
        <span role="status" className="text-xs text-muted">
          {state.success}
        </span>
      )}
    </form>
  );
}
