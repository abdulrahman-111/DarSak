import { z } from 'zod';
export const feedbackInput = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(20).max(1500),
});
export type FeedbackRow = {
  id: string;
  group_id?: string;
  group_name?: string;
  rating: number;
  comment: string;
  reply_public?: string;
  reply_pending?: string;
  status?: string;
  version: number;
  admin_note?: string | null;
};
export type FeedbackEligibilityReason =
  | 'eligible'
  | 'accepted_enrollment_required'
  | 'published_group_required'
  | 'active_approved_teacher_required'
  | 'completed_lesson_required'
  | 'present_or_late_attendance_required';
export function feedbackPageHref(basePath: string, offset: number) {
  return `${basePath}${basePath.includes('?') ? '&' : '?'}feedback=${offset}#feedback`;
}
export function feedbackEligibilityMessage(
  reason: FeedbackEligibilityReason | undefined,
  ar: boolean,
) {
  const messages: Record<FeedbackEligibilityReason, [string, string]> = {
    eligible: ['You can leave feedback for this group.', 'يمكنك تقييم هذه المجموعة.'],
    accepted_enrollment_required: [
      'Your enrollment must be accepted before you can leave feedback.',
      'يجب قبول انضمامك قبل إضافة تقييم.',
    ],
    published_group_required: [
      'Feedback is available for published groups only.',
      'تتاح التقييمات للمجموعات المنشورة فقط.',
    ],
    active_approved_teacher_required: [
      'Feedback is unavailable while the teacher account is inactive or unapproved.',
      'التقييمات غير متاحة ما دام حساب المعلم غير نشط أو غير معتمد.',
    ],
    completed_lesson_required: [
      'Wait until a non-cancelled lesson has ended before leaving feedback.',
      'انتظر انتهاء حصة غير ملغاة قبل إضافة تقييم.',
    ],
    present_or_late_attendance_required: [
      'Your teacher must record you as present or late for a completed lesson before you can leave feedback.',
      'يجب أن يسجّل معلمك حضورك أو تأخرك في حصة انتهت قبل إضافة تقييم.',
    ],
  };
  return messages[reason ?? 'accepted_enrollment_required'][ar ? 1 : 0];
}
export function feedbackStatus(value: string, ar: boolean) {
  return (
    (ar
      ? { pending: 'بانتظار المراجعة', approved: 'منشور', hidden: 'غير منشور', withdrawn: 'مسحوب' }
      : {
          pending: 'Awaiting review',
          approved: 'Published',
          hidden: 'Not published',
          withdrawn: 'Withdrawn',
        })[value] ?? value
  );
}
