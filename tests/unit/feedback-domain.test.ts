import { expect, it } from 'vitest';
import {
  feedbackEligibilityMessage,
  feedbackInput,
  feedbackPageHref,
} from '@/features/feedback/domain';
it('accepts useful bounded feedback and rejects invalid ratings or lengths', () => {
  expect(
    feedbackInput.safeParse({ rating: 5, comment: 'This lesson helped me understand loops.' })
      .success,
  ).toBe(true);
  for (const rating of [0, 6, 1.5])
    expect(
      feedbackInput.safeParse({ rating, comment: 'This lesson helped me understand loops.' })
        .success,
    ).toBe(false);
  expect(feedbackInput.safeParse({ rating: 3, comment: 'short' }).success).toBe(false);
  expect(feedbackInput.safeParse({ rating: 3, comment: 'x'.repeat(1501) }).success).toBe(false);
});
it('explains each bounded feedback eligibility reason in English and Arabic', () => {
  const cases = [
    [
      'accepted_enrollment_required',
      'Your enrollment must be accepted before you can leave feedback.',
      'يجب قبول انضمامك قبل إضافة تقييم.',
    ],
    [
      'published_group_required',
      'Feedback is available for published groups only.',
      'تتاح التقييمات للمجموعات المنشورة فقط.',
    ],
    [
      'active_approved_teacher_required',
      'Feedback is unavailable while the teacher account is inactive or unapproved.',
      'التقييمات غير متاحة ما دام حساب المعلم غير نشط أو غير معتمد.',
    ],
    [
      'completed_lesson_required',
      'Wait until a non-cancelled lesson has ended before leaving feedback.',
      'انتظر انتهاء حصة غير ملغاة قبل إضافة تقييم.',
    ],
    [
      'present_or_late_attendance_required',
      'Your teacher must record you as present or late for a completed lesson before you can leave feedback.',
      'يجب أن يسجّل معلمك حضورك أو تأخرك في حصة انتهت قبل إضافة تقييم.',
    ],
  ];
  for (const [reason, en, ar] of cases) {
    expect(
      feedbackEligibilityMessage(reason as Parameters<typeof feedbackEligibilityMessage>[0], false),
    ).toBe(en);
    expect(
      feedbackEligibilityMessage(reason as Parameters<typeof feedbackEligibilityMessage>[0], true),
    ).toBe(ar);
  }
  expect(feedbackEligibilityMessage('eligible', false)).toBe(
    'You can leave feedback for this group.',
  );
});
it('adds feedback pagination to public and tabbed student class URLs', () => {
  expect(feedbackPageHref('/en/groups/group-id', 10)).toBe(
    '/en/groups/group-id?feedback=10#feedback',
  );
  expect(feedbackPageHref('/ar/student/classes/group-id?view=progress', 20)).toBe(
    '/ar/student/classes/group-id?view=progress&feedback=20#feedback',
  );
});
