'use server';

import { revalidatePath } from 'next/cache';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { idSchema } from '@/features/student/domain';
import { parseLessonReminderPreference } from './reminder-preference';

export type NotificationActionState = { error?: string; success?: string } | null;

function updateError(locale: string, refresh = false) {
  return locale === 'ar'
    ? refresh
      ? 'تعذر تحديث الإشعار. حدّث الصفحة وحاول مرة أخرى.'
      : 'تعذر تحديث الإشعار. حاول مرة أخرى.'
    : refresh
      ? 'Could not update this notification. Refresh and try again.'
      : 'Could not update this notification. Try again.';
}

function canManageOwnNotifications(viewer: Awaited<ReturnType<typeof getRequestViewer>>) {
  return (
    !!viewer.user &&
    viewer.profile?.status === 'active' &&
    (viewer.profile.role === 'student' || viewer.profile.role === 'teacher')
  );
}

export async function markNotificationRead(
  locale: string,
  id: string,
  _previous: NotificationActionState,
  _formData: FormData,
): Promise<NotificationActionState> {
  if (!['en', 'ar'].includes(locale) || !idSchema.safeParse(id).success)
    return { error: updateError(locale) };
  const viewer = await getRequestViewer();
  if (!canManageOwnNotifications(viewer)) return { error: updateError(locale) };
  const { error } = await viewer.db.rpc('mark_notification_read', { p_id: id });
  if (error) return { error: updateError(locale, true) };
  revalidatePath(`/${locale}/notifications`);
  revalidatePath(`/${locale}/student`);
  revalidatePath(`/${locale}/teacher`);
  return { success: locale === 'ar' ? 'تم تحديث الإشعار.' : 'Notification updated.' };
}

export async function markAllNotificationsRead(
  locale: string,
  _previous: NotificationActionState,
  _formData: FormData,
): Promise<NotificationActionState> {
  if (!['en', 'ar'].includes(locale)) return { error: 'Could not update notifications.' };
  const viewer = await getRequestViewer();
  if (!canManageOwnNotifications(viewer))
    return {
      error:
        locale === 'ar'
          ? 'تعذر تحديث الإشعارات. حدّث الصفحة وحاول مرة أخرى.'
          : 'Could not update notifications. Refresh and try again.',
    };
  const { error } = await viewer.db.rpc('mark_all_notifications_read');
  if (error)
    return {
      error:
        locale === 'ar'
          ? 'تعذر تحديث الإشعارات. حدّث الصفحة وحاول مرة أخرى.'
          : 'Could not update notifications. Refresh and try again.',
    };
  revalidatePath(`/${locale}/notifications`);
  revalidatePath(`/${locale}/student`);
  revalidatePath(`/${locale}/teacher`);
  return {
    success: locale === 'ar' ? 'تم تحديد الإشعارات كمقروءة.' : 'Notifications marked as read.',
  };
}

export async function setLessonReminderPreference(
  locale: string,
  _previous: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const ar = locale === 'ar';
  const failure = {
    error: ar
      ? 'تعذر حفظ تفضيل التذكيرات. حاول مرة أخرى.'
      : 'Could not save your reminder preference. Try again.',
  };
  if (!['en', 'ar'].includes(locale)) return failure;
  const value = parseLessonReminderPreference(formData.get('lesson_reminders'));
  if (!value) return failure;
  const viewer = await getRequestViewer();
  if (!canManageOwnNotifications(viewer)) return failure;
  const { error } = await viewer.db.rpc('set_lesson_reminder_preference', { p_value: value });
  if (error) return failure;
  revalidatePath(`/${locale}/account/notifications`);
  return { success: ar ? 'تم حفظ تفضيل التذكيرات.' : 'Reminder preference saved.' };
}
