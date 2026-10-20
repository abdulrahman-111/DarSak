'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { idSchema } from '@/features/student/domain';

export type NotificationActionState = { error?: string; success?: string } | null;
export async function markNotificationRead(
  locale: string,
  id: string,
  _previous: NotificationActionState,
  _formData: FormData,
): Promise<NotificationActionState> {
  if (!['en', 'ar'].includes(locale) || !idSchema.safeParse(id).success)
    return {
      error:
        locale === 'ar'
          ? 'تعذر تحديث الإشعار. حاول مرة أخرى.'
          : 'Could not update this notification. Try again.',
    };
  const db = await createClient();
  const { error } = await db.rpc('mark_notification_read', { p_id: id });
  if (error)
    return {
      error:
        locale === 'ar'
          ? 'تعذر تحديث الإشعار. حدّث الصفحة وحاول مرة أخرى.'
          : 'Could not update this notification. Refresh and try again.',
    };
  revalidatePath(`/${locale}/notifications`);
  revalidatePath(`/${locale}/student`);
  revalidatePath(`/${locale}/teacher`);
  revalidatePath(`/${locale}/admin`);
  return { success: locale === 'ar' ? 'تم تحديث الإشعار.' : 'Notification updated.' };
}

export async function markAllNotificationsRead(
  locale: string,
  _previous: NotificationActionState,
  _formData: FormData,
): Promise<NotificationActionState> {
  if (!['en', 'ar'].includes(locale)) return { error: 'Could not update notifications.' };
  const db = await createClient();
  const { error } = await db.rpc('mark_all_notifications_read');
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
  revalidatePath(`/${locale}/admin`);
  return {
    success: locale === 'ar' ? 'تم تحديد الإشعارات كمقروءة.' : 'Notifications marked as read.',
  };
}
