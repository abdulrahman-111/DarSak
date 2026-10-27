'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { idSchema } from '@/features/student/domain';
import { feedbackInput } from './domain';
import {
  revalidateStudentWorkspace,
  revalidateTeacherWorkspace,
} from '@/features/student/workspace-revalidation';
export type FeedbackState = { error?: string; success?: string; version?: number } | null;
export async function feedbackAction(
  locale: string,
  kind: 'save' | 'withdraw' | 'reply',
  id: string,
  _state: FeedbackState,
  form: FormData,
): Promise<FeedbackState> {
  const ar = locale === 'ar';
  if (kind !== 'save' && kind !== 'withdraw' && kind !== 'reply')
    return { error: ar ? 'الإجراء غير صالح.' : 'Invalid feedback action.' };
  const version = Number(form.get('version'));
  if (!idSchema.safeParse(id).success || !Number.isSafeInteger(version) || version < 0)
    return { error: ar ? 'حدّث الصفحة وحاول مجددًا.' : 'Refresh the page and try again.' };
  const db = await createClient();
  const { data: identity } = await db.auth.getUser();
  if (!identity.user) return { error: ar ? 'سجّل الدخول مجددًا.' : 'Sign in again.' };
  const { data: actor, error: actorError } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', identity.user.id)
    .maybeSingle();
  const allowedRole = kind === 'reply' ? 'teacher' : 'student';
  if (actorError || actor?.status !== 'active' || actor.role !== allowedRole)
    return { error: ar ? 'لا تملك صلاحية هذا الإجراء.' : 'You are not allowed to do this.' };
  let r: { data: unknown; error: { code?: string } | null } | null = null;
  if (kind === 'save') {
    const parsed = feedbackInput.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return {
        error: ar
          ? 'اختر تقييمًا من ١ إلى ٥ واكتب بين ٢٠ و١٥٠٠ حرف.'
          : 'Choose a rating from 1 to 5 and write 20–1,500 characters.',
      };
    r = await db.rpc('save_group_feedback', {
      p_group_id: id,
      p_rating: parsed.data.rating,
      p_comment: parsed.data.comment,
      p_expected_version: version,
    });
  } else if (kind === 'withdraw')
    r = await db.rpc('withdraw_group_feedback', { p_id: id, p_expected_version: version });
  else if (kind === 'reply')
    r = await db.rpc('teacher_reply_feedback', {
      p_id: id,
      p_reply: String(form.get('reply') ?? ''),
      p_expected_version: version,
    });
  if (!r) return { error: ar ? 'الإجراء غير صالح.' : 'Invalid feedback action.' };
  if (r.error)
    return {
      error:
        r.error.code === '40001'
          ? ar
            ? 'تغير التقييم. حدّث الصفحة للمراجعة قبل الحفظ.'
            : 'This feedback changed. Refresh and review before saving.'
          : ar
            ? 'تعذر حفظ التقييم. تحقق من الصلاحية والحدود الموضحة.'
            : 'Could not save. Check your eligibility and the displayed limits.',
    };
  revalidateStudentWorkspace();
  revalidateTeacherWorkspace();
  for (const l of ['en', 'ar']) {
    revalidatePath(`/${l}/groups`, 'layout');
    revalidatePath(`/${l}/teacher/feedback`);
  }
  return {
    success: ar
      ? 'تم الحفظ. تخضع التقييمات والردود للمراجعة قبل النشر.'
      : 'Saved. Feedback and replies are reviewed before publication.',
    version: Number(r.data),
  };
}
