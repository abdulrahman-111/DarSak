'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { idSchema, type Locale } from '@/features/student/domain';
import { generationRangeSchema, lessonExclusionsSchema, type GenerationPreviewRow } from './generation-domain';

const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

async function activeTeacher(locale: Locale) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { db, error: message(locale, 'Sign in as an active teacher to continue.', 'سجل الدخول بحساب معلم نشط للمتابعة.') };
  const { data: profile, error } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (error) return { db, error: message(locale, 'Could not verify your teacher account. Please try again.', 'تعذر التحقق من حساب المعلم. حاول مرة أخرى.') };
  if (profile?.role !== 'teacher' || profile.status !== 'active') return { db, error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  return { db, error: null };
}

function revalidateGroup(locale: Locale, groupId: string) {
  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}`);
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}/setup`);
    revalidatePath(`/${currentLocale}/teacher/lessons`);
    revalidatePath(`/${currentLocale}/teacher`);
  }
  revalidatePath(`/${locale}/teacher/groups/${groupId}`);
}

export async function previewLessons(locale: Locale, groupId: string, from: string, until: string): Promise<{ rows?: GenerationPreviewRow[]; error?: string }> {
  if (!idSchema.safeParse(groupId).success) return { error: message(locale, 'This group could not be found.', 'تعذر العثور على هذه المجموعة.') };
  const range = generationRangeSchema.safeParse({ from, until });
  if (!range.success) return { error: message(locale, 'Enter a valid date range of up to 90 days.', 'أدخل نطاقاً زمنياً صحيحاً لا يتجاوز 90 يوماً.') };
  const auth = await activeTeacher(locale);
  if (auth.error) return { error: auth.error };
  const { data, error } = await auth.db.rpc('preview_lesson_generation', {
    p_group_id: groupId,
    p_from: range.data.from,
    p_until: range.data.until,
  });
  if (error) return { error: message(locale, 'Could not load this preview. Check the group schedule and try again.', 'تعذر تحميل المعاينة. تحقق من جدول المجموعة وحاول مرة أخرى.') };
  return { rows: (data ?? []) as GenerationPreviewRow[] };
}

export async function saveLessonExclusions(locale: Locale, groupId: string, dates: string[]): Promise<{ success?: string; error?: string }> {
  if (!idSchema.safeParse(groupId).success) return { error: message(locale, 'This group could not be found.', 'تعذر العثور على هذه المجموعة.') };
  const parsed = lessonExclusionsSchema.safeParse(dates);
  if (!parsed.success) return { error: message(locale, 'Use up to 366 distinct valid dates for excluded days.', 'استخدم حتى 366 تاريخاً صحيحاً ومميزاً للأيام المستثناة.') };
  const auth = await activeTeacher(locale);
  if (auth.error) return { error: auth.error };
  const { error } = await auth.db.rpc('set_lesson_exclusions', { p_group_id: groupId, p_dates: parsed.data });
  if (error) return { error: message(locale, 'Could not save excluded days. Your changes are still available here; try again.', 'تعذر حفظ الأيام المستثناة. ستبقى تغييراتك هنا؛ حاول مرة أخرى.') };
  revalidateGroup(locale, groupId);
  return { success: message(locale, 'Excluded days saved.', 'تم حفظ الأيام المستثناة.') };
}

export async function confirmLessonGeneration(locale: Locale, groupId: string, from: string, until: string): Promise<{ generated?: number; error?: string }> {
  if (!idSchema.safeParse(groupId).success) return { error: message(locale, 'This group could not be found.', 'تعذر العثور على هذه المجموعة.') };
  const range = generationRangeSchema.safeParse({ from, until });
  if (!range.success) return { error: message(locale, 'Enter a valid date range of up to 90 days.', 'أدخل نطاقاً زمنياً صحيحاً لا يتجاوز 90 يوماً.') };
  const auth = await activeTeacher(locale);
  if (auth.error) return { error: auth.error };
  const { data, error } = await auth.db.rpc('generate_lessons', {
    p_group_id: groupId,
    p_from: range.data.from,
    p_until: range.data.until,
  });
  if (error) return { error: message(locale, 'Generation could not be completed. Refresh the preview and review any conflicts.', 'تعذر إنشاء الحصص. حدّث المعاينة وراجع أي تعارضات.') };
  revalidateGroup(locale, groupId);
  return { generated: data ?? 0 };
}
