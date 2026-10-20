'use client';

import { useActionState, useState } from 'react';
import { decideTeacherReview } from './actions';

const copy = (locale: string) =>
  locale === 'ar'
    ? {
        approve: 'اعتماد الطلب',
        decline: 'رفض الطلب',
        reason: 'سبب الرفض',
        reasonHint: 'اكتب سببًا واضحًا يساعد المعلم على معرفة ما يحتاج إلى تحديثه.',
        confirmingApprove: 'هل تريد اعتماد طلب هذا المعلم؟',
        confirmingDecline: 'هل تريد رفض هذا الطلب بالسبب المكتوب؟',
        working: 'جارٍ حفظ القرار…',
        approved: 'تم الاعتماد',
        declined: 'تم الرفض',
        stale: 'حدّث الصفحة قبل اتخاذ القرار التالي.',
      }
    : {
        approve: 'Approve request',
        decline: 'Decline request',
        reason: 'Reason for decline',
        reasonHint: 'Explain what the teacher should update before requesting another review.',
        confirmingApprove: 'Approve this teacher request?',
        confirmingDecline: 'Decline this request with the reason shown?',
        working: 'Saving decision…',
        approved: 'Approved',
        declined: 'Declined',
        stale: 'Refresh this page before making another decision.',
      };

export function ReviewDecisionForm({
  locale,
  teacherId,
  requestId,
  submittedReady,
}: {
  locale: string;
  teacherId: string;
  requestId: string;
  submittedReady: boolean;
}) {
  const t = copy(locale);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [state, action, pending] = useActionState(decideTeacherReview.bind(null, locale), null);
  if (!submittedReady) return null;
  return (
    <form
      action={action}
      onSubmit={event => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const decision = submitter?.value;
        if (decision === 'declined' && !reason.trim()) {
          event.preventDefault();
          setReasonError(true);
          return;
        }
        if (!window.confirm(decision === 'approved' ? t.confirmingApprove : t.confirmingDecline))
          event.preventDefault();
      }}
      className="grid gap-3"
    >
      <input type="hidden" name="teacher_id" value={teacherId} />
      <input type="hidden" name="expected_request_id" value={requestId} />
      <label className="grid gap-2 text-sm font-semibold">
        {t.reason}
        <textarea
          name="reason"
          value={reason}
          onChange={event => {
            setReason(event.target.value);
            setReasonError(false);
          }}
          maxLength={1000}
          rows={4}
          aria-invalid={reasonError || undefined}
          aria-describedby="review-reason-hint"
          className="w-full rounded-xl border border-line bg-cream p-3"
        />
      </label>
      <p id="review-reason-hint" className="text-sm text-muted">
        {t.reasonHint}
      </p>
      {reasonError && (
        <p role="alert" className="text-sm text-danger">
          {locale === 'ar' ? 'سبب الرفض مطلوب.' : 'A decline reason is required.'}
        </p>
      )}
      {(state?.fieldError || state?.error) && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {state.fieldError || state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm text-teal">
          {state.success} {t.stale}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          name="decision"
          value="approved"
          disabled={pending}
          className="rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {pending ? t.working : t.approve}
        </button>
        <button
          name="decision"
          value="declined"
          disabled={pending}
          className="rounded-xl bg-danger px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {pending ? t.working : t.decline}
        </button>
      </div>
    </form>
  );
}
