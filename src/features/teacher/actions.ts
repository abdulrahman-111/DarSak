'use server';

import { revalidatePath } from 'next/cache';
import { scheduleGoogleMeetSync } from '@/features/meet/after-sync';
import { createClient } from '@/lib/supabase/server';
import { logActionFailure } from '@/lib/action-diagnostics';
import { idSchema, type Locale } from '@/features/student/domain';
import { lessonStatusSchema, materialSchema } from './domain';
import { storageRemovalConfirmed } from './profile-domain';
import {
  checkTeachingAccess,
  teachingGuardMessage,
  teachingMutationMessage,
} from '@/features/teacher-access/guard';
import {
  revalidateStudentWorkspace,
  revalidateTeacherWorkspace,
} from '@/features/student/workspace-revalidation';

export type TeacherActionState = { error?: string; success?: string } | null;
const message = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);

async function activeTeacher() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'teacher' || profile.status !== 'active') return null;
  return { db, id: user.id, access: await checkTeachingAccess(db) };
}

async function ownsLesson(
  db: Awaited<ReturnType<typeof createClient>>,
  teacherId: string,
  lessonId: string,
) {
  return db
    .from('lessons')
    .select('id,group:groups!inner(teacher_id)')
    .eq('id', lessonId)
    .eq('group.teacher_id', teacherId)
    .maybeSingle();
}

async function removeMaterialObject(
  db: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<boolean> {
  const startedAt = Date.now();
  const bucket = db.storage.from('lesson-materials');
  const removed = await bucket.remove([path]);
  if (storageRemovalConfirmed(path, removed.data, removed.error)) return true;
  if (removed.error) {
    logActionFailure('materials.storage.remove', startedAt, removed.error, 'STORAGE_ERROR');
    return false;
  }

  // Storage removal is idempotent at the API, but an empty result can also mean
  // no object was removed. Confirm absence while metadata still grants visibility.
  const parent = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const listed = await bucket.list(parent, { search: name, limit: 100 });
  if (listed.error)
    logActionFailure('materials.storage.remove_confirm', startedAt, listed.error, 'STORAGE_ERROR');
  else if (Array.isArray(listed.data) && listed.data.some(object => object.name === name))
    logActionFailure('materials.storage.remove', startedAt, undefined, 'STORAGE_FAILURE');
  return (
    !listed.error && Array.isArray(listed.data) && !listed.data.some(object => object.name === name)
  );
}

export async function addMaterial(
  locale: Locale,
  lessonId: string,
  _state: TeacherActionState,
  form: FormData,
): Promise<TeacherActionState> {
  const startedAt = Date.now();
  if (!idSchema.safeParse(lessonId).success)
    return { error: message(locale, 'Invalid lesson.', 'الحصة غير صالحة.') };
  const parsed = materialSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: message(locale, 'Check the material details.', 'تحقق من بيانات المادة.') };
  if (parsed.data.kind !== 'link')
    return {
      error: message(
        locale,
        'New lesson resources can only be links.',
        'يمكن إضافة روابط فقط كموارد جديدة للدرس.',
      ),
    };
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'Teacher access required.', 'يلزم حساب مدرس نشط.') };
  if (!me.access.allowed) return { error: teachingGuardMessage(locale, me.access.reason) };
  const owned = await ownsLesson(me.db, me.id, lessonId);
  if (owned.error)
    logActionFailure('materials.ownership.lookup', startedAt, owned.error, 'DB_ERROR');
  else if (!owned.data)
    logActionFailure('materials.ownership.lookup', startedAt, undefined, 'NOT_FOUND');
  if (owned.error || !owned.data)
    return { error: message(locale, 'Lesson not found.', 'الحصة غير موجودة.') };
  const { error } = await me.db.from('lesson_materials').insert({
    lesson_id: lessonId,
    uploaded_by: me.id,
    kind: 'link',
    title: parsed.data.title,
    url: parsed.data.url,
  });
  if (error) {
    logActionFailure('materials.metadata.save', startedAt, error, 'DB_ERROR');
    if (error.code === '42501' && error.message === 'teacher teaching access expired')
      return { error: teachingMutationMessage(locale, error, '') };
    return { error: message(locale, 'Could not add the material.', 'تعذرت إضافة المادة.') };
  }
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  revalidateStudentWorkspace();
  revalidateTeacherWorkspace();
  return { success: message(locale, 'Material added.', 'تمت إضافة المادة.') };
}

export async function uploadMaterial(
  locale: Locale,
  _lessonId: string,
  _state: TeacherActionState,
  _form: FormData,
): Promise<TeacherActionState> {
  return {
    error: message(
      locale,
      'File uploads are unavailable. Add a link or lesson note instead.',
      'رفع الملفات غير متاح. أضف رابطاً أو ملاحظة للدرس بدلاً من ذلك.',
    ),
  };
}

export async function setLessonStatus(locale: Locale, lessonId: string, status: string) {
  const startedAt = Date.now();
  if (!idSchema.safeParse(lessonId).success || !lessonStatusSchema.safeParse(status).success)
    return { error: message(locale, 'Choose a valid lesson status.', 'اختر حالة صالحة للحصة.') };
  const me = await activeTeacher();
  if (!me)
    return {
      error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.'),
    };
  if (!me.access.allowed) return { error: teachingGuardMessage(locale, me.access.reason) };
  const { error } = await me.db.rpc('set_lesson_status', {
    p_lesson_id: lessonId,
    p_status: status,
  });
  if (error) logActionFailure('lesson_status.save', startedAt, error, 'DB_ERROR');
  if (!error) {
    scheduleGoogleMeetSync(me.db);
    revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
    revalidateStudentWorkspace();
    revalidateTeacherWorkspace();
  }
  if (!error) return { ok: true };
  const raw = error.message.toLowerCase();
  if (error.code === '42501' && error.message === 'teacher teaching access expired')
    return { error: teachingMutationMessage(locale, error, '') };
  if (raw.includes('not authorized') || error.code === '42501')
    return {
      error: message(
        locale,
        'You are not authorized to change this lesson.',
        'ليست لديك صلاحية لتغيير هذه الحصة.',
      ),
    };
  if (raw.includes('archived'))
    return {
      error: message(
        locale,
        'This group is archived. You can review its lesson history, but cannot schedule lessons.',
        'هذه المجموعة مؤرشفة. يمكنك مراجعة سجل الحصص، لكن لا يمكن جدولة حصص جديدة.',
      ),
    };
  if (raw.includes('overlap') || raw.includes('conflict'))
    return {
      error: message(
        locale,
        'This lesson overlaps another lesson. Choose a different time.',
        'يتعارض موعد هذه الحصة مع حصة أخرى. اختر موعداً مختلفاً.',
      ),
    };
  if (raw.includes('not found') || raw.includes('changed'))
    return {
      error: message(
        locale,
        'This lesson has changed or is no longer available. Refresh the page and try again.',
        'تغيرت هذه الحصة أو لم تعد متاحة. حدّث الصفحة وحاول مرة أخرى.',
      ),
    };
  return {
    error: message(
      locale,
      'Could not update the lesson status. Refresh the page and try again.',
      'تعذر تحديث حالة الحصة. حدّث الصفحة وحاول مرة أخرى.',
    ),
  };
}

export async function deleteMaterial(locale: Locale, lessonId: string, materialId: string) {
  const startedAt = Date.now();
  if (!idSchema.safeParse(lessonId).success || !idSchema.safeParse(materialId).success)
    return { error: message(locale, 'This material is not available.', 'هذه المادة غير متاحة.') };
  const me = await activeTeacher();
  if (!me)
    return {
      error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.'),
    };
  if (!me.access.allowed) return { error: teachingGuardMessage(locale, me.access.reason) };
  const { data: material, error: lookupError } = await me.db
    .from('lesson_materials')
    .select('storage_path')
    .eq('id', materialId)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (lookupError) {
    logActionFailure('materials.metadata.lookup', startedAt, lookupError, 'DB_ERROR');
    if (lookupError.code === '42501' && lookupError.message === 'teacher teaching access expired')
      return { error: teachingMutationMessage(locale, lookupError, '') };
    return {
      error: message(
        locale,
        'Could not load the material. Refresh and try again.',
        'تعذر تحميل المادة. حدّث الصفحة وحاول مرة أخرى.',
      ),
    };
  }
  if (!material)
    return {
      error: message(locale, 'This material is no longer available.', 'لم تعد هذه المادة متاحة.'),
    };
  if (material.storage_path && !(await removeMaterialObject(me.db, material.storage_path))) {
    return {
      error: message(
        locale,
        'Could not remove the file. The material is still available; please retry.',
        'تعذر حذف الملف. ما زالت المادة متاحة؛ حاول مرة أخرى.',
      ),
    };
  }
  const removed = await me.db.from('lesson_materials').delete().eq('id', materialId);
  if (removed.error) {
    logActionFailure('materials.metadata.delete', startedAt, removed.error, 'DB_ERROR');
    if (
      removed.error.code === '42501' &&
      removed.error.message === 'teacher teaching access expired'
    )
      return { error: teachingMutationMessage(locale, removed.error, '') };
    return {
      error: message(
        locale,
        'Could not delete the material. Refresh and try again.',
        'تعذر حذف المادة. حدّث الصفحة وحاول مرة أخرى.',
      ),
    };
  }
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  revalidateStudentWorkspace();
  revalidateTeacherWorkspace();
  return { ok: true };
}
