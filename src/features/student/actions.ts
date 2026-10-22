'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { flushEmailOutbox } from '@/features/email/worker';
import { observeOperation } from '@/features/monitoring/server';
import { copy } from './copy';
import { viewer } from './data';
import { idSchema, type Locale } from './domain';
export type ActionState = { error?: string; success?: string; url?: string } | null;
export async function enrollmentAction(
  locale: Locale,
  kind: 'request' | 'cancel',
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const t = copy(locale);
  if (!['ar', 'en'].includes(locale) || !idSchema.safeParse(id).success) return { error: t.failed };
  const me = await viewer();
  if (!me || me.role !== 'student' || me.status !== 'active') return { error: t.studentOnly };
  if (kind !== 'request' && kind !== 'cancel') return { error: t.failed };
  if (kind === 'cancel') {
    const owned = await me.db
      .from('enrollments')
      .select('id')
      .eq('id', id)
      .eq('student_id', me.id)
      .in('status', ['accepted', 'pending'])
      .maybeSingle();
    if (owned.error || !owned.data) return { error: t.failed };
  }
  const { error } =
    kind === 'request'
      ? await observeOperation('enrollment', locale, () =>
          me.db.rpc('request_enrollment', { p_group_id: id }),
        )
      : await me.db.rpc('cancel_enrollment', { p_enrollment_id: id });
  if (error) {
    const message = error.message.toLowerCase();
    if (kind === 'request' && message.includes('withdraw from waitlist first'))
      return {
        error:
          locale === 'ar'
            ? 'أنت في قائمة الانتظار. غادرها أولاً قبل إرسال طلب انضمام.'
            : 'You are on the waitlist. Leave it before sending an enrollment request.',
      };
    if (kind === 'request' && message.includes('group full'))
      return {
        error:
          locale === 'ar'
            ? 'المجموعة ممتلئة. انضم إلى قائمة الانتظار إذا رغبت في طلب المراجعة عند توفر مقعد.'
            : 'This group is full. Join the waitlist if you want to request review when a place opens.',
      };
    return { error: t.failed };
  }
  if (kind === 'request')
    after(async () => {
      try {
        await flushEmailOutbox(1);
      } catch {
        /* Transactional outbox recovery handles delivery. */
      }
    });
  revalidatePath(`/${locale}`, 'layout');
  return { success: t.success };
}
export async function downloadMaterial(
  locale: Locale,
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const t = copy(locale);
  if (!['ar', 'en'].includes(locale) || !idSchema.safeParse(id).success)
    return { error: t.downloadError };
  const me = await viewer();
  if (!me || me.role !== 'student' || me.status !== 'active') return { error: t.studentOnly };
  const material = await me.db
    .from('lesson_materials')
    .select('storage_path,lesson_id')
    .eq('id', id)
    .eq('kind', 'file')
    .maybeSingle();
  if (material.error || !material.data?.storage_path) return { error: t.downloadError };
  const lesson = await me.db
    .from('lessons')
    .select('group_id')
    .eq('id', material.data.lesson_id)
    .maybeSingle();
  if (lesson.error || !lesson.data) return { error: t.downloadError };
  const enrollment = await me.db
    .from('enrollments')
    .select('id')
    .eq('group_id', lesson.data.group_id)
    .eq('student_id', me.id)
    .eq('status', 'accepted')
    .maybeSingle();
  if (enrollment.error || !enrollment.data) return { error: t.downloadError };
  const signed = await me.db.storage
    .from('lesson-materials')
    .createSignedUrl(material.data.storage_path, 60, { download: true });
  if (signed.error || !signed.data?.signedUrl) return { error: t.downloadError };
  return { url: signed.data.signedUrl };
}
