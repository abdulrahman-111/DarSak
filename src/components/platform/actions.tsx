'use client';
import { useActionState } from 'react';
import { decideEnrollment } from '@/features/platform/actions';
import { addMaterial, deleteMaterial, setLessonStatus } from '@/features/teacher/actions';

export function EnrollmentDecisionButtons({
  locale,
  id,
  status,
}: {
  locale: string;
  id: string;
  status: string;
}) {
  const ar = locale === 'ar';
  const [state, dispatch, pending] = useActionState(
    async (_previous: { error?: string; ok?: boolean } | null, formData: FormData) =>
      decideEnrollment(
        locale,
        id,
        String(formData.get('decision')) as 'accepted' | 'rejected' | 'removed',
      ),
    null,
  );
  // Declining or removing notifies the student and is hard to undo, so ask first. Accepting stays one tap.
  const confirmDecision = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    const prompt =
      submitter.value === 'removed'
        ? ar
          ? 'هل تريد إزالة هذا الطالب من المجموعة؟ سيفقد الوصول إلى الحصص والمواد.'
          : 'Remove this student from the group? They will lose access to its lessons and materials.'
        : submitter.value === 'rejected'
          ? ar
            ? 'هل تريد رفض طلب الانضمام هذا؟'
            : 'Decline this enrollment request?'
          : null;
    if (prompt && !window.confirm(prompt)) event.preventDefault();
  };
  const danger =
    'min-h-11 rounded-xl border border-danger/30 bg-white px-3 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange';
  return (
    <form
      action={dispatch}
      onSubmit={confirmDecision}
      className="mt-3 flex flex-wrap gap-2"
      aria-busy={pending}
    >
      {status === 'pending' && (
        <>
          <button
            name="decision"
            value="accepted"
            disabled={pending}
            className="min-h-11 rounded-xl bg-teal px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
          >
            {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'قبول' : 'Accept'}
          </button>
          <button name="decision" value="rejected" disabled={pending} className={danger}>
            {ar ? 'رفض' : 'Decline'}
          </button>
        </>
      )}
      {status === 'accepted' && (
        <button name="decision" value="removed" disabled={pending} className={danger}>
          {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'إزالة الطالب' : 'Remove student'}
        </button>
      )}
      {state?.error && (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

const field = 'mt-1 w-full rounded-xl border border-line bg-cream px-3 py-2.5';
function Result({ state }: { state: { error?: string; success?: string } | null }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  ) : state?.success ? (
    <p role="status" className="text-sm text-teal">
      {state.success}
    </p>
  ) : null;
}
export function TeacherMaterialForms({
  locale,
  lessonId,
}: {
  locale: 'ar' | 'en';
  lessonId: string;
}) {
  const ar = locale === 'ar';
  const [resource, resourceAction, resourcePending] = useActionState(
    addMaterial.bind(null, locale, lessonId),
    null,
  );
  return (
    <div className="grid gap-5">
      <form action={resourceAction} className="grid gap-3">
        <h3 className="font-black text-teal">{ar ? 'إضافة رابط' : 'Add link'}</h3>
        <input type="hidden" name="kind" value="link" />
        <label className="text-sm font-bold">
          {ar ? 'العنوان' : 'Title'}
          <input name="title" required maxLength={180} className={field} />
        </label>
        <label className="text-sm font-bold">
          {ar ? 'الرابط' : 'URL'}
          <input
            name="url"
            type="url"
            dir="ltr"
            placeholder="https://"
            required
            className={field}
          />
        </label>
        <button
          disabled={resourcePending}
          className="rounded-xl bg-teal px-4 py-2.5 font-bold text-white"
        >
          {resourcePending ? '…' : ar ? 'إضافة الرابط' : 'Add link'}
        </button>
        <Result state={resource} />
      </form>
      <p className="border-t border-line pt-5 text-sm text-muted">
        {ar
          ? 'رفع الملفات غير متاح عند الإطلاق. أضف رابطاً بدلاً من ذلك.'
          : 'File uploads are unavailable at launch. Add a link instead.'}
      </p>
    </div>
  );
}

export function LessonStatusControls({
  locale,
  lessonId,
  status,
}: {
  locale: 'ar' | 'en';
  lessonId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(
    async (_previous: { error?: string; ok?: boolean } | null, formData: FormData) =>
      setLessonStatus(locale, lessonId, String(formData.get('status'))),
    null,
  );
  return (
    <form action={action} className="flex flex-wrap gap-2">
      {status !== 'completed' && (
        <button
          name="status"
          value="completed"
          disabled={pending}
          className="rounded-xl bg-teal px-3 py-2 text-sm font-bold text-white"
        >
          {locale === 'ar' ? 'تحديد كمكتملة' : 'Mark completed'}
        </button>
      )}
      {status !== 'cancelled' && (
        <button
          name="status"
          value="cancelled"
          disabled={pending}
          className="rounded-xl border border-danger/30 px-3 py-2 text-sm font-bold text-danger"
        >
          {locale === 'ar' ? 'إلغاء الحصة' : 'Cancel lesson'}
        </button>
      )}
      {status !== 'scheduled' && (
        <button
          name="status"
          value="scheduled"
          disabled={pending}
          className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal"
        >
          {locale === 'ar' ? 'إعادة للجدول' : 'Restore scheduled'}
        </button>
      )}
      {state?.error && (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function DeleteMaterialButton({
  locale,
  lessonId,
  materialId,
}: {
  locale: 'ar' | 'en';
  lessonId: string;
  materialId: string;
}) {
  const [state, action, pending] = useActionState(
    async () => deleteMaterial(locale, lessonId, materialId),
    null,
  );
  return (
    <form action={action}>
      <button disabled={pending} className="text-sm font-bold text-danger underline">
        {pending ? '…' : locale === 'ar' ? 'حذف' : 'Delete'}
      </button>
      {state?.error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
