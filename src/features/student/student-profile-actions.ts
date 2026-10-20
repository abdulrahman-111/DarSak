'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { viewer } from './data';
import {
  parseStudentLearningProfileRow,
  validateStudentLearningProfile,
} from './student-profile-domain';
import type { Locale } from './domain';

export type StudentProfileActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    full_name: string;
    age_range: string;
    education_year: string;
    interests_text: string;
    learning_goal: string;
    school_name: string;
  };
} | null;

const message = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);
const valuesFrom = (form: FormData) => ({
  full_name: String(form.get('full_name') ?? ''),
  age_range: String(form.get('age_range') ?? ''),
  education_year: String(form.get('education_year') ?? ''),
  interests_text: String(form.get('interests') ?? ''),
  learning_goal: String(form.get('learning_goal') ?? ''),
  school_name: String(form.get('school_name') ?? ''),
});

export async function saveStudentLearningProfile(
  locale: Locale,
  _previous: StudentProfileActionState,
  form: FormData,
): Promise<StudentProfileActionState> {
  const values = valuesFrom(form);
  const validation = validateStudentLearningProfile(values);
  if (!validation.success)
    return {
      error: message(locale, 'Please check the highlighted fields.', 'يرجى مراجعة الحقول المحددة.'),
      fieldErrors: validation.errors,
      values,
    };

  const me = await viewer();
  if (!['en', 'ar'].includes(locale) || !me || me.role !== 'student' || me.status !== 'active')
    return {
      error: message(locale, 'An active student account is required.', 'يلزم حساب طالب نشط.'),
      values,
    };
  const current = await me.db
    .from('student_profiles')
    .select('updated_at')
    .eq('id', me.id)
    .maybeSingle();
  if (current.error || !current.data || typeof current.data.updated_at !== 'string')
    return {
      error: message(
        locale,
        'Could not load your profile version. Refresh and try again.',
        'تعذر تحميل نسخة الملف. حدّث الصفحة وحاول مرة أخرى.',
      ),
      values,
    };
  const expected = form.get('expected_updated_at');
  if (typeof expected !== 'string' || expected !== current.data.updated_at) {
    return {
      error: message(
        locale,
        'Your profile changed in another tab. Refresh to review the latest version, then confirm your changes before saving.',
        'تغير ملفك في علامة تبويب أخرى. حدّث الصفحة لمراجعة أحدث نسخة، ثم أكد تعديلاتك قبل الحفظ.',
      ),
      values,
    };
  }

  const result = await me.db.rpc('save_student_learning_profile', {
    p_full_name: validation.data.full_name,
    p_age_range: validation.data.age_range,
    p_education_year: validation.data.education_year,
    p_interests: validation.data.interests,
    p_learning_goal: validation.data.learning_goal,
    p_school_name: validation.data.school_name,
    p_expected_updated_at: current.data.updated_at,
  });
  if (result.error) {
    const stale = result.error.code === 'PT409';
    return {
      error: stale
        ? message(
            locale,
            'Your profile changed while you were saving. Refresh to review the latest version, then confirm your changes before saving.',
            'تغير ملفك أثناء الحفظ. حدّث الصفحة لمراجعة أحدث نسخة، ثم أكد تعديلاتك قبل الحفظ.',
          )
        : message(
            locale,
            'Your profile could not be saved. Your entries remain in the form; please try again.',
            'تعذر حفظ ملفك. ستبقى البيانات في النموذج؛ حاول مرة أخرى.',
          ),
      values,
    };
  }
  const saved = parseStudentLearningProfileRow(result.data);
  if (!saved)
    return {
      error: message(
        locale,
        'The save result could not be confirmed. Refresh and try again.',
        'تعذر التحقق من نتيجة الحفظ. حدّث الصفحة وحاول مرة أخرى.',
      ),
      values,
    };

  for (const language of ['en', 'ar'] as const) {
    revalidatePath(`/${language}/student`);
    revalidatePath(`/${language}/account/learning-profile`);
  }
  redirect(`/${locale}/student`);
}
