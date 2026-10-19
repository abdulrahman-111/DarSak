'use client';
import { useActionState } from 'react';
import { savedGroupAction } from './saved-actions';
import type { Locale } from './domain';

export function SavedGroupForm({ locale, groupId, saved }: { locale: Locale; groupId: string; saved: boolean }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(savedGroupAction.bind(null, locale, groupId, !saved), null);
  return <form action={action} className="space-y-2">
    <button type="submit" disabled={pending} className="min-h-11 w-full rounded-xl bg-cream px-4 py-3 font-bold text-teal transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 disabled:opacity-60">{pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : saved ? (ar ? 'إزالة من قائمتي' : 'Remove from saved') : (ar ? 'حفظ في قائمتي' : 'Save for later')}</button>
    {state?.error && <p role="alert" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>}
    {state?.success && <p role="status" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-teal">{state.success}</p>}
  </form>;
}
