'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { groupDetailsFieldErrors, groupDetailsSchema, groupScheduleSlotFieldErrors, groupScheduleSlotSchema } from './setup-domain';
import { idSchema } from '@/features/student/domain';

export type GroupDraftActionState = { error?: string; success?: string; fieldErrors?: Record<string, string>; id?: string } | null;
export type ScheduleSlotActionState = { error?: string; success?: string; fieldErrors?: Record<string, string> } | null;

const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

export async function saveGroupDraft(locale: Locale, _state: GroupDraftActionState, form: FormData): Promise<GroupDraftActionState> {
  const parsed = groupDetailsSchema.safeParse({
    name: form.get('name'),
    description: form.get('description') ?? '',
    offering_id: form.get('offering_id'),
    capacity: form.get('capacity') ?? undefined,
    location: form.get('location') ?? '',
  });
  if (!parsed.success) return {
    error: message(locale, 'Please check the highlighted fields.', 'يرجى مراجعة الحقول المحددة.'),
    fieldErrors: groupDetailsFieldErrors(parsed.error),
  };

  const rawId = form.get('group_id');
  const id = typeof rawId === 'string' && rawId.length ? rawId : null;
  if (id && !idSchema.safeParse(id).success) return {
    error: message(locale, 'This group could not be saved. Refresh the page and try again.', 'تعذر حفظ هذه المجموعة. حدّث الصفحة وحاول مرة أخرى.'),
  };

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: message(locale, 'Sign in as an active teacher to save a group.', 'سجل الدخول بحساب معلم نشط لحفظ المجموعة.') };

  const { data: profile, error: profileError } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profileError) return { error: message(locale, 'Could not verify your teacher account. Please try again.', 'تعذر التحقق من حساب المعلم. حاول مرة أخرى.') };
  if (profile?.role !== 'teacher' || profile.status !== 'active') return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };

  const details = {
    name: parsed.data.name,
    description: parsed.data.description,
    offering_id: parsed.data.offering_id,
    capacity: parsed.data.capacity,
    location: parsed.data.location,
  };
  let savedId: string | null = null;
  if (id) {
    const { data, error } = await db.from('groups')
      .update(details)
      .eq('id', id)
      .eq('teacher_id', user.id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (error) return { error: message(locale, 'Your draft could not be saved. It may no longer be a draft; refresh and try again.', 'تعذر حفظ المسودة. ربما لم تعد مسودة؛ حدّث الصفحة وحاول مرة أخرى.') };
    savedId = data?.id ?? null;
    if (!savedId) return { error: message(locale, 'Your draft could not be saved. It may no longer be a draft; refresh and try again.', 'تعذر حفظ المسودة. ربما لم تعد مسودة؛ حدّث الصفحة وحاول مرة أخرى.') };
  } else {
    const { data, error } = await db.from('groups')
      .insert({ ...details, teacher_id: user.id, status: 'draft' })
      .select('id')
      .single();
    if (error || !data?.id) return { error: message(locale, 'Your group could not be saved. Your changes are still in the form; please try again.', 'تعذر حفظ المجموعة. ستبقى تغييراتك في النموذج؛ حاول مرة أخرى.') };
    savedId = data.id;
  }
  if (!savedId) return { error: message(locale, 'Your group could not be saved. Please try again.', 'تعذر حفظ المجموعة. حاول مرة أخرى.') };

  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/groups`);
    revalidatePath(`/${currentLocale}/teacher`);
    revalidatePath(`/${currentLocale}/teacher/groups/${savedId}`);
    revalidatePath(`/${currentLocale}/teacher/groups/${savedId}/setup`);
  }
  return { id: savedId, success: message(locale, 'Draft saved.', 'تم حفظ المسودة.') };
}

function scheduleError(locale: Locale, rawError: string): string {
  const error = rawError.toLowerCase();
  if (error.includes('overlap') && (error.includes('lesson') || error.includes('schedule'))) {
    return message(locale,
      'That time conflicts with another weekly time or an existing lesson. Choose a different time.',
      'يتعارض هذا الموعد مع موعد أسبوعي آخر أو حصة موجودة. اختر موعداً آخر.');
  }
  if (error.includes('generated') || error.includes('dated lesson') || (error.includes('lesson') && error.includes('slot'))) {
    return message(locale,
      'This time is used by an existing lesson or is required by this published group.',
      'هذا الموعد مرتبط بحصة موجودة أو مطلوب لهذه المجموعة المنشورة.');
  }
  if (error.includes('last schedule') || (error.includes('published') && error.includes('slot'))) {
    return message(locale,
      'A published group must keep at least one weekly time.',
      'يجب أن تحتفظ المجموعة المنشورة بموعد أسبوعي واحد على الأقل.');
  }
  return message(locale,
    'The schedule could not be changed. Refresh the page and try again.',
    'تعذر تغيير الجدول. حدّث الصفحة وحاول مرة أخرى.');
}

function scheduleInput(form: FormData) {
  const slotId = form.get('slot_id');
  return {
    group_id: form.get('group_id'),
    ...(typeof slotId === 'string' && slotId ? { slot_id: slotId } : {}),
    weekday: form.get('weekday'),
    start_time: form.get('start_time'),
    end_time: form.get('end_time'),
  };
}

export async function saveScheduleSlot(locale: Locale, _state: ScheduleSlotActionState, form: FormData): Promise<ScheduleSlotActionState> {
  const parsed = groupScheduleSlotSchema.safeParse(scheduleInput(form));
  if (!parsed.success) return {
    error: message(locale, 'Check the weekday and start and end times.', 'تحقق من اليوم ووقتَي البداية والنهاية.'),
    fieldErrors: groupScheduleSlotFieldErrors(parsed.error),
  };

  const db = await createClient();
  const { error } = await db.rpc('save_schedule_slot', {
    p_group_id: parsed.data.group_id,
    p_weekday: parsed.data.weekday,
    p_start_time: parsed.data.start_time,
    p_end_time: parsed.data.end_time,
    ...(parsed.data.slot_id ? { p_slot_id: parsed.data.slot_id } : {}),
  });
  if (error) return { error: scheduleError(locale, error.message) };

  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/groups/${parsed.data.group_id}/setup`);
    revalidatePath(`/${currentLocale}/teacher/groups/${parsed.data.group_id}`);
  }
  return { success: message(locale, 'Weekly time saved.', 'تم حفظ الموعد الأسبوعي.') };
}

export async function deleteScheduleSlot(locale: Locale, _state: ScheduleSlotActionState, form: FormData): Promise<ScheduleSlotActionState> {
  const groupId = form.get('group_id');
  const slotId = form.get('slot_id');
  if (typeof groupId !== 'string' || !idSchema.safeParse(groupId).success || typeof slotId !== 'string' || !idSchema.safeParse(slotId).success) {
    return { error: message(locale, 'This schedule could not be changed. Refresh the page and try again.', 'تعذر تغيير هذا الموعد. حدّث الصفحة وحاول مرة أخرى.') };
  }

  const db = await createClient();
  const { error } = await db.rpc('delete_schedule_slot', { p_group_id: groupId, p_slot_id: slotId });
  if (error) return { error: scheduleError(locale, error.message) };

  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}/setup`);
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}`);
  }
  return { success: message(locale, 'Weekly time removed.', 'تم حذف الموعد الأسبوعي.') };
}
