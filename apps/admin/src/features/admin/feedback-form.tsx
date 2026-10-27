'use client';

import { useActionState } from 'react';
import type { FeedbackRow } from '@/features/feedback/domain';
import { moderateFeedback } from './feedback-actions';
type FeedbackState = { error?: string; success?: string; version?: number } | null;

export function AdminFeedbackForm({ locale, row }: { locale: string; row: FeedbackRow }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState<FeedbackState, FormData>(
    moderateFeedback.bind(null, locale, row.id),
    null,
  );
  return (
    <form action={action} className="mt-4 grid gap-3">
      <input type="hidden" name="version" value={state?.version ?? row.version} />
      <label className="grid gap-2 text-sm font-bold">
        {ar ? 'قرار الإشراف' : 'Moderation decision'}
        <select name="decision" className="rounded-xl border border-line bg-cream p-3">
          {[
            ['approve', ar ? 'نشر التقييم' : 'Publish feedback'],
            ['hide', ar ? 'إخفاء التقييم' : 'Hide feedback'],
            ['approve_reply', ar ? 'نشر الرد' : 'Publish reply'],
            ['hide_reply', ar ? 'إخفاء الرد' : 'Hide reply'],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-bold">
        {ar ? 'ملاحظة إدارية خاصة (١٥٠٠ حرف)' : 'Private administrator note (1,500 characters)'}
        <textarea
          name="admin_note"
          defaultValue={row.admin_note ?? ''}
          maxLength={1500}
          rows={3}
          className="rounded-xl border border-line bg-cream p-3"
        />
      </label>
      <button
        disabled={pending}
        className="min-h-11 justify-self-start rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'حفظ' : 'Save'}
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
