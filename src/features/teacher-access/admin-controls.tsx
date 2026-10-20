'use client';
import { useActionState } from 'react';
import { decideTeacherAccess, saveTeacherFeePolicy } from './admin-actions';
export function AccessDecision({ locale, requestId }: { locale: string; requestId: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(decideTeacherAccess.bind(null, locale), null);
  return (
    <form
      action={action}
      onSubmit={e => {
        const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (
          !window.confirm(
            sub?.value === 'approve'
              ? ar
                ? 'اعتماد هذا التجديد؟'
                : 'Approve this renewal?'
              : ar
                ? 'رفض هذا التجديد؟'
                : 'Decline this renewal?',
          )
        )
          e.preventDefault();
      }}
      className="mt-3 flex flex-wrap gap-2"
    >
      <input type="hidden" name="request_id" value={requestId} />
      <button
        name="decision"
        value="approve"
        disabled={pending}
        className="rounded-lg bg-teal px-3 py-2 font-bold text-white"
      >
        {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'اعتماد' : 'Approve'}
      </button>
      <button
        name="decision"
        value="decline"
        disabled={pending}
        className="rounded-lg border border-line px-3 py-2 font-bold"
      >
        {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'رفض' : 'Decline'}
      </button>
      {state?.error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="basis-full text-sm text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}
function cairoInputValue(effectiveAt: string | null) {
  if (!effectiveAt || !Number.isFinite(Date.parse(effectiveAt))) return '';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(effectiveAt))
      .replace(' ', 'T');
  } catch {
    return '';
  }
}
export function FeePolicyForm({
  locale,
  enabled,
  effectiveAt,
  announcementEn,
  announcementAr,
}: {
  locale: string;
  enabled: boolean;
  effectiveAt: string | null;
  announcementEn: string | null;
  announcementAr: string | null;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(saveTeacherFeePolicy.bind(null, locale), null);
  return (
    <form
      action={action}
      onSubmit={e => {
        if (
          !window.confirm(
            ar
              ? 'هل تريد حفظ تغيير سياسة رسوم الوصول؟'
              : 'Save this teaching access fee policy change?',
          )
        )
          e.preventDefault();
      }}
      className="grid gap-3"
    >
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="enabled" value="true" defaultChecked={enabled} />
        {ar
          ? 'تفعيل المراجعة المدفوعة في التاريخ المحدد (لا تتم أي مدفوعات هنا)'
          : 'Enable paid-mode review at the selected date (no payments are collected here)'}
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {ar ? 'تاريخ السريان بتوقيت القاهرة' : 'Effective date and time (Africa/Cairo)'}
        <input
          type="datetime-local"
          name="effective_at"
          defaultValue={cairoInputValue(effectiveAt)}
          className="rounded-xl border border-line bg-cream p-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        English announcement
        <textarea
          name="announcement_en"
          maxLength={1000}
          defaultValue={announcementEn ?? ''}
          className="rounded-xl border border-line bg-cream p-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        الإعلان بالعربية
        <textarea
          name="announcement_ar"
          maxLength={1000}
          defaultValue={announcementAr ?? ''}
          className="rounded-xl border border-line bg-cream p-3"
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="confirm" required />
        {ar
          ? 'أؤكد تغيير السياسة والإعلان للمعلمين'
          : 'I confirm this policy change and teacher announcement'}
      </label>
      <button
        disabled={pending}
        className="w-fit rounded-xl bg-teal px-5 py-3 font-bold text-white"
      >
        {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'حفظ السياسة' : 'Save policy'}
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
