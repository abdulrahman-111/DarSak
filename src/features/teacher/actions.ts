'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeFile } from '@/lib/domain';
import { idSchema, type Locale } from '@/features/student/domain';
import { lessonStatusSchema, materialSchema, storageObjectPath } from './domain';
import { storageRemovalConfirmed } from './profile-domain';

export type TeacherActionState = { error?: string; success?: string } | null;
const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

async function activeTeacher() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', user.id).single();
  return profile?.role === 'teacher' && profile.status === 'active' ? { db, id: user.id } : null;
}

async function ownsLesson(db: Awaited<ReturnType<typeof createClient>>, teacherId: string, lessonId: string) {
  return db.from('lessons').select('id,group:groups!inner(teacher_id)').eq('id', lessonId).eq('group.teacher_id', teacherId).maybeSingle();
}

async function removeMaterialObject(db: Awaited<ReturnType<typeof createClient>>, path: string): Promise<boolean> {
  const bucket = db.storage.from('lesson-materials');
  const removed = await bucket.remove([path]);
  if (storageRemovalConfirmed(path, removed.data, removed.error)) return true;
  if (removed.error) return false;

  // Storage removal is idempotent at the API, but an empty result can also mean
  // no object was removed. Confirm absence while metadata still grants visibility.
  const parent = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const listed = await bucket.list(parent, { search: name, limit: 100 });
  return !listed.error && Array.isArray(listed.data) && !listed.data.some(object => object.name === name);
}

export async function addMaterial(locale: Locale, lessonId: string, _state: TeacherActionState, form: FormData): Promise<TeacherActionState> {
  if (!idSchema.safeParse(lessonId).success) return { error: message(locale, 'Invalid lesson.', 'الحصة غير صالحة.') };
  const parsed = materialSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: message(locale, 'Check the material details.', 'تحقق من بيانات المادة.') };
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'Teacher access required.', 'يلزم حساب مدرس نشط.') };
  const owned = await ownsLesson(me.db, me.id, lessonId);
  if (owned.error || !owned.data) return { error: message(locale, 'Lesson not found.', 'الحصة غير موجودة.') };
  const { error } = parsed.data.kind === 'link'
    ? await me.db.from('lesson_materials').insert({ lesson_id: lessonId, uploaded_by: me.id, kind: 'link', title: parsed.data.title, url: parsed.data.url })
    : await me.db.from('lesson_materials').insert({ lesson_id: lessonId, uploaded_by: me.id, kind: 'note', title: parsed.data.title, content: parsed.data.content });
  if (error) return { error: message(locale, 'Could not add the material.', 'تعذرت إضافة المادة.') };
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  return { success: message(locale, 'Material added.', 'تمت إضافة المادة.') };
}

export async function uploadMaterial(locale: Locale, lessonId: string, _state: TeacherActionState, form: FormData): Promise<TeacherActionState> {
  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  if (!idSchema.safeParse(lessonId).success || !(file instanceof File) || !title || title.length > 180 || !safeFile(file)) {
    return { error: message(locale, 'Choose a PDF or image up to 10 MB.', 'اختر ملف PDF أو صورة بحد أقصى ١٠ ميجابايت.') };
  }
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'Teacher access required.', 'يلزم حساب مدرس نشط.') };
  const owned = await ownsLesson(me.db, me.id, lessonId);
  if (owned.error || !owned.data) return { error: message(locale, 'Lesson not found.', 'الحصة غير موجودة.') };
  let path: string;
  try { path = storageObjectPath(me.id, lessonId, file.name, randomUUID()); }
  catch { return { error: message(locale, 'Unsupported file type.', 'نوع الملف غير مدعوم.') }; }
  const uploaded = await me.db.storage.from('lesson-materials').upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) return { error: message(locale, 'Upload failed.', 'فشل رفع الملف.') };
  const inserted = await me.db.from('lesson_materials').insert({ lesson_id: lessonId, uploaded_by: me.id, kind: 'file', title, storage_path: path, file_size: file.size, mime_type: file.type });
  if (inserted.error) {
    const cleaned = await removeMaterialObject(me.db, path);
    return { error: message(locale,
      cleaned ? 'Could not save the uploaded file.' : 'Could not save the file, and cleanup is incomplete. Retry or contact support.',
      cleaned ? 'تعذر حفظ الملف المرفوع.' : 'تعذر حفظ الملف ولم يكتمل تنظيفه. أعد المحاولة أو تواصل مع الدعم.' ) };
  }
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  return { success: message(locale, 'File uploaded.', 'تم رفع الملف.') };
}

export async function setLessonStatus(locale: Locale, lessonId: string, status: string) {
  if (!idSchema.safeParse(lessonId).success || !lessonStatusSchema.safeParse(status).success) return { error: 'Invalid status' };
  const me = await activeTeacher();
  if (!me) return { error: 'Not authorized' };
  const { error } = await me.db.rpc('set_lesson_status', { p_lesson_id: lessonId, p_status: status });
  if (!error) revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  return error ? { error: error.message } : { ok: true };
}

export async function deleteMaterial(locale: Locale, lessonId: string, materialId: string) {
  if (!idSchema.safeParse(lessonId).success || !idSchema.safeParse(materialId).success) return { error: 'Invalid material' };
  const me = await activeTeacher();
  if (!me) return { error: 'Not authorized' };
  const { data: material, error: lookupError } = await me.db.from('lesson_materials').select('storage_path').eq('id', materialId).eq('lesson_id', lessonId).maybeSingle();
  if (lookupError) return { error: 'Could not load material. Please retry.' };
  if (!material) return { error: 'Material not found' };
  if (material.storage_path && !(await removeMaterialObject(me.db, material.storage_path))) {
    return { error: 'Could not remove the file. The material is still available; please retry.' };
  }
  const removed = await me.db.from('lesson_materials').delete().eq('id', materialId);
  if (removed.error) return { error: removed.error.message };
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  return { ok: true };
}
