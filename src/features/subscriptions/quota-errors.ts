import type { Locale } from '@/features/student/domain';

/** Convert known quota guard failures into actionable, localized messages. */
export function quotaErrorMessage(
  locale: Locale,
  rawError: string | null | undefined,
): string | null {
  const error = (rawError ?? '').toLowerCase();
  const ar = locale === 'ar';
  if (error.includes('teacher group quota reached')) {
    return ar
      ? 'وصلت إلى حد المجموعات في خطتك. أدر خطتك أو أرشف مجموعة لم تعد تستخدمها ثم حاول مرة أخرى.'
      : 'You have reached your plan’s group limit. Manage your plan or archive a group you no longer use, then try again.';
  }
  if (error.includes('teacher storage quota reached')) {
    return ar
      ? 'وصلت إلى حد مساحة الملفات في خطتك. أدر خطتك أو احذف ملفات دروس لم تعد تحتاجها ثم حاول مرة أخرى.'
      : 'You have reached your plan’s file storage limit. Manage your plan or delete lesson files you no longer need, then try again.';
  }
  if (error.includes('teacher subscription required')) {
    return ar
      ? 'تحتاج إلى خطة مدرس نشطة لإكمال هذا الإجراء. راجع خطتك ثم حاول مرة أخرى.'
      : 'An active teacher plan is required for this action. Review your plan, then try again.';
  }
  return null;
}
