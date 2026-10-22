'use server';
import { revalidatePath } from 'next/cache';
import { getRequestViewer } from '@/features/platform/request-viewer';
import type { Locale } from './domain';
import { idSchema } from './domain';

export type WaitlistActionState = { error?: string; success?: string } | null;

function text(locale: Locale, en: string, ar: string) {
  return locale === 'ar' ? ar : en;
}

async function studentViewer(locale: Locale) {
  const viewer = await getRequestViewer();
  if (!viewer.user || viewer.profile?.role !== 'student' || viewer.profile.status !== 'active')
    return null;
  return viewer;
}

export async function joinWaitlistAction(
  locale: Locale,
  groupId: string,
  _previous: WaitlistActionState,
): Promise<WaitlistActionState> {
  if (!['en', 'ar'].includes(locale) || !idSchema.safeParse(groupId).success)
    return {
      error: text(
        locale,
        'Could not join the waitlist. Refresh and try again.',
        'تعذّر الانضمام إلى قائمة الانتظار. حدّث الصفحة وحاول مجددًا.',
      ),
    };
  const viewer = await studentViewer(locale);
  if (!viewer)
    return { error: text(locale, 'An active student account is required.', 'يلزم حساب طالب نشط.') };
  const { error } = await viewer.db.rpc('join_group_waitlist', { p_group_id: groupId });
  if (error)
    return {
      error: text(
        locale,
        'Could not join the waitlist. Refresh to check the group, then try again.',
        'تعذّر الانضمام إلى قائمة الانتظار. حدّث الصفحة للتحقق من المجموعة ثم حاول مجددًا.',
      ),
    };
  revalidatePath(`/${locale}/groups/${groupId}`);
  revalidatePath(`/${locale}/student/classes`);
  return { success: text(locale, 'You are on the waitlist.', 'أنت الآن في قائمة الانتظار.') };
}

export async function withdrawWaitlistAction(
  locale: Locale,
  entryId: string,
  _previous: WaitlistActionState,
): Promise<WaitlistActionState> {
  if (!['en', 'ar'].includes(locale) || !idSchema.safeParse(entryId).success)
    return {
      error: text(
        locale,
        'Could not leave the waitlist. Refresh and try again.',
        'تعذّر مغادرة قائمة الانتظار. حدّث الصفحة وحاول مجددًا.',
      ),
    };
  const viewer = await studentViewer(locale);
  if (!viewer)
    return { error: text(locale, 'An active student account is required.', 'يلزم حساب طالب نشط.') };
  const entry = await viewer.db
    .from('waitlist_entries')
    .select('group_id')
    .eq('id', entryId)
    .eq('student_id', viewer.user!.id)
    .maybeSingle();
  if (entry.error || !entry.data)
    return {
      error: text(
        locale,
        'Could not leave the waitlist. Refresh to check your current status, then try again.',
        'تعذّرت مغادرة قائمة الانتظار. حدّث الصفحة للتحقق من حالتك ثم حاول مجددًا.',
      ),
    };
  const { error } = await viewer.db.rpc('withdraw_group_waitlist', { p_entry_id: entryId });
  if (error)
    return {
      error: text(
        locale,
        'Could not leave the waitlist. Refresh to check your current status, then try again.',
        'تعذّرت مغادرة قائمة الانتظار. حدّث الصفحة للتحقق من حالتك ثم حاول مجددًا.',
      ),
    };
  for (const currentLocale of ['en', 'ar']) {
    revalidatePath(`/${currentLocale}/groups/${entry.data.group_id}`, 'page');
    revalidatePath(`/${currentLocale}/student/classes`);
  }
  return { success: text(locale, 'You left the waitlist.', 'غادرت قائمة الانتظار.') };
}

export async function promoteWaitlistAction(
  locale: Locale,
  entryId: string,
  _previous: WaitlistActionState,
): Promise<WaitlistActionState> {
  if (!['en', 'ar'].includes(locale) || !idSchema.safeParse(entryId).success)
    return {
      error: text(
        locale,
        'Could not move this student to review. Refresh and try again.',
        'تعذّر نقل الطالب إلى المراجعة. حدّث الصفحة وحاول مجددًا.',
      ),
    };
  const viewer = await getRequestViewer();
  if (!viewer.user || viewer.profile?.role !== 'teacher' || viewer.profile.status !== 'active')
    return { error: text(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  const { error } = await viewer.db.rpc('promote_group_waitlist', { p_entry_id: entryId });
  if (error)
    return {
      error: text(
        locale,
        'Could not move this student to review. Refresh to check the group and try again.',
        'تعذّر نقل الطالب إلى المراجعة. حدّث الصفحة للتحقق من المجموعة ثم حاول مجددًا.',
      ),
    };
  revalidatePath(`/${locale}/teacher/requests`);
  revalidatePath(`/${locale}/student/classes`);
  return {
    success: text(locale, 'Moved to enrollment review.', 'تم النقل إلى مراجعة طلبات الانضمام.'),
  };
}
