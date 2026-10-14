'use client';

import { useActionState } from 'react';
import type { NotificationActionState } from './actions';

export function NotificationSubmit({ children, pending, action }: { children: string; pending: string; action: (state: NotificationActionState, formData: FormData)=>Promise<NotificationActionState> }) {
  const [state, formAction, busy]=useActionState(action,null);
  return <form action={formAction} className="grid justify-items-start gap-1"><button type="submit" disabled={busy} className="rounded-lg border border-teal px-3 py-2 text-sm font-bold text-teal disabled:opacity-60">{busy?pending:children}</button>{state?.error&&<span role="alert" className="text-xs text-red-800">{state.error}</span>}{state?.success&&<span role="status" className="text-xs text-muted">{state.success}</span>}</form>;
}
