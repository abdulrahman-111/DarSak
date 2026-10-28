'use client';

import { useActionState } from 'react';
import { setLessonReminderPreference } from './actions';
import {
  LESSON_REMINDER_PREFERENCES,
  lessonReminderOptionLabel,
  type LessonReminderPreference,
} from './reminder-preference';

export function ReminderPreferenceForm({
  locale,
  initial,
}: {
  locale: string;
  initial: LessonReminderPreference;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    setLessonReminderPreference.bind(null, locale),
    null,
  );
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="text-lg font-black text-teal">
          {ar ? 'تذكيرات الحصص بالبريد الإلكتروني' : 'Lesson reminders by email'}
        </legend>
        <p className="text-sm leading-6 text-muted">
          {ar
            ? 'نرسل تذكيراً قبل الحصص المجدولة فقط. لا نرسل تذكيراً لحصة أُلغيت أو تغيّر موعدها.'
            : 'We only remind you about lessons that are still scheduled. Cancelled or moved lessons are never reminded for their old time.'}
        </p>
        {LESSON_REMINDER_PREFERENCES.map(option => (
          <label
            key={option}
            className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm font-semibold text-teal has-[:checked]:border-teal has-[:checked]:bg-cream"
          >
            <input
              type="radio"
              name="lesson_reminders"
              value={option}
              defaultChecked={option === initial}
              className="size-4"
            />
            {lessonReminderOptionLabel(option, locale)}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-xl bg-teal px-5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'حفظ' : 'Save'}
        </button>
        {state?.error && (
          <span role="alert" className="text-sm text-danger">
            {state.error}
          </span>
        )}
        {state?.success && (
          <span role="status" className="text-sm text-muted">
            {state.success}
          </span>
        )}
      </div>
    </form>
  );
}
