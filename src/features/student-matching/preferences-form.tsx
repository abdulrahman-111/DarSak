'use client';

import { useActionState, useState } from 'react';
import type { Locale } from '@/features/student/domain';
import { weekdayName } from './domain';
import { saveStudentMatchingPreferences } from './actions';

export function MatchingPreferencesForm({
  locale,
  preferredWeekdays,
  updatedAt,
}: {
  locale: Locale;
  preferredWeekdays: number[];
  updatedAt: string;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    saveStudentMatchingPreferences.bind(null, locale),
    null,
  );
  const [selected, setSelected] = useState(preferredWeekdays);
  const currentUpdatedAt = state?.updatedAt ?? updatedAt;
  const toggle = (day: number, checked: boolean) => {
    setSelected(current =>
      checked ? [...current, day].sort((a, b) => a - b) : current.filter(item => item !== day),
    );
  };

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="expected_updated_at" value={currentUpdatedAt} />
      <fieldset>
        <legend className="text-sm font-bold text-ink">
          {ar ? 'الأيام المفضلة (اختياري)' : 'Preferred days (optional)'}
        </legend>
        <p className="mt-1 text-xs text-muted">
          {ar
            ? 'اختر الأيام التي تفضّلها. لن يمنع ذلك عرض مجموعات في أيام أخرى.'
            : 'Choose days that work well for you. Groups on other days may still appear.'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 7 }, (_, day) => (
            <label
              key={day}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold"
            >
              <input
                type="checkbox"
                name="preferred_weekdays"
                value={day}
                checked={selected.includes(day)}
                onChange={event => toggle(day, event.currentTarget.checked)}
                className="size-4 accent-teal"
              />
              {weekdayName(day, locale)}
            </label>
          ))}
        </div>
      </fieldset>
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
      <div>
        <button
          disabled={pending}
          className="min-h-11 rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {pending
            ? ar
              ? 'جارٍ الحفظ…'
              : 'Saving…'
            : ar
              ? 'حفظ أيام التفضيل'
              : 'Save preferred days'}
        </button>
      </div>
    </form>
  );
}
