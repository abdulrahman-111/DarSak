'use client';
import { useActionState } from 'react';
import { renewTeacherAccess } from './actions';
export function RenewalForm({
  locale,
  canRenew,
  feesEnabled,
  pendingRequest = false,
  hasAccess = false,
}: {
  locale: string;
  canRenew: boolean;
  feesEnabled: boolean;
  pendingRequest?: boolean;
  hasAccess?: boolean;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    renewTeacherAccess.bind(null, locale as 'en' | 'ar'),
    null,
  );
  const waiting = feesEnabled && pendingRequest;
  return (
    <form action={action} className="grid gap-3">
      <p className="text-sm leading-6 text-muted">
        {feesEnabled
          ? ar
            ? 'قد يتطلب التجديد مراجعة الإدارة. لا تتم أي عملية دفع هنا.'
            : 'Renewal may require administrator review. No payment is collected here.'
          : ar
            ? 'التجديد مجاني حالياً. لا توجد رسوم أو عملية دفع.'
            : 'Renewal is free while fees are disabled. No charges or payment are collected.'}
      </p>
      {waiting && (
        <p role="status" className="rounded-xl bg-orange/10 p-3 text-sm font-semibold text-teal">
          {hasAccess
            ? ar
              ? 'طلب التجديد بانتظار المراجعة؛ تظل صلاحيتك الحالية فعالة.'
              : 'A renewal request is awaiting review; your current access remains active.'
            : ar
              ? 'طلب التجديد بانتظار المراجعة؛ يظل التدريس متوقفاً حتى الاعتماد.'
              : 'A renewal request is awaiting review; teaching remains paused until approval.'}
        </p>
      )}
      {canRenew && !waiting && (
        <button
          disabled={pending}
          className="w-fit rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {pending
            ? ar
              ? 'جارٍ الإرسال…'
              : 'Submitting…'
            : ar
              ? 'طلب التجديد'
              : 'Renew teaching access'}
        </button>
      )}
      {!canRenew && !waiting && (
        <p className="text-sm font-semibold">
          {ar
            ? 'يفتح التجديد قبل انتهاء الصلاحية بسبعة أيام حسب توقيت القاهرة.'
            : 'Renewal opens seven Cairo calendar days before expiry.'}
        </p>
      )}
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
