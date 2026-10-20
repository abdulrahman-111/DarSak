'use client';
import { useActionState } from 'react';
import { feedbackAction } from './actions';
import type { FeedbackRow } from './domain';
export function FeedbackForm({
  locale,
  kind,
  id,
  row,
}: {
  locale: string;
  kind: 'save' | 'withdraw' | 'reply' | 'moderate';
  id: string;
  row?: FeedbackRow | null;
}) {
  const ar = locale === 'ar',
    [state, action, pending] = useActionState(feedbackAction.bind(null, locale, kind, id), null);
  return (
    <form action={action} onReset={e => e.preventDefault()} className="mt-4 grid gap-3">
      <input type="hidden" name="version" value={state?.version ?? row?.version ?? 0} />
      {kind === 'save' && (
        <>
          <label className="grid gap-2 text-sm font-bold">
            {ar ? 'التقييم من ٥' : 'Rating out of 5'}
            <select
              name="rating"
              defaultValue={row?.rating ?? 5}
              className="rounded-xl border border-line bg-cream p-3"
            >
              {[5, 4, 3, 2, 1].map(n => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            {ar
              ? 'تجربتك (٢٠–١٥٠٠ حرف؛ لا تضف بيانات شخصية)'
              : 'Your experience (20–1,500 characters; no personal information)'}
            <textarea
              name="comment"
              minLength={20}
              maxLength={1500}
              required
              rows={4}
              defaultValue={row?.comment ?? ''}
              className="rounded-xl border border-line bg-cream p-3"
            />
          </label>
        </>
      )}
      {kind === 'reply' && (
        <label className="grid gap-2 text-sm font-bold">
          {ar ? 'رد المعلم (حتى ١٥٠٠ حرف)' : 'Teacher reply (up to 1,500 characters)'}
          <textarea
            name="reply"
            defaultValue={row?.reply_pending || row?.reply_public || ''}
            required
            maxLength={1500}
            rows={3}
            className="rounded-xl border border-line bg-cream p-3"
          />
        </label>
      )}
      {kind === 'moderate' && (
        <>
          <label className="grid gap-2 text-sm font-bold">
            {ar ? 'قرار الإشراف' : 'Moderation decision'}
            <select name="decision" className="rounded-xl border border-line bg-cream p-3">
              {[
                ['approve', ar ? 'نشر التقييم' : 'Publish feedback'],
                ['hide', ar ? 'إخفاء التقييم' : 'Hide feedback'],
                ['approve_reply', ar ? 'نشر الرد' : 'Publish reply'],
                ['hide_reply', ar ? 'إخفاء الرد' : 'Hide reply'],
              ].map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            {ar ? 'ملاحظة إدارية خاصة (١٥٠٠ حرف)' : 'Private administrator note (1,500 characters)'}
            <textarea
              name="admin_note"
              defaultValue={row?.admin_note ?? ''}
              maxLength={1500}
              rows={3}
              className="rounded-xl border border-line bg-cream p-3"
            />
          </label>
        </>
      )}
      <button
        disabled={pending}
        className="min-h-11 justify-self-start rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        {pending
          ? ar
            ? 'جارٍ الحفظ…'
            : 'Saving…'
          : kind === 'withdraw'
            ? ar
              ? 'سحب تقييمي'
              : 'Withdraw my feedback'
            : ar
              ? 'حفظ'
              : 'Save'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-800">
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
