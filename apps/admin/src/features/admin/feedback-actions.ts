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
    return {
      error: ar
        ? 'يلزم حساب مسؤول نشط مع التحقق بخطوتين. سجّل الدخول مرة أخرى.'
        : 'An active administrator account with two-step verification is required. Sign in again.',
    };
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
      student_reason: z.string().max(500),
    })
    .safeParse({
      id,
      version: form.get('version'),
      decision: form.get('decision'),
      admin_note: form.get('admin_note'),
      student_reason: form.get('student_reason') ?? '',
    });
  if (!parsed.success)
    return {
      error: ar
        ? 'تحقق من القرار والملاحظة وسبب الإخفاء ثم حاول مجددًا.'
        : 'Check the decision, note, and hide reason, then try again.',
    };
  const studentReason = parsed.data.student_reason.trim();
  if (parsed.data.decision === 'hide' && (studentReason.length < 1 || studentReason.length > 500))
    return {
      error: ar
        ? 'أدخل سببًا من ١ إلى ٥٠٠ حرف يظهر للطالب عند الإخفاء.'
        : 'Enter a 1 to 500 character reason shown to the student when hidden.',
    };
  const { data, error } = await actor.db.rpc('moderate_group_feedback_with_reason', {
    p_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_note: parsed.data.admin_note,
    p_expected_version: parsed.data.version,
    p_student_reason: parsed.data.decision === 'hide' ? studentReason : '',
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
