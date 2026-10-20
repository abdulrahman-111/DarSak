'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkTeachingAccess, teachingGuardMessage } from '@/features/teacher-access/guard';
import { idSchema, type Locale } from '@/features/student/domain';
import {
  deleteMaterial as removeLessonMaterial,
  setLessonStatus as changeLessonStatus,
} from './actions';
import {
  copyLessonSchema,
  duplicateGroupSchema,
  duplicateSetupPath,
  shortcutMutationMessage,
} from './shortcuts-domain';

export type TeacherShortcutActionState = {
  error?: string;
  success?: string;
  lessonId?: string;
  ok?: boolean;
} | null;

const message = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);

async function activeTeacher(locale: Locale) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return {
      error: message(
        locale,
        'Sign in as an active teacher to continue.',
        'سجل الدخول بحساب معلم نشط للمتابعة.',
      ),
    } as const;
  const { data: profile, error } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();
  if (error)
    return {
      error: message(
        locale,
        'Could not verify your teacher account. Please try again.',
        'تعذر التحقق من حساب المعلم. حاول مرة أخرى.',
      ),
    } as const;
  if (profile?.role !== 'teacher' || profile.status !== 'active')
    return {
      error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.'),
    } as const;
  const access = await checkTeachingAccess(db);
  if (!access.allowed) return { error: teachingGuardMessage(locale, access.reason) } as const;
  return { db, user } as const;
}

export async function duplicateGroup(
  locale: Locale,
  _state: TeacherShortcutActionState,
  form: FormData,
): Promise<TeacherShortcutActionState> {
  const parsed = duplicateGroupSchema.safeParse({ source_group_id: form.get('source_group_id') });
  if (!parsed.success)
    return {
      error: message(locale, 'This group could not be duplicated.', 'تعذر نسخ هذه المجموعة.'),
    };

  const me = await activeTeacher(locale);
  if ('error' in me) return { error: me.error };
  const { data: draftId, error } = await me.db.rpc('duplicate_group', {
    p_group_id: parsed.data.source_group_id,
  });
  if (error || !idSchema.safeParse(draftId).success) {
    return { error: shortcutMutationMessage(locale, error?.message ?? 'missing group ID') };
  }

  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/groups`);
    revalidatePath(`/${currentLocale}/teacher`);
  }
  redirect(duplicateSetupPath(locale, parsed.data.source_group_id, draftId));
}

export async function copyLesson(
  locale: Locale,
  sourceLessonId: string,
  _state: TeacherShortcutActionState,
  form: FormData,
): Promise<TeacherShortcutActionState> {
  const parsed = copyLessonSchema.safeParse({
    source_lesson_id: sourceLessonId,
    target_group_id: form.get('target_group_id'),
    starts_at: form.get('starts_at'),
    ends_at: form.get('ends_at'),
  });
  if (!parsed.success)
    return {
      error: message(
        locale,
        'Choose a group and a valid start and end time.',
        'اختر مجموعة ووقتَي بداية ونهاية صحيحين.',
      ),
    };

  const me = await activeTeacher(locale);
  if ('error' in me) return { error: me.error };
  const source = await me.db
    .from('lessons')
    .select('title,notes,group:groups!inner(teacher_id)')
    .eq('id', parsed.data.source_lesson_id)
    .eq('group.teacher_id', me.user.id)
    .maybeSingle();
  if (source.error || !source.data)
    return { error: shortcutMutationMessage(locale, source.error?.message ?? 'source not found') };

  const target = await me.db
    .from('groups')
    .select('id')
    .eq('id', parsed.data.target_group_id)
    .eq('teacher_id', me.user.id)
    .neq('status', 'archived')
    .maybeSingle();
  if (target.error || !target.data)
    return { error: shortcutMutationMessage(locale, target.error?.message ?? 'target not found') };

  const { data: newLessonId, error } = await me.db.rpc('create_lesson', {
    p_group_id: parsed.data.target_group_id,
    p_title: source.data.title,
    p_starts_at: parsed.data.starts_at,
    p_ends_at: parsed.data.ends_at,
    p_notes: source.data.notes,
    p_lesson_id: null,
  });
  if (error || !idSchema.safeParse(newLessonId).success) {
    return { error: shortcutMutationMessage(locale, error?.message ?? 'missing lesson ID') };
  }

  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/lessons`);
    revalidatePath(`/${currentLocale}/teacher/lessons/${newLessonId}`);
    revalidatePath(`/${currentLocale}/teacher/groups/${parsed.data.target_group_id}`);
    revalidatePath(`/${currentLocale}/teacher`);
  }
  return {
    lessonId: newLessonId,
    success: message(
      locale,
      'Lesson copied. No materials or files were copied.',
      'تم نسخ الحصة. لم يتم نسخ المواد أو الملفات.',
    ),
  };
}

export async function updateLessonStatus(
  locale: Locale,
  lessonId: string,
  status: string,
): Promise<TeacherShortcutActionState> {
  const result = await changeLessonStatus(locale, lessonId, status);
  if (result.error) return { error: shortcutMutationMessage(locale, result.error) };
  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/lessons`);
    revalidatePath(`/${currentLocale}/teacher`);
  }
  return { ok: true };
}

export async function deleteLessonMaterial(
  locale: Locale,
  lessonId: string,
  materialId: string,
): Promise<TeacherShortcutActionState> {
  const result = await removeLessonMaterial(locale, lessonId, materialId);
  if (result.error) return { error: shortcutMutationMessage(locale, result.error) };
  return { ok: true, success: message(locale, 'Material deleted.', 'تم حذف المادة.') };
}
