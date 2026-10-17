'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logActionFailure } from '@/lib/action-diagnostics';
import { safeFile } from '@/lib/domain';
import { idSchema, type Locale } from '@/features/student/domain';
import { lessonStatusSchema, materialSchema, storageObjectPath } from './domain';
import { storageRemovalConfirmed } from './profile-domain';
import { checkTeachingAccess, teachingGuardMessage, teachingMutationMessage } from '@/features/teacher-access/guard';
import { quotaErrorMessage } from '@/features/subscriptions/quota-errors';

export type TeacherActionState = { error?: string; success?: string } | null;
const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

async function activeTeacher() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', user.id).single();
  if(profile?.role !== 'teacher' || profile.status !== 'active') return null;
  return { db, id: user.id, access: await checkTeachingAccess(db) };
}

async function ownsLesson(db: Awaited<ReturnType<typeof createClient>>, teacherId: string, lessonId: string) {
  return db.from('lessons').select('id,group:groups!inner(teacher_id)').eq('id', lessonId).eq('group.teacher_id', teacherId).maybeSingle();
}

async function removeMaterialObject(db: Awaited<ReturnType<typeof createClient>>, path: string): Promise<boolean> {
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
  if (listed.error) logActionFailure('materials.storage.remove_confirm', startedAt, listed.error, 'STORAGE_ERROR');
  else if (Array.isArray(listed.data) && listed.data.some(object => object.name === name)) logActionFailure('materials.storage.remove', startedAt, undefined, 'STORAGE_FAILURE');
  return !listed.error && Array.isArray(listed.data) && !listed.data.some(object => object.name === name);
}

function isDefinitiveMaterialInsertRejection(error: { code?: string } | null | undefined) {
  return ['42501', '23503', '23505', '23514', '22P02', '22001'].includes(error?.code ?? '');
}

export async function addMaterial(locale: Locale, lessonId: string, _state: TeacherActionState, form: FormData): Promise<TeacherActionState> {
  const startedAt = Date.now();
  if (!idSchema.safeParse(lessonId).success) return { error: message(locale, 'Invalid lesson.', 'الحصة غير صالحة.') };
  const parsed = materialSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: message(locale, 'Check the material details.', 'تحقق من بيانات المادة.') };
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'Teacher access required.', 'يلزم حساب مدرس نشط.') };
  if(!me.access.allowed)return {error:teachingGuardMessage(locale,me.access.reason)};
  const owned = await ownsLesson(me.db, me.id, lessonId);
  if (owned.error) logActionFailure('materials.ownership.lookup', startedAt, owned.error, 'DB_ERROR');
  else if (!owned.data) logActionFailure('materials.ownership.lookup', startedAt, undefined, 'NOT_FOUND');
  if (owned.error || !owned.data) return { error: message(locale, 'Lesson not found.', 'الحصة غير موجودة.') };
  const { error } = parsed.data.kind === 'link'
    ? await me.db.from('lesson_materials').insert({ lesson_id: lessonId, uploaded_by: me.id, kind: 'link', title: parsed.data.title, url: parsed.data.url })
    : await me.db.from('lesson_materials').insert({ lesson_id: lessonId, uploaded_by: me.id, kind: 'note', title: parsed.data.title, content: parsed.data.content });
  if (error) {
    logActionFailure('materials.metadata.save', startedAt, error, 'DB_ERROR');
    if(error.code==='42501'&&error.message==='teacher teaching access expired')return {error:teachingMutationMessage(locale,error,'')};
    return { error: message(locale, 'Could not add the material.', 'تعذرت إضافة المادة.') };
  }
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  return { success: message(locale, 'Material added.', 'تمت إضافة المادة.') };
}

export async function uploadMaterial(locale: Locale, lessonId: string, _state: TeacherActionState, form: FormData): Promise<TeacherActionState> {
  const startedAt = Date.now();
  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  if (!idSchema.safeParse(lessonId).success || !(file instanceof File) || !title || title.length > 180 || !safeFile(file)) {
    return { error: message(locale, 'Choose a PDF or image up to 10 MB.', 'اختر ملف PDF أو صورة بحد أقصى ١٠ ميجابايت.') };
  }
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'Teacher access required.', 'يلزم حساب مدرس نشط.') };
  if(!me.access.allowed)return {error:teachingGuardMessage(locale,me.access.reason)};
  const owned = await ownsLesson(me.db, me.id, lessonId);
  if (owned.error) logActionFailure('materials.ownership.lookup', startedAt, owned.error, 'DB_ERROR');
  else if (!owned.data) logActionFailure('materials.ownership.lookup', startedAt, undefined, 'NOT_FOUND');
  if (owned.error || !owned.data) return { error: message(locale, 'Lesson not found.', 'الحصة غير موجودة.') };
  let path: string;
  try { path = storageObjectPath(me.id, lessonId, file.name, randomUUID()); }
  catch { return { error: message(locale, 'Unsupported file type.', 'نوع الملف غير مدعوم.') }; }
  const uploaded = await me.db.storage.from('lesson-materials').upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) {
    logActionFailure('materials.storage.upload', startedAt, uploaded.error, 'STORAGE_ERROR');
    if('code' in uploaded.error&&uploaded.error.code==='42501'&&uploaded.error.message==='teacher teaching access expired')return {error:teachingMutationMessage(locale,{code:'42501',message:uploaded.error.message},'')};
    const quotaMessage = quotaErrorMessage(locale, uploaded.error.message);
    if (quotaMessage) return { error: quotaMessage };
    return { error: message(locale, 'Upload failed.', 'فشل رفع الملف.') };
  }
  const inserted = await me.db.from('lesson_materials').insert({ lesson_id: lessonId, uploaded_by: me.id, kind: 'file', title, storage_path: path, file_size: file.size, mime_type: file.type });
  if (inserted.error) {
    logActionFailure('materials.metadata.save', startedAt, inserted.error, 'DB_ERROR');
    let verified: { data: { storage_path: string } | null; error: unknown };
    try {
      verified = await me.db.from('lesson_materials').select('storage_path').eq('lesson_id', lessonId).eq('uploaded_by', me.id).eq('storage_path', path).maybeSingle();
    } catch {
      verified = { data: null, error: new Error('readback failed') };
    }
    if (!verified.error && verified.data?.storage_path === path) {
      revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
      return { success: message(locale, 'File uploaded.', 'تم رفع الملف.') };
    }
    if (!verified.error && !verified.data && !isDefinitiveMaterialInsertRejection(inserted.error)) {
      return { error: message(locale,
        'The save result could not be confirmed. The file is preserved; check the lesson before trying again.',
        'تعذر التحقق من نتيجة الحفظ. تم الاحتفاظ بالملف؛ تحقق من الحصة قبل المحاولة مرة أخرى.') };
    }
    if (!isDefinitiveMaterialInsertRejection(inserted.error)) {
      return { error: message(locale,
        'The save result could not be confirmed. The file is preserved; check the lesson before trying again.',
        'تعذر التحقق من نتيجة الحفظ. تم الاحتفاظ بالملف؛ تحقق من الحصة قبل المحاولة مرة أخرى.') };
    }
    if(inserted.error.code==='42501'&&inserted.error.message==='teacher teaching access expired'){
      await removeMaterialObject(me.db,path);
      return {error:teachingMutationMessage(locale,inserted.error,'')};
    }
    const cleaned = await removeMaterialObject(me.db, path);
    const quotaMessage = quotaErrorMessage(locale, inserted.error.message);
    if (quotaMessage) return { error: cleaned ? quotaMessage : message(locale,
      'The file could not be saved and cleanup is incomplete. Retry or contact support.',
      'تعذر حفظ الملف ولم يكتمل تنظيفه. أعد المحاولة أو تواصل مع الدعم.') };
    return { error: message(locale,
      cleaned ? 'Could not save the uploaded file.' : 'Could not save the file, and cleanup is incomplete. Retry or contact support.',
      cleaned ? 'تعذر حفظ الملف المرفوع.' : 'تعذر حفظ الملف ولم يكتمل تنظيفه. أعد المحاولة أو تواصل مع الدعم.' ) };
  }
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  return { success: message(locale, 'File uploaded.', 'تم رفع الملف.') };
}

export async function setLessonStatus(locale: Locale, lessonId: string, status: string) {
  const startedAt = Date.now();
  if (!idSchema.safeParse(lessonId).success || !lessonStatusSchema.safeParse(status).success) return { error: message(locale, 'Choose a valid lesson status.', 'اختر حالة صالحة للحصة.') };
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  if(!me.access.allowed)return {error:teachingGuardMessage(locale,me.access.reason)};
  const { error } = await me.db.rpc('set_lesson_status', { p_lesson_id: lessonId, p_status: status });
  if (error) logActionFailure('lesson_status.save', startedAt, error, 'DB_ERROR');
  if (!error) revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  if (!error) return { ok: true };
  const raw = error.message.toLowerCase();
  if(error.code==='42501'&&error.message==='teacher teaching access expired')return {error:teachingMutationMessage(locale,error,'')};
  if (raw.includes('not authorized') || error.code === '42501') return { error: message(locale, 'You are not authorized to change this lesson.', 'ليست لديك صلاحية لتغيير هذه الحصة.') };
  if (raw.includes('archived')) return { error: message(locale, 'This group is archived. You can review its lesson history, but cannot schedule lessons.', 'هذه المجموعة مؤرشفة. يمكنك مراجعة سجل الحصص، لكن لا يمكن جدولة حصص جديدة.') };
  if (raw.includes('overlap') || raw.includes('conflict')) return { error: message(locale, 'This lesson overlaps another lesson. Choose a different time.', 'يتعارض موعد هذه الحصة مع حصة أخرى. اختر موعداً مختلفاً.') };
  if (raw.includes('not found') || raw.includes('changed')) return { error: message(locale, 'This lesson has changed or is no longer available. Refresh the page and try again.', 'تغيرت هذه الحصة أو لم تعد متاحة. حدّث الصفحة وحاول مرة أخرى.') };
  return { error: message(locale, 'Could not update the lesson status. Refresh the page and try again.', 'تعذر تحديث حالة الحصة. حدّث الصفحة وحاول مرة أخرى.') };
}

export async function deleteMaterial(locale: Locale, lessonId: string, materialId: string) {
  const startedAt = Date.now();
  if (!idSchema.safeParse(lessonId).success || !idSchema.safeParse(materialId).success) return { error: message(locale, 'This material is not available.', 'هذه المادة غير متاحة.') };
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  if(!me.access.allowed)return {error:teachingGuardMessage(locale,me.access.reason)};
  const { data: material, error: lookupError } = await me.db.from('lesson_materials').select('storage_path').eq('id', materialId).eq('lesson_id', lessonId).maybeSingle();
  if (lookupError) {
    logActionFailure('materials.metadata.lookup', startedAt, lookupError, 'DB_ERROR');
    if(lookupError.code==='42501'&&lookupError.message==='teacher teaching access expired')return {error:teachingMutationMessage(locale,lookupError,'')};
    return { error: message(locale, 'Could not load the material. Refresh and try again.', 'تعذر تحميل المادة. حدّث الصفحة وحاول مرة أخرى.') };
  }
  if (!material) return { error: message(locale, 'This material is no longer available.', 'لم تعد هذه المادة متاحة.') };
  if (material.storage_path && !(await removeMaterialObject(me.db, material.storage_path))) {
    return { error: message(locale, 'Could not remove the file. The material is still available; please retry.', 'تعذر حذف الملف. ما زالت المادة متاحة؛ حاول مرة أخرى.') };
  }
  const removed = await me.db.from('lesson_materials').delete().eq('id', materialId);
  if (removed.error) {
    logActionFailure('materials.metadata.delete', startedAt, removed.error, 'DB_ERROR');
    if(removed.error.code==='42501'&&removed.error.message==='teacher teaching access expired')return {error:teachingMutationMessage(locale,removed.error,'')};
    return { error: message(locale, 'Could not delete the material. Refresh and try again.', 'تعذر حذف المادة. حدّث الصفحة وحاول مرة أخرى.') };
  }
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  return { ok: true };
}
