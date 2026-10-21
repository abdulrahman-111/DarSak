'use server';

import { revalidatePath } from 'next/cache';
import { viewer } from '@/features/student/data';
import type { Locale } from '@/features/student/domain';
import { parseMatchingPreferences, parsePreferredWeekdayInput } from './domain';

export type MatchingPreferencesActionState = {
  error?: string;
  success?: string;
  preferredWeekdays?: number[];
  updatedAt?: string;
} | null;

const copy = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);
function failure(locale: Locale, preferredWeekdays: number[], message?: 'invalid' | 'stale') {
  return {
    error:
      message === 'stale'
        ? copy(
            locale,
            'Your profile changed in another tab. Refresh to review the latest version before saving these preferences.',
            'تغير ملفك في علامة تبويب أخرى. حدّث الصفحة لمراجعة أحدث نسخة قبل حفظ هذه التفضيلات.',
          )
        : message === 'invalid'
          ? copy(locale, 'Choose valid days of the week.', 'اختر أيامًا صالحة من أيام الأسبوع.')
          : copy(
              locale,
              'Could not save your preferences. Refresh and try again.',
              'تعذر حفظ تفضيلاتك. حدّث الصفحة وحاول مرة أخرى.',
            ),
    preferredWeekdays,
  };
}

export async function saveStudentMatchingPreferences(
  locale: Locale,
  _previous: MatchingPreferencesActionState,
  form: FormData,
): Promise<MatchingPreferencesActionState> {
  const preferredWeekdays = parsePreferredWeekdayInput(form.getAll('preferred_weekdays'));
  if ((locale !== 'en' && locale !== 'ar') || !preferredWeekdays)
    return failure(locale, preferredWeekdays ?? [], 'invalid');

  const me = await viewer();
  if (!me || me.role !== 'student' || me.status !== 'active')
    return failure(locale, preferredWeekdays);

  const current = await me.db
    .from('student_profiles')
    .select('preferred_weekdays,updated_at')
    .eq('id', me.id)
    .maybeSingle();
  const currentPreferences = current.error ? null : parseMatchingPreferences(current.data);
  if (!currentPreferences) return failure(locale, preferredWeekdays);
  const expected = form.get('expected_updated_at');
  if (typeof expected !== 'string' || expected !== currentPreferences.updatedAt)
    return failure(locale, preferredWeekdays, 'stale');

  const result = await me.db.rpc('save_student_matching_preferences', {
    p_preferred_weekdays: preferredWeekdays,
    p_expected_updated_at: currentPreferences.updatedAt,
  });
  if (result.error) {
    if (result.error.code === 'PT409' || result.error.code === '40001')
      return failure(locale, preferredWeekdays, 'stale');
    return failure(locale, preferredWeekdays);
  }
  const saved = parseMatchingPreferences(result.data);
  if (!saved) return failure(locale, preferredWeekdays);

  for (const language of ['en', 'ar'] as const) {
    revalidatePath(`/${language}/account/learning-profile`);
    revalidatePath(`/${language}/student/recommendations`);
    revalidatePath(`/${language}/student`);
  }
  return {
    success: copy(locale, 'Matching preferences saved.', 'تم حفظ تفضيلات الاقتراحات.'),
    preferredWeekdays: saved.preferredWeekdays,
    updatedAt: saved.updatedAt,
  };
}
