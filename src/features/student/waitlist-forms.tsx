'use client';
import { useActionState } from 'react';
import type { Locale } from './domain';
import {
  joinWaitlistAction,
  promoteWaitlistAction,
  withdrawWaitlistAction,
} from './waitlist-actions';

export function WaitlistJoinForm({ locale, groupId }: { locale: Locale; groupId: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    joinWaitlistAction.bind(null, locale, groupId),
    null,
  );
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm leading-6 text-cream/90">
        {ar
          ? 'إذا توفر مقعد، يمكن لمعلمك نقل إدخالك إلى مراجعة طلبات الانضمام. بانضمامك، تسمح بهذا النقل ويمكنك المغادرة في أي وقت. لا يتأكد المقعد إلا بعد موافقة المعلم.'
          : 'If a place opens, your teacher can move you to enrollment review. Joining gives permission for this; you can leave at any time. A place is confirmed only after teacher approval.'}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-xl bg-cream px-5 py-3 font-bold text-teal disabled:opacity-50"
      >
        {pending
          ? ar
            ? 'جارٍ الحفظ…'
            : 'Joining…'
          : ar
            ? 'انضم إلى قائمة الانتظار'
            : 'Join waitlist'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-cream">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-cream">
          {state.success}
        </p>
      )}
    </form>
  );
}

export function WaitlistWithdrawForm({ locale, entryId }: { locale: Locale; entryId: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    withdrawWaitlistAction.bind(null, locale, entryId),
    null,
  );
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-xl border border-line bg-cream px-4 py-2 font-bold text-teal disabled:opacity-50"
      >
        {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'غادر قائمة الانتظار' : 'Leave waitlist'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}

export function WaitlistPromoteForm({
  locale,
  entryId,
  canPromote,
}: {
  locale: Locale;
  entryId: string;
  canPromote: boolean;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    promoteWaitlistAction.bind(null, locale, entryId),
    null,
  );
  return (
    <form action={action} className="mt-4 space-y-2">
      <button
        type="submit"
        disabled={!canPromote || pending}
        className="min-h-11 rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? ar
            ? 'جارٍ النقل…'
            : 'Moving…'
          : ar
            ? 'نقل إلى مراجعة الطلبات'
            : 'Move to review'}
      </button>
      <p className="text-xs leading-5 text-muted">
        {ar
          ? 'ينشئ هذا طلب انضمام بانتظار مراجعتك، ولا يؤكد المقعد.'
          : 'This creates an enrollment request awaiting your review. It does not confirm a place.'}
      </p>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}
