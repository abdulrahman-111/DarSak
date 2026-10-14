'use server';
import { revalidatePath } from 'next/cache';
import { idSchema, type Locale } from './domain';
import { viewer } from './data';

export type SavedActionState = { error?: string; success?: string } | null;

export async function savedGroupAction(locale: Locale, groupId: string, save: boolean, _previous: SavedActionState): Promise<SavedActionState> {
  const ar = locale === 'ar';
  const failed = ar ? 'تعذّر تحديث القائمة. حاول مرة أخرى.' : 'Could not update your list. Please try again.';
  if (!['ar', 'en'].includes(locale) || !idSchema.safeParse(groupId).success) return { error: failed };
  const me = await viewer();
  if (!me || me.role !== 'student' || me.status !== 'active') return { error: ar ? 'يلزم حساب طالب نشط.' : 'An active student account is required.' };
  const { error } = await me.db.rpc(save ? 'save_student_group' : 'unsave_student_group', { p_group_id: groupId });
  if (error) return { error: failed };
  revalidatePath(`/${locale}/student/saved`);
  revalidatePath(`/${locale}/groups/${groupId}`);
  return { success: save ? (ar ? 'أُضيفت المجموعة إلى قائمتك.' : 'Group saved to your list.') : (ar ? 'أُزيلت المجموعة من قائمتك.' : 'Group removed from your list.') };
}
