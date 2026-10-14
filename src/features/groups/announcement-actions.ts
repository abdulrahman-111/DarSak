'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { idSchema } from '@/features/student/domain';
import { validateAnnouncement } from './announcement-domain';

export type AnnouncementActionState = { error?: string; success?: string; editedAt?: string | null; body?: string; revision?: string } | null;

const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

export async function saveGroupAnnouncement(locale: Locale, groupId: string, previous: AnnouncementActionState, form: FormData): Promise<AnnouncementActionState> {
  const fail = message(locale, 'The announcement could not be saved. Refresh the page and try again.', 'تعذر حفظ الإعلان. حدّث الصفحة وحاول مرة أخرى.');
  const failed = (error: string): AnnouncementActionState => ({ error, ...(previous?.revision ? { revision: previous.revision, body: previous.body } : {}) });
  if (!['en', 'ar'].includes(locale) || !idSchema.safeParse(groupId).success) return failed(fail);
  const body = form.get('clear') === 'true' ? '' : form.get('body');
  if (validateAnnouncement(body)) return failed(message(locale, 'Keep the announcement within 2,000 characters.', 'اجعل الإعلان ضمن ٢٠٠٠ حرف.'));
  const bodyText = body as string;

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return failed(message(locale, 'Sign in as the active approved group teacher to edit this announcement.', 'سجّل الدخول بحساب معلم المجموعة النشط والمعتمد لتعديل هذا الإعلان.'));
  const { data, error } = await db.rpc('set_group_pinned_announcement', { p_group_id: groupId, p_body: bodyText });
  if (error) {
    const raw = error.message.toLowerCase();
    if (raw.includes('archiv')) return failed(message(locale, 'Archived groups keep their announcement history and cannot be edited.', 'تحتفظ المجموعات المؤرشفة بسجل الإعلان ولا يمكن تعديلها.'));
    if (raw.includes('owner') || raw.includes('teacher') || raw.includes('approved') || raw.includes('active')) return failed(message(locale, 'Only the active approved owner of this group can edit its announcement.', 'يمكن لمالك المجموعة النشط والمعتمد فقط تعديل إعلانها.'));
    return failed(fail);
  }
  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}`);
    revalidatePath(`/${currentLocale}/groups/${groupId}`);
  }
  return { success: message(locale, data ? 'Announcement saved.' : 'Announcement cleared.', data ? 'تم حفظ الإعلان.' : 'تم مسح الإعلان.'), editedAt: data as string | null, body: data ? bodyText : '', revision: crypto.randomUUID() };
}
