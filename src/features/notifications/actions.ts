'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { idSchema } from '@/features/student/domain';
import { notificationHref } from './domain';

export type NotificationActionState = { error?: string; success?: string } | null;

function revalidateNotifications(locale: string) {
  revalidatePath(`/${locale}/notifications`);
  revalidatePath(`/${locale}/student`);
  revalidatePath(`/${locale}/teacher`);
  revalidatePath(`/${locale}/admin`);
  // The site header reads the same unread count as the workspace navigation.
  revalidatePath(`/${locale}`, 'layout');
}

function retryMessage(locale: string) {
  return locale === 'ar'
    ? 'تعذر فتح الإشعار. حدّث الصفحة وحاول مرة أخرى.'
    : 'Could not open this notification. Refresh and try again.';
}

/** Opens an unread notification through a POST, marking it read before navigating. */
export async function openNotification(
  locale: string,
  id: string,
  _previous: NotificationActionState,
  _formData: FormData,
): Promise<NotificationActionState> {
  if (!['en', 'ar'].includes(locale) || !idSchema.safeParse(id).success)
    return { error: retryMessage(locale) };

  let href: string;
  try {
    const viewer = await getRequestViewer();
    if (
      !viewer.user ||
      viewer.profile?.status !== 'active' ||
      !['student', 'teacher', 'admin'].includes(viewer.profile.role)
    )
      return { error: retryMessage(locale) };

    const { data: row, error: rowError } = await viewer.db
      .from('user_notifications')
      .select('recipient_id,kind,payload')
      .eq('id', id)
      .eq('recipient_id', viewer.user.id)
      .maybeSingle();
    if (
      rowError ||
      !row ||
      row.recipient_id !== viewer.user.id ||
      !row.payload ||
      typeof row.payload !== 'object' ||
      Array.isArray(row.payload)
    )
      return { error: retryMessage(locale) };

    // The destination is derived from the owned database row and verified role;
    // no browser-supplied URL participates in the redirect.
    const destination = notificationHref(
      viewer.profile.role,
      row.kind,
      row.payload as Record<string, unknown>,
      locale,
    );
    if (!destination || !destination.startsWith(`/${locale}/`))
      return { error: retryMessage(locale) };
    href = destination;

    const { error } = await viewer.db.rpc('mark_notification_read', { p_id: id });
    if (error) return { error: retryMessage(locale) };
  } catch {
    return { error: retryMessage(locale) };
  }

  revalidateNotifications(locale);
  redirect(href);
}

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
  revalidateNotifications(locale);
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
  revalidateNotifications(locale);
  return {
    success: locale === 'ar' ? 'تم تحديد الإشعارات كمقروءة.' : 'Notifications marked as read.',
  };
}
