'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { idSchema, type Locale } from '@/features/student/domain';
import { publishRangeFieldErrors, publishRangeSchema } from './publish-domain';

export type TeacherPublishActionState = { error?: string; success?: string; fieldErrors?: Record<string, string> } | null;

const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

function mutationError(locale: Locale, raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes('conflict') || value.includes('overlap')) return message(locale,
    'Publishing was blocked by a lesson conflict. Review the schedule and preview, then try again.',
    'تعذر النشر بسبب تعارض في الحصص. راجع الجدول والمعاينة ثم حاول مرة أخرى.');
  if (value.includes('schedule') || value.includes('slot')) return message(locale,
    'Add at least one valid weekly time before publishing.',
    'أضف موعداً أسبوعياً صحيحاً واحداً على الأقل قبل النشر.');
  if (value.includes('approv')) return message(locale,
    'Your teacher account must be approved before you can publish.',
    'يجب اعتماد حساب المعلم قبل نشر المجموعة.');
  if (value.includes('not authorized') || value.includes('not found')) return message(locale,
    'This draft could not be published. Refresh the page and check your access.',
    'تعذر نشر هذه المسودة. حدّث الصفحة وتحقق من صلاحيتك.');
  return message(locale,
    'The group could not be published. Check its details, schedule, approval, and any lesson conflicts, then try again.',
    'تعذر نشر المجموعة. تحقق من بياناتها وجدولها واعتماد الحساب وأي تعارضات في الحصص ثم حاول مرة أخرى.');
}

export async function publishGroup(locale: Locale, groupId: string, _state: TeacherPublishActionState, form: FormData): Promise<TeacherPublishActionState> {
  if (!idSchema.safeParse(groupId).success) return { error: message(locale, 'This group could not be found.', 'تعذر العثور على هذه المجموعة.') };
  const range = publishRangeSchema.safeParse({ from: form.get('from'), until: form.get('until') });
  if (!range.success) return {
    error: message(locale, 'Enter both valid dates for lesson generation, or leave both dates blank.', 'أدخل تاريخين صحيحين لإنشاء الحصص أو اترك التاريخين فارغين.'),
    fieldErrors: publishRangeFieldErrors(range.error),
  };

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: message(locale, 'Sign in as an approved teacher to publish a group.', 'سجل الدخول بحساب معلم معتمد لنشر المجموعة.') };
  const [profile, teacher] = await Promise.all([
    db.from('profiles').select('role,status').eq('id', user.id).maybeSingle(),
    db.from('teacher_profiles').select('approved').eq('id', user.id).maybeSingle(),
  ]);
  if (profile.error || teacher.error) return { error: message(locale, 'Could not verify your teacher account. Please try again.', 'تعذر التحقق من حساب المعلم. حاول مرة أخرى.') };
  if (profile.data?.role !== 'teacher' || profile.data.status !== 'active') return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  if (!teacher.data?.approved) return { error: message(locale, 'Your teacher account must be approved before you can publish.', 'يجب اعتماد حساب المعلم قبل نشر المجموعة.') };

  const { error } = await db.rpc('publish_group', {
    p_group_id: groupId,
    p_from: range.data.from,
    p_until: range.data.until,
  });
  if (error) return { error: mutationError(locale, error.message) };

  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/groups`);
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}`);
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}/setup`);
    revalidatePath(`/${currentLocale}/teacher`);
    revalidatePath(`/${currentLocale}/teacher/lessons`);
    revalidatePath(`/${currentLocale}/teachers`);
    revalidatePath(`/${currentLocale}/groups/${groupId}`);
    revalidatePath(`/${currentLocale}/classes/${groupId}`);
    revalidatePath(`/${currentLocale}/student/classes`);
  }
  redirect(`/${locale}/teacher/groups/${groupId}`);
}
