'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { idSchema } from '@/features/student/domain';
import { groupLearningDetailsSchema } from './group-learning-domain';
export type LearningState = {
  error?: string;
  success?: string;
  version?: string;
  savedRevision?: number;
} | null;
export async function saveGroupLearning(
  locale: string,
  id: string,
  _state: LearningState,
  form: FormData,
): Promise<LearningState> {
  const ar = locale === 'ar';
  const v = groupLearningDetailsSchema.safeParse(Object.fromEntries(form));
  if (!idSchema.safeParse(id).success || !v.success)
    return {
      error: ar
        ? 'راجع الحدود الموضحة وأدخل الرسوم ووحدتها معًا أو اتركهما فارغين.'
        : 'Check the displayed limits. Enter both a fee and its unit, or leave both blank.',
    };
  const db = await createClient();
  const r = await db.rpc('save_group_learning_details', {
    p_group_id: id,
    p_values: v.data,
    p_expected_updated_at: form.get('expected_updated_at') || null,
  });
  if (r.error)
    return {
      error:
        r.error.code === '40001'
          ? ar
            ? 'تغيرت التفاصيل. حدّث الصفحة قبل المحاولة مجددًا.'
            : 'These details changed. Refresh before trying again.'
          : ar
            ? 'تعذر حفظ التفاصيل. تأكد من صلاحيتك لتعديل المجموعة.'
            : 'Could not save these details. Check that you can edit this group.',
    };
  for (const l of ['en', 'ar']) {
    for (const path of [
      `teacher/groups/${id}`,
      `teacher/groups/${id}/setup`,
      `teacher/groups/${id}/edit`,
      `groups/${id}`,
    ])
      revalidatePath(`/${l}/${path}`);
  }
  return {
    success: ar ? 'تم حفظ تفاصيل التعلم.' : 'Learning details saved.',
    version: String(r.data),
    savedRevision: Number(form.get('draft_revision')) || 0,
  };
}
