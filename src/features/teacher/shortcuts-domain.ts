import { z } from 'zod';
import type { Locale } from '@/features/student/domain';
import { quotaErrorMessage } from '@/features/subscriptions/quota-errors';

export const duplicateGroupSchema = z.object({ source_group_id: z.string().uuid() });

export const copyLessonSchema = z.object({
  source_lesson_id: z.string().uuid(),
  target_group_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
}).refine(value => Date.parse(value.starts_at) < Date.parse(value.ends_at), { path: ['ends_at'] });

export function scheduleProposalSlots(slots: Array<{ weekday: number; start_time: string; end_time: string }>) {
  return slots.map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time }));
}

export function duplicateSetupPath(locale: Locale, sourceGroupId: string, draftGroupId: string) {
  return `/${locale}/teacher/groups/${draftGroupId}/setup?copyScheduleFrom=${encodeURIComponent(sourceGroupId)}`;
}

export function shortcutMutationMessage(locale: Locale, rawError: string): string {
  const error = rawError.toLowerCase();
  const ar = locale === 'ar';
  const quotaMessage = quotaErrorMessage(locale, rawError);
  if (quotaMessage) return quotaMessage;
  if(error==='teacher teaching access expired')return ar?'انتهت صلاحية التدريس. جدّد الوصول من صفحة صلاحية التدريس.':'Teaching access has expired. Renew access from the teaching access page.';
  if (error.includes('conflict') || error.includes('overlap') || error.includes('schedule')) {
    return ar
      ? 'يتعارض هذا الموعد مع الجدول أو حصة موجودة. اختر وقتاً آخر.'
      : 'This time conflicts with the schedule or an existing lesson. Choose another time.';
  }
  if (error.includes('update the original catalogue selection before duplicating this group')) {
    return ar
      ? 'حدّث اختيار المادة والفئة الأصلي قبل نسخ هذه المجموعة.'
      : 'Update the original subject and category selection before duplicating this group.';
  }
  if (error.includes('not authorized') || error.includes('not found') || error.includes('owner')) {
    return ar
      ? 'تعذر العثور على هذا العنصر أو ليس لديك صلاحية الوصول إليه.'
      : 'This item could not be found or you do not have access to it.';
  }
  return ar
    ? 'تعذر إكمال هذا الإجراء. حدّث الصفحة وحاول مرة أخرى.'
    : 'This action could not be completed. Refresh the page and try again.';
}
