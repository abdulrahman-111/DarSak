'use client';

import { useActionState, useState } from 'react';
import type { Locale } from '@/features/student/domain';
import type { Assignment } from './domain';
import {
  archiveGroupAssignmentAction,
  reviewAssignmentSubmissionAction,
  saveGroupAssignmentAction,
  submitAssignmentLinkAction,
} from './actions';

const control =
  'min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-hidden focus:ring-2 focus:ring-teal';
const button =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-60';

export function cairoDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function Message({ state }: { state: { error?: string; success?: string } | null }) {
  if (state?.error)
    return (
      <p role="alert" className="text-sm font-semibold text-danger">
        {state.error}
      </p>
    );
  if (state?.success)
    return (
      <p role="status" className="text-sm font-semibold text-teal">
        {state.success}
      </p>
    );
  return null;
}

export function AssignmentForm({
  locale,
  groupId,
  assignment,
}: {
  locale: Locale;
  groupId: string;
  assignment?: Assignment;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    saveGroupAssignmentAction.bind(null, locale, groupId),
    null,
  );
  const scope = `${groupId}-${assignment?.id ?? 'new'}`;
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [instructions, setInstructions] = useState(assignment?.instructions ?? '');
  const [resourceUrl, setResourceUrl] = useState(assignment?.resource_url ?? '');
  const [dueLocal, setDueLocal] = useState(cairoDateTimeLocal(assignment?.due_at));
  return (
    <form action={action} dir={ar ? 'rtl' : 'ltr'} className="grid min-w-0 gap-3">
      <input type="hidden" name="assignment_id" value={assignment?.id ?? ''} />
      <input
        type="hidden"
        name="version"
        value={assignment ? (state?.version ?? assignment.version) : ''}
      />
      <label className="grid min-w-0 gap-1 text-sm font-bold" htmlFor={`assignment-title-${scope}`}>
        {ar ? 'عنوان الواجب' : 'Title'}
        <input
          id={`assignment-title-${scope}`}
          name="title"
          required
          maxLength={160}
          value={title}
          onChange={event => setTitle(event.currentTarget.value)}
          className={control}
          aria-describedby={`assignment-title-help-${scope}`}
        />
      </label>
      <p id={`assignment-title-help-${scope}`} className="text-xs text-muted">
        {ar ? 'حتى 160 حرفًا.' : 'Up to 160 characters.'}
      </p>
      <label
        className="grid min-w-0 gap-1 text-sm font-bold"
        htmlFor={`assignment-instructions-${scope}`}
      >
        {ar ? 'التعليمات' : 'Instructions'}
        <textarea
          id={`assignment-instructions-${scope}`}
          name="instructions"
          maxLength={5000}
          rows={5}
          value={instructions}
          onChange={event => setInstructions(event.currentTarget.value)}
          className={`${control} min-h-28`}
          aria-describedby={`assignment-instructions-help-${scope}`}
        />
      </label>
      <p id={`assignment-instructions-help-${scope}`} className="text-xs text-muted">
        {ar
          ? 'حتى 5000 حرف. مثال: اقرأ الفصل الثالث وأجب عن الأسئلة 1–5.'
          : 'Up to 5,000 characters. Example: Read chapter 3 and answer questions 1–5.'}
      </p>
      <label
        className="grid min-w-0 gap-1 text-sm font-bold"
        htmlFor={`assignment-resource-${scope}`}
      >
        {ar ? 'رابط مورد (اختياري)' : 'Resource link (optional)'}
        <input
          id={`assignment-resource-${scope}`}
          name="resource_url"
          type="url"
          maxLength={2048}
          value={resourceUrl}
          onChange={event => setResourceUrl(event.currentTarget.value)}
          placeholder="https://example.com/resource"
          className={control}
          aria-describedby={`assignment-resource-help-${scope}`}
        />
      </label>
      <p
        id={`assignment-resource-help-${scope}`}
        className="wrap-break-word text-xs leading-5 text-muted"
      >
        {ar
          ? 'حتى 2048 حرفًا. أضف تعليمات أو رابط مورد واحدًا على الأقل. تأكد من ضبط صلاحية Drive للطلاب المقبولين.'
          : 'Up to 2,048 characters. Add instructions or a resource link. Check that accepted students can open shared Drive links.'}
      </p>
      <label className="grid min-w-0 gap-1 text-sm font-bold" htmlFor={`assignment-due-${scope}`}>
        {ar ? 'الموعد النهائي (اختياري)' : 'Deadline (optional)'}
        <input
          id={`assignment-due-${scope}`}
          name="due_local"
          type="datetime-local"
          value={dueLocal}
          onChange={event => setDueLocal(event.currentTarget.value)}
          className={control}
        />
      </label>
      <p className="text-xs text-muted">
        {ar
          ? 'بتوقيت القاهرة. يمكن التسليم بعد الموعد.'
          : 'Africa/Cairo time. Late submissions are allowed.'}
      </p>
      <Message state={state} />
      <button className={button} type="submit" disabled={pending}>
        {pending
          ? ar
            ? 'جارٍ النشر…'
            : 'Publishing…'
          : assignment
            ? ar
              ? 'حفظ التعديلات'
              : 'Save changes'
            : ar
              ? 'نشر الواجب'
              : 'Publish assignment'}
      </button>
    </form>
  );
}

export function ArchiveAssignmentForm({
  locale,
  assignment,
}: {
  locale: Locale;
  assignment: Assignment;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    archiveGroupAssignmentAction.bind(null, locale, assignment.id),
    null,
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <input type="hidden" name="version" value={assignment.version} />
      <button
        className="inline-flex min-h-11 items-center rounded-xl border border-orange/40 px-4 py-2.5 text-sm font-bold text-orange disabled:opacity-50"
        disabled={pending}
      >
        {pending ? '…' : ar ? 'أرشفة الواجب' : 'Archive'}
      </button>
      <Message state={state} />
    </form>
  );
}

export function StudentSubmissionForm({
  locale,
  assignment,
  archivedGroup,
}: {
  locale: Locale;
  assignment: Assignment;
  archivedGroup: boolean;
}) {
  const ar = locale === 'ar';
  const submission = assignment.submission;
  const [state, action, pending] = useActionState(
    submitAssignmentLinkAction.bind(null, locale, assignment.id),
    null,
  );
  const [url, setUrl] = useState(submission?.url ?? '');
  const [studentNote, setStudentNote] = useState(submission?.student_note ?? '');
  const readOnly = archivedGroup || assignment.status === 'archived';
  return (
    <form action={action} dir={ar ? 'rtl' : 'ltr'} className="grid min-w-0 gap-3">
      {submission && <input type="hidden" name="revision" value={submission.revision} />}
      <p className="rounded-xl bg-cream p-3 text-sm leading-6 text-muted">
        {ar
          ? 'يُرسل الرابط وملاحظتك إلى معلمك فقط. تُقبل الروابط فقط؛ تأكد من ضبط صلاحية Drive لمعلمك.'
          : 'Your teacher is the only person who can see your link and note. Links only; check that your teacher can open shared Drive links.'}
      </p>
      <label
        className="grid min-w-0 gap-1 text-sm font-bold"
        htmlFor={`submission-url-${assignment.id}`}
      >
        {ar ? 'رابط التسليم' : 'Submission link'}
        <input
          id={`submission-url-${assignment.id}`}
          name="url"
          type="url"
          required
          maxLength={2048}
          value={url}
          onChange={event => setUrl(event.currentTarget.value)}
          placeholder="https://example.com/my-work"
          className={control}
          disabled={readOnly || pending}
          aria-describedby={`submission-url-help-${assignment.id}`}
        />
      </label>
      <p id={`submission-url-help-${assignment.id}`} className="wrap-break-word text-xs text-muted">
        {ar ? 'رابط HTTP أو HTTPS حتى 2048 حرفًا.' : 'HTTP or HTTPS link, up to 2,048 characters.'}
      </p>
      <label
        className="grid min-w-0 gap-1 text-sm font-bold"
        htmlFor={`submission-note-${assignment.id}`}
      >
        {ar ? 'ملاحظة للمعلم (اختيارية)' : 'Note for your teacher (optional)'}
        <textarea
          id={`submission-note-${assignment.id}`}
          name="student_note"
          maxLength={2000}
          rows={3}
          value={studentNote}
          onChange={event => setStudentNote(event.currentTarget.value)}
          className={`${control} min-h-24`}
          disabled={readOnly || pending}
          aria-describedby={`submission-note-help-${assignment.id}`}
        />
      </label>
      <p id={`submission-note-help-${assignment.id}`} className="text-xs text-muted">
        {ar ? 'حتى 2000 حرف.' : 'Up to 2,000 characters.'}
      </p>
      {readOnly && (
        <p className="text-sm text-muted">
          {ar
            ? 'التسليمات للقراءة فقط لأن المجموعة أو الواجب مؤرشف.'
            : 'Submissions are read only because the class or assignment is archived.'}
        </p>
      )}
      <Message state={state} />
      {!readOnly && (
        <button className={button} type="submit" disabled={pending}>
          {pending
            ? ar
              ? 'جارٍ الإرسال…'
              : 'Submitting…'
            : submission
              ? ar
                ? 'تحديث التسليم'
                : 'Update submission'
              : ar
                ? 'إرسال الرابط'
                : 'Submit link'}
        </button>
      )}
    </form>
  );
}

export function ReviewAssignmentForm({
  locale,
  submissionId,
  revision,
  feedback,
  disabled,
}: {
  locale: Locale;
  submissionId: string;
  revision: number;
  feedback: string | null;
  disabled: boolean;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    reviewAssignmentSubmissionAction.bind(null, locale, submissionId),
    null,
  );
  const [feedbackText, setFeedbackText] = useState(feedback ?? '');
  return (
    <form action={action} dir={ar ? 'rtl' : 'ltr'} className="grid min-w-0 gap-2">
      <input type="hidden" name="revision" value={revision} />
      <label
        className="grid min-w-0 gap-1 text-sm font-bold"
        htmlFor={`teacher-feedback-${submissionId}`}
      >
        {ar ? 'ملاحظات خاصة للطالب' : 'Private feedback for student'}
        <textarea
          id={`teacher-feedback-${submissionId}`}
          name="teacher_feedback"
          maxLength={3000}
          rows={3}
          value={feedbackText}
          onChange={event => setFeedbackText(event.currentTarget.value)}
          className={`${control} min-h-24`}
          disabled={disabled || pending}
        />
      </label>
      <p className="text-xs text-muted">
        {ar
          ? 'حتى 3000 حرف. اتركه فارغًا لمسح الملاحظات.'
          : 'Up to 3,000 characters. Leave blank to clear feedback.'}
      </p>
      <Message state={state} />
      {!disabled && (
        <button type="submit" className={`${button} justify-self-start`} disabled={pending}>
          {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'حفظ الملاحظات' : 'Save feedback'}
        </button>
      )}
    </form>
  );
}
