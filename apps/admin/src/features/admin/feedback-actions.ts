'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminActor } from '@admin/lib/access';
import { idSchema } from '@/features/student/domain';
type FeedbackState = { error?: string; success?: string; version?: number } | null;

const decisions = z.enum(['approve', 'hide', 'approve_reply', 'hide_reply']);

export async function moderateFeedback(
  locale: string,
  id: string,
  _state: FeedbackState,
  form: FormData,
): Promise<FeedbackState> {
  const ar = locale === 'ar';
  const actor = await getAdminActor();
  if (!actor)
    return { error: ar ? 'يلزم حساب مسؤول نشط.' : 'An active administrator account is required.' };
  const parsed = z
    .object({
      id: idSchema,
      version: z
        .string()
        .regex(/^(0|[1-9]\d{0,14})$/)
        .transform(Number)
        .refine(Number.isSafeInteger),
      decision: decisions,
      admin_note: z.string().max(1500),
    })
    .safeParse({
      id,
      version: form.get('version'),
      decision: form.get('decision'),
      admin_note: form.get('admin_note'),
    });
  if (!parsed.success)
    return {
      error: ar
        ? 'تحقق من القرار والملاحظة ثم حاول مجددًا.'
        : 'Check the decision and note, then try again.',
    };
  const { data, error } = await actor.db.rpc('moderate_group_feedback', {
    p_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_note: parsed.data.admin_note,
    p_expected_version: parsed.data.version,
  });
  if (error)
    return {
      error:
        error.code === '40001'
          ? ar
            ? 'تغير التقييم. حدّث الصفحة للمراجعة قبل الحفظ.'
            : 'This feedback changed. Refresh and review before saving.'
          : ar
            ? 'تعذر حفظ التقييم. تحقق من الصلاحية والحدود الموضحة.'
            : 'Could not save. Check your authorization and the displayed limits.',
    };
  revalidatePath(`/${locale}/admin/feedback`);
  return {
    success: ar
      ? 'تم الحفظ. تخضع التقييمات والردود للمراجعة قبل النشر.'
      : 'Saved. Feedback and replies are reviewed before publication.',
    version: Number(data),
  };
}
