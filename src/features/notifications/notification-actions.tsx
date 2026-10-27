'use client';

import { useActionState } from 'react';
import type { NotificationActionState } from './actions';

export function NotificationSubmit({
  children,
  pending,
  action,
  variant = 'secondary',
}: {
  children: string;
  pending: string;
  action: (state: NotificationActionState, formData: FormData) => Promise<NotificationActionState>;
  variant?: 'primary' | 'secondary';
}) {
  const [state, formAction, busy] = useActionState(action, null);
  return (
    <form action={formAction} className="grid justify-items-start gap-1">
      <button
        type="submit"
        disabled={busy}
        className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-60 ${variant === 'primary' ? 'bg-teal text-white' : 'border border-teal text-teal'}`}
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
