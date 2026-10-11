'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import type { TeacherProfileActionState } from './profile-actions';
import { storageRemovalConfirmed, teacherAvatarMaxBytes } from './profile-domain';
import { teacherCoverImageType, teacherCoverPath } from './profile-details-domain';

const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

async function activeTeacher() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (error || profile?.role !== 'teacher' || profile.status !== 'active') return null;
  return { db, id: user.id };
}

function revalidateTeacherProfilePaths(locale: Locale, teacherId: string) {
  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/profile`);
    revalidatePath(`/${currentLocale}/teacher`);
    revalidatePath(`/${currentLocale}/teachers`);
    revalidatePath(`/${currentLocale}/teachers/${teacherId}`);
  }
  revalidatePath('/[locale]/teachers/[id]', 'page');
}

async function removeCoverObject(db: Awaited<ReturnType<typeof createClient>>, path: string) {
  const removed = await db.storage.from('teacher-avatars').remove([path]);
  return storageRemovalConfirmed(path, removed.data, removed.error);
}

async function currentCoverPath(db: Awaited<ReturnType<typeof createClient>>, teacherId: string) {
  const current = await db.from('teacher_profiles').select('cover_path').eq('id', teacherId).maybeSingle();
  return current.error || !current.data ? { error: true as const } : { error: false as const, path: current.data.cover_path as string | null };
}

export async function uploadTeacherCover(locale: Locale, _state: TeacherProfileActionState, form: FormData): Promise<TeacherProfileActionState> {
  const file = form.get('cover');
  if (!(file instanceof File) || file.size < 1 || file.size > teacherAvatarMaxBytes || !await teacherCoverImageType(file)) {
    return {
      error: message(locale, 'Choose a valid JPEG, PNG, or WebP cover image up to 2 MB.', 'اختر صورة غلاف JPEG أو PNG أو WebP صحيحة بحجم لا يتجاوز ٢ ميجابايت.'),
      fieldErrors: { cover: 'invalid' },
    };
  }

  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required to change your cover.', 'يلزم حساب معلم نشط لتغيير صورة الغلاف.') };
  const current = await currentCoverPath(me.db, me.id);
  if (current.error) return { error: message(locale, 'Could not load your current cover. Please try again.', 'تعذر تحميل صورة الغلاف الحالية. حاول مرة أخرى.') };

  const path = teacherCoverPath(me.id, randomUUID(), file.type);
  const uploaded = await me.db.storage.from('teacher-avatars').upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) return { error: message(locale, 'Cover upload failed. Please try again.', 'تعذر رفع صورة الغلاف. حاول مرة أخرى.') };

  const saved = await me.db.rpc('set_teacher_cover_path', { p_cover_path: path, p_expected_path: current.path });
  let coverSaved = !saved.error && saved.data === true;
  if (!coverSaved) {
    const verified = await currentCoverPath(me.db, me.id);
    if (verified.error) return { error: message(locale, 'The save result could not be confirmed. The uploaded file remains private; please retry or contact support.', 'تعذر التحقق من نتيجة الحفظ. بقي الملف المرفوع خاصاً؛ حاول مرة أخرى أو تواصل مع الدعم.') };
    coverSaved = verified.path === path;
    if (!coverSaved) {
      const cleaned = await removeCoverObject(me.db, path);
      return { error: cleaned
        ? message(locale, 'The cover changed in another request. Your newer cover was kept.', 'تغيرت صورة الغلاف في طلب آخر. تم الاحتفاظ بالأحدث.')
        : message(locale, 'The cover could not be saved or cleaned up. Please contact support.', 'تعذر حفظ صورة الغلاف أو تنظيف الملف المرفوع. تواصل مع الدعم.') };
    }
  }

  const previousCleanupFailed = current.path && current.path !== path
    ? !await removeCoverObject(me.db, current.path)
    : false;
  revalidateTeacherProfilePaths(locale, me.id);
  return { success: previousCleanupFailed
    ? message(locale, 'Cover updated. The previous file could not be cleaned up.', 'تم تحديث صورة الغلاف. تعذر تنظيف الملف السابق.')
    : message(locale, 'Cover updated.', 'تم تحديث صورة الغلاف.') };
}

export async function removeTeacherCover(locale: Locale, _state: TeacherProfileActionState, _form: FormData): Promise<TeacherProfileActionState> {
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required to change your cover.', 'يلزم حساب معلم نشط لتغيير صورة الغلاف.') };
  const current = await currentCoverPath(me.db, me.id);
  if (current.error) return { error: message(locale, 'Could not load your current cover. Please try again.', 'تعذر تحميل صورة الغلاف الحالية. حاول مرة أخرى.') };
  if (!current.path) return { success: message(locale, 'There is no cover to remove.', 'لا توجد صورة غلاف لحذفها.') };

  const cleared = await me.db.rpc('set_teacher_cover_path', { p_cover_path: null, p_expected_path: current.path });
  if (cleared.error || cleared.data !== true) {
    const verified = await currentCoverPath(me.db, me.id);
    if (verified.error) return { error: message(locale, 'The removal result could not be confirmed. Please retry or contact support.', 'تعذر التحقق من نتيجة الإزالة. حاول مرة أخرى أو تواصل مع الدعم.') };
    if (verified.path === current.path) return { error: message(locale, 'Your cover could not be removed from the profile.', 'تعذر إزالة صورة الغلاف من الملف الشخصي.') };
  }

  const cleaned = await removeCoverObject(me.db, current.path);
  revalidateTeacherProfilePaths(locale, me.id);
  return { success: cleaned
    ? message(locale, 'Cover removed.', 'تم حذف صورة الغلاف.')
    : message(locale, 'Cover removed from your profile, but its file could not be cleaned up.', 'تمت إزالة صورة الغلاف من ملفك، لكن تعذر تنظيف الملف.') };
}
