import { type Locale } from '@/features/student/domain';

export type TeacherReviewEvent = {
  id: string;
  kind: string;
  reason: string | null;
  created_at: string;
};
export type TeacherReviewStatus = {
  teacher_id: string;
  status: 'pending' | 'approved' | 'declined';
  request_id: string | null;
  requested_at: string;
  reviewed_at: string | null;
  decline_reason: string | null;
  events: TeacherReviewEvent[];
};
export type TeacherReviewResult = { status: TeacherReviewStatus | null; error: string | null };

export function parseTeacherReviewStatus(value: unknown): TeacherReviewStatus | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.teacher_id !== 'string' ||
    !['pending', 'approved', 'declined'].includes(String(row.status)) ||
    typeof row.requested_at !== 'string' ||
    !Array.isArray(row.events)
  )
    return null;
  return row as TeacherReviewStatus;
}
export async function teacherReviewStatus(
  db: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  teacherId: string,
): Promise<TeacherReviewResult> {
  const { data, error } = await db.rpc('teacher_review_status', { p_teacher_id: teacherId });
  if (error) return { status: null, error: error.message };
  const status = parseTeacherReviewStatus(data);
  return status ? { status, error: null } : { status: null, error: 'invalid review status' };
}

export function reviewStatusCopy(locale: Locale, status: TeacherReviewStatus) {
  const ar = locale === 'ar';
  const copy = ar
    ? {
        pendingTitle: 'طلبك بانتظار المراجعة',
        pendingBody: 'يمكنك متابعة تجهيز ملفك ومسودات مجموعاتك. ستظهر حالة النشر بعد اعتماد الطلب.',
        approvedTitle: 'تم اعتماد حسابك للتدريس',
        approvedBody: 'يمكنك نشر المجموعات وفق متطلبات الحساب الحالية.',
        declinedTitle: 'لم تتم الموافقة على الطلب',
        declinedBody: 'راجع السبب أدناه، حدّث ما يلزم، ثم أرسل طلب مراجعة جديدًا.',
        reason: 'سبب الرفض',
        requested: 'تاريخ الطلب',
        reviewed: 'تاريخ القرار',
        resubmit: 'طلب مراجعة جديد',
        working: 'جارٍ إرسال الطلب…',
      }
    : {
        pendingTitle: 'Your request is awaiting review',
        pendingBody:
          'You can keep preparing your profile and group drafts. Publishing becomes available after approval.',
        approvedTitle: 'Your teacher account is approved',
        approvedBody: 'You can publish groups under the current account requirements.',
        declinedTitle: 'Your request was declined',
        declinedBody:
          'Review the reason below, make any needed updates, then request another review.',
        reason: 'Decline reason',
        requested: 'Requested',
        reviewed: 'Decision date',
        resubmit: 'Request another review',
        working: 'Sending request…',
      };
  return { copy };
}
