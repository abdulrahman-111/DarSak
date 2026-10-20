'use client';
import { useActionState, useState } from 'react';
import { submitProblemReport } from './actions';
import { normalizeReportPagePath } from './domain';

export function ProblemReportForm({ locale }: { locale: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(submitProblemReport.bind(null, locale), null);
  const copy = ar
    ? {
        subject: 'الموضوع',
        description: 'صف ما توقعت حدوثه وما حدث بالفعل',
        page: 'الصفحة المتأثرة (اختياري)',
        hint: 'ألصق الرابط أو أدخل مسار الصفحة. ستُحفظ الصفحة فقط دون معاملات الرابط.',
        submit: 'إرسال البلاغ',
        sending: 'جارٍ الإرسال…',
        success: 'تم إرسال البلاغ. رقم المرجع:',
        expected: 'ما الذي كنت تتوقع حدوثه؟',
        actual: 'ما الذي حدث بالفعل؟',
      }
    : {
        subject: 'Subject',
        description: 'Describe what you expected and what happened',
        page: 'Affected page (optional)',
        hint: 'Paste a link or enter the page path. Only the page path is saved; URL parameters are removed.',
        submit: 'Submit report',
        sending: 'Submitting…',
        success: 'Report submitted. Reference:',
        expected: 'What did you expect to happen?',
        actual: 'What happened instead?',
      };
  return (
    <div className="grid gap-4">
      <ReportFields
        key={state?.reference || 'initial'}
        ar={ar}
        copy={copy}
        action={action}
        pending={pending}
      />
      {state?.error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.reference && (
        <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm font-semibold text-teal">
          {copy.success}{' '}
          <span dir="ltr" className="break-all">
            {state.reference}
          </span>
        </p>
      )}
    </div>
  );
}

function ReportFields({
  ar,
  copy,
  action,
  pending,
}: {
  ar: boolean;
  copy: Record<string, string>;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [subject, setSubject] = useState(''),
    [description, setDescription] = useState(''),
    [pagePath, setPagePath] = useState('');
  return (
    <form action={action} className="grid gap-4" dir={ar ? 'rtl' : 'ltr'}>
      <label className="grid gap-2 text-sm font-semibold">
        {copy.subject}
        <input
          name="subject"
          value={subject}
          onChange={event => {
            const value = event.currentTarget.value;
            setSubject(value);
          }}
          required
          minLength={2}
          maxLength={160}
          className="w-full rounded-xl border border-line bg-cream p-3"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {copy.description}
        <textarea
          name="description"
          value={description}
          onChange={event => {
            const value = event.currentTarget.value;
            setDescription(value);
          }}
          required
          minLength={10}
          maxLength={5000}
          rows={7}
          placeholder={`${copy.expected}\n\n${copy.actual}`}
          className="w-full rounded-xl border border-line bg-cream p-3"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {copy.page}
        <input
          name="page_path"
          value={pagePath}
          onChange={event => {
            const value = event.currentTarget.value;
            setPagePath(value);
          }}
          maxLength={2000}
          onBlur={event => {
            const value = event.currentTarget.value;
            setPagePath(normalizeReportPagePath(value));
          }}
          className="w-full rounded-xl border border-line bg-cream p-3"
        />
        <span className="text-xs font-normal text-muted">{copy.hint}</span>
      </label>
      <button
        disabled={pending}
        className="justify-self-start rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        {pending ? copy.sending : copy.submit}
      </button>
    </form>
  );
}
