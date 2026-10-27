'use client';

import { useActionState } from 'react';
import type { AdminNotificationActionState } from './actions';

export function AdminNotificationSubmit({
  children,
  pending,
  action,
  primary = false,
}: {
  children: string;
  pending: string;
  action: (
    state: AdminNotificationActionState,
    formData: FormData,
  ) => Promise<AdminNotificationActionState>;
  primary?: boolean;
}) {
  const [state, formAction, busy] = useActionState(action, null);
  return (
    <form action={formAction} className="grid justify-items-start gap-1">
      <button
        type="submit"
        disabled={busy}
        className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-60 ${primary ? 'bg-teal text-white' : 'border border-teal text-teal'}`}
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
