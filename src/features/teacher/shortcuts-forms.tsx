'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { cairoDateTimeToUtc } from '@/lib/domain';
import type { Locale } from '@/features/student/domain';
import {
  copyLesson,
  deleteLessonMaterial,
  duplicateGroup,
  updateLessonStatus,
  type TeacherShortcutActionState,
} from './shortcuts-actions';

const control = 'mt-1 block w-full rounded-xl border border-line bg-cream p-3';

export function DuplicateGroupForm({ locale, groupId }: { locale: Locale; groupId: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(duplicateGroup.bind(null, locale), null);
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <input type="hidden" name="source_group_id" value={groupId} />
      <button
        disabled={pending}
        className="rounded-xl border border-line px-4 py-3 font-bold text-teal disabled:opacity-50"
      >
        {pending ? (ar ? 'جارٍ النسخ…' : 'Duplicating…') : ar ? 'نسخ المجموعة' : 'Duplicate group'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function CopyLessonForm({
  locale,
  sourceLessonId,
  groups,
}: {
  locale: Locale;
  sourceLessonId: string;
  groups: Array<{ id: string; name: string }>;
}) {
  const ar = locale === 'ar';
  async function submit(
    previous: TeacherShortcutActionState,
    form: FormData,
  ): Promise<TeacherShortcutActionState> {
    try {
      form.set('starts_at', cairoDateTimeToUtc(String(form.get('starts_local') ?? '')));
      form.set('ends_at', cairoDateTimeToUtc(String(form.get('ends_local') ?? '')));
    } catch {
      return {
        error: ar
          ? 'اختر وقتاً صحيحاً في القاهرة. بعض الأوقات غير موجودة أو تتكرر عند تغيير التوقيت الصيفي.'
          : 'Choose valid Cairo times. Some times are missing or ambiguous during daylight-saving changes.',
      };
    }
    return copyLesson(locale, sourceLessonId, previous, form);
  }
  const [state, action, pending] = useActionState(submit, null);
  return (
    <form action={action} onReset={event => event.preventDefault()} className="grid gap-3">
      <label className="text-sm font-bold">
        {ar ? 'المجموعة المستهدفة' : 'Target group'}
        <select name="target_group_id" required defaultValue="" className={control}>
          <option value="" disabled>
            {ar ? '— اختر مجموعة —' : '— Choose a group —'}
          </option>
          {groups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          {ar ? 'البداية بتوقيت القاهرة' : 'Starts (Cairo time)'}
          <input name="starts_local" type="datetime-local" required className={control} />
        </label>
        <label className="text-sm font-bold">
          {ar ? 'النهاية بتوقيت القاهرة' : 'Ends (Cairo time)'}
          <input name="ends_local" type="datetime-local" required className={control} />
        </label>
      </div>
      <button
        disabled={pending || !groups.length}
        className="rounded-xl bg-orange px-4 py-3 font-bold text-white disabled:opacity-50 hover:bg-orange-deep"
      >
        {pending ? (ar ? 'جارٍ النسخ…' : 'Copying…') : ar ? 'نسخ الحصة' : 'Copy lesson'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.success && (
        <div role="status" className="grid gap-2 text-sm text-teal">
          <p>{state.success}</p>
          {state.lessonId && (
            <Link
              href={`/${locale}/teacher/lessons/${state.lessonId}`}
              className="font-bold underline"
            >
              {ar ? 'فتح الحصة المنسوخة' : 'Open copied lesson'}
            </Link>
          )}
        </div>
      )}
    </form>
  );
}

export function LessonShortcutStatusControls({
  locale,
  lessonId,
  status,
}: {
  locale: Locale;
  lessonId: string;
  status: string;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    async (_previous: TeacherShortcutActionState, form: FormData) =>
      updateLessonStatus(locale, lessonId, String(form.get('status'))),
    null,
  );
  const confirmCancel = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.value === 'cancelled') {
      const prompt = ar ? 'هل تريد إلغاء هذه الحصة؟' : 'Cancel this lesson?';
      if (!window.confirm(prompt)) event.preventDefault();
    }
  };
  return (
    <form
      action={action}
      onSubmit={confirmCancel}
      onReset={event => event.preventDefault()}
      className="flex flex-wrap gap-2"
    >
      {status !== 'completed' && (
        <button
          name="status"
          value="completed"
          disabled={pending}
          className="rounded-xl bg-teal px-3 py-2 text-sm font-bold text-white"
        >
          {pending ? '…' : ar ? 'تحديد كمكتملة' : 'Mark completed'}
        </button>
      )}
      {status !== 'cancelled' && (
        <button
          name="status"
          value="cancelled"
          disabled={pending}
          className="rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-700"
        >
          {pending ? '…' : ar ? 'إلغاء الحصة' : 'Cancel lesson'}
        </button>
      )}
      {status !== 'scheduled' && (
        <button
          name="status"
          value="scheduled"
          disabled={pending}
          className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal"
        >
          {pending ? '…' : ar ? 'إعادة للجدول' : 'Restore scheduled'}
        </button>
      )}
      {state?.error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="w-full text-sm text-teal">
          {ar ? 'تم تحديث حالة الحصة.' : 'Lesson status updated.'}
        </p>
      )}
    </form>
  );
}

export function DeleteLessonMaterialButton({
  locale,
  lessonId,
  materialId,
}: {
  locale: Locale;
  lessonId: string;
  materialId: string;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    async (_previous: TeacherShortcutActionState, _form: FormData) =>
      deleteLessonMaterial(locale, lessonId, materialId),
    null,
  );
  const confirmDelete = (event: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(ar ? 'هل تريد حذف هذه المادة؟' : 'Delete this material?'))
      event.preventDefault();
  };
  return (
    <form action={action} onSubmit={confirmDelete} onReset={event => event.preventDefault()}>
      <button disabled={pending} className="text-sm font-bold text-red-700 underline">
        {pending ? '…' : ar ? 'حذف' : 'Delete'}
      </button>
      {state?.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="mt-1 text-xs text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}
