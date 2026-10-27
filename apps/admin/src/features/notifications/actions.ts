'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdminActor } from '@admin/lib/access';
import { adminNotificationHref } from './domain';

export type AdminNotificationActionState = { error?: string; success?: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validLocale(locale: string): locale is 'ar' | 'en' {
  return locale === 'ar' || locale === 'en';
}

function message(locale: string) {
  return locale === 'ar'
    ? 'تعذر تحديث الإشعار. حدّث الصفحة وحاول مرة أخرى.'
    : 'Could not update this notification. Refresh and try again.';
}

function revalidate(locale: string) {
  revalidatePath(`/${locale}/notifications`);
  revalidatePath(`/${locale}/admin`, 'layout');
}

export async function openAdminNotification(
  locale: string,
  id: string,
  _previous: AdminNotificationActionState,
  _formData: FormData,
): Promise<AdminNotificationActionState> {
  if (!validLocale(locale) || !UUID.test(id)) return { error: message(locale) };
  let href: string;
  try {
    const actor = await getAdminActor();
    if (!actor) return { error: message(locale) };
    const { data: row, error } = await actor.db
      .from('user_notifications')
      .select('recipient_id,kind,payload')
      .eq('id', id)
      .eq('recipient_id', actor.id)
      .maybeSingle();
    if (
      error ||
      !row ||
      row.recipient_id !== actor.id ||
      !row.payload ||
      typeof row.payload !== 'object' ||
      Array.isArray(row.payload)
    ) {
      return { error: message(locale) };
    }
    const destination = adminNotificationHref(
      row.kind,
      row.payload as Record<string, unknown>,
      locale,
    );
    if (!destination || !destination.startsWith(`/${locale}/admin`))
      return { error: message(locale) };
    const { error: markError } = await actor.db.rpc('mark_notification_read', { p_id: id });
    if (markError) return { error: message(locale) };
    href = destination;
  } catch {
    return { error: message(locale) };
  }
  revalidate(locale);
  redirect(href);
}

export async function markAdminNotificationRead(
  locale: string,
  id: string,
  _previous: AdminNotificationActionState,
  _formData: FormData,
): Promise<AdminNotificationActionState> {
  if (!validLocale(locale) || !UUID.test(id)) return { error: message(locale) };
  const actor = await getAdminActor();
  if (!actor) return { error: message(locale) };
  const { error } = await actor.db.rpc('mark_notification_read', { p_id: id });
  if (error) return { error: message(locale) };
  revalidate(locale);
  return { success: locale === 'ar' ? 'تم تحديث الإشعار.' : 'Notification updated.' };
}

export async function markAllAdminNotificationsRead(
  locale: string,
  _previous: AdminNotificationActionState,
  _formData: FormData,
): Promise<AdminNotificationActionState> {
  if (!validLocale(locale)) return { error: message(locale) };
  const actor = await getAdminActor();
  if (!actor) return { error: message(locale) };
  const { error } = await actor.db.rpc('mark_all_notifications_read');
  if (error) return { error: message(locale) };
  revalidate(locale);
  return {
    success: locale === 'ar' ? 'تم تحديد الإشعارات كمقروءة.' : 'Notifications marked as read.',
  };
}
