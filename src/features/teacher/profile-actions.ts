'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { avatarPathIsCurrent, profileFieldErrors, storageRemovalConfirmed, teacherAvatarExtension, teacherAvatarPath, teacherProfileSchema } from './profile-domain';

export type TeacherProfileActionState = { error?: string; success?: string; fieldErrors?: Record<string, string> } | null;
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

export async function uploadTeacherAvatar(locale: Locale, _state: TeacherProfileActionState, form: FormData): Promise<TeacherProfileActionState> {
  const file = form.get('avatar');
  const extension = file instanceof File ? teacherAvatarExtension(file) : null;
  if (!(file instanceof File) || !extension) return {
    error: message(locale, 'Choose a JPEG, PNG, or WebP image up to 2 MB.', 'اختر صورة JPEG أو PNG أو WebP بحجم لا يتجاوز ٢ ميجابايت.'),
    fieldErrors: { avatar: 'invalid' },
  };

  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required to change your photo.', 'يلزم حساب معلم نشط لتغيير الصورة.') };
  const { data: teacher, error: teacherError } = await me.db.from('teacher_profiles').select('avatar_path').eq('id', me.id).maybeSingle();
  if (teacherError) return { error: message(locale, 'Could not load your current photo. Please try again.', 'تعذر تحميل الصورة الحالية. حاول مرة أخرى.') };
  if (!teacher) return { error: message(locale, 'Teacher profile was not found.', 'ملف المعلم غير موجود.') };

  const path = teacherAvatarPath(me.id, randomUUID(), file.type);
  const uploaded = await me.db.storage.from('teacher-avatars').upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) return { error: message(locale, 'Photo upload failed. Please try again.', 'تعذر رفع الصورة. حاول مرة أخرى.') };

  const saved = await me.db.from('teacher_profiles').update({ avatar_path: path }).eq('id', me.id).select('id').maybeSingle();
  let avatarSaved = !saved.error && !!saved.data;
  if (!avatarSaved) {
    const verified = await me.db.from('teacher_profiles').select('avatar_path').eq('id', me.id).maybeSingle();
    if (verified.error || !verified.data) {
      return { error: message(locale, 'The save result could not be confirmed. The uploaded file remains private; please retry or contact support.', 'تعذر التحقق من نتيجة الحفظ. بقي الملف المرفوع خاصاً؛ حاول مرة أخرى أو تواصل مع الدعم.') };
    }
    avatarSaved = avatarPathIsCurrent(path, verified.data.avatar_path);
  }
  if (!avatarSaved) {
    const cleanup = await me.db.storage.from('teacher-avatars').remove([path]);
    return { error: !storageRemovalConfirmed(path, cleanup.data, cleanup.error)
      ? message(locale, 'The photo could not be saved or cleaned up. Please contact support.', 'تعذر حفظ الصورة أو تنظيف الملف المرفوع. تواصل مع الدعم.')
      : message(locale, 'The photo could not be saved. Your previous photo is unchanged.', 'تعذر حفظ الصورة. لم تتغير صورتك السابقة.') };
  }

  let oldPhotoCleanupFailed = false;
  if (teacher.avatar_path && teacher.avatar_path !== path) {
    const removed = await me.db.storage.from('teacher-avatars').remove([teacher.avatar_path]);
    oldPhotoCleanupFailed = !storageRemovalConfirmed(teacher.avatar_path, removed.data, removed.error);
  }
  revalidateTeacherProfilePaths(locale, me.id);
  return { success: oldPhotoCleanupFailed
    ? message(locale, 'Photo updated. The previous file could not be cleaned up.', 'تم تحديث الصورة. تعذر تنظيف الملف السابق.')
    : message(locale, 'Photo updated.', 'تم تحديث الصورة.') };
}

export async function removeTeacherAvatar(locale: Locale, _state: TeacherProfileActionState, _form: FormData): Promise<TeacherProfileActionState> {
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required to change your photo.', 'يلزم حساب معلم نشط لتغيير الصورة.') };
  const { data: teacher, error: teacherError } = await me.db.from('teacher_profiles').select('avatar_path').eq('id', me.id).maybeSingle();
  if (teacherError) return { error: message(locale, 'Could not load your current photo. Please try again.', 'تعذر تحميل الصورة الحالية. حاول مرة أخرى.') };
  if (!teacher) return { error: message(locale, 'Teacher profile was not found.', 'ملف المعلم غير موجود.') };
  if (!teacher.avatar_path) return { success: message(locale, 'There is no photo to remove.', 'لا توجد صورة لحذفها.') };

  const cleared = await me.db.from('teacher_profiles').update({ avatar_path: null }).eq('id', me.id).select('id').maybeSingle();
  if (cleared.error || !cleared.data) {
    const verified = await me.db.from('teacher_profiles').select('avatar_path').eq('id', me.id).maybeSingle();
    if (verified.error || !verified.data) return { error: message(locale, 'The removal result could not be confirmed. Please retry or contact support.', 'تعذر التحقق من نتيجة الإزالة. حاول مرة أخرى أو تواصل مع الدعم.') };
    if (avatarPathIsCurrent(teacher.avatar_path, verified.data.avatar_path)) return { error: message(locale, 'Your photo could not be removed from the profile.', 'تعذر إزالة الصورة من الملف الشخصي.') };
  }
  const removed = await me.db.storage.from('teacher-avatars').remove([teacher.avatar_path]);
  revalidateTeacherProfilePaths(locale, me.id);
  return { success: !storageRemovalConfirmed(teacher.avatar_path, removed.data, removed.error)
    ? message(locale, 'Photo removed from your profile, but its file could not be cleaned up.', 'تمت إزالة الصورة من ملفك، لكن تعذر تنظيف الملف.')
    : message(locale, 'Photo removed.', 'تم حذف الصورة.') };
}

export async function saveTeacherProfile(locale: Locale, _state: TeacherProfileActionState, form: FormData): Promise<TeacherProfileActionState> {
  const accountSchema = teacherProfileSchema.omit({ bio: true });
  const parsed = accountSchema.safeParse({
    full_name: form.get('full_name'),
    headline: form.get('headline'),
    offering_ids: form.getAll('offering_ids'),
    phone_number: form.get('phone_number') ?? '',
    whatsapp_number: form.get('whatsapp_number') ?? '',
    contact_email: form.get('contact_email') ?? '',
    visibility: form.get('visibility') || 'enrolled',
  });
  if (!parsed.success) return {
    error: message(locale, 'Please check the highlighted fields.', 'يرجى مراجعة الحقول المحددة.'),
    fieldErrors: profileFieldErrors(parsed.error),
  };

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: message(locale, 'Sign in as an active teacher to edit your profile.', 'سجل الدخول بحساب معلم نشط لتعديل ملفك الشخصي.') };
  const { data: profile, error: profileError } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profileError) return { error: message(locale, 'Could not verify your teacher account. Please try again.', 'تعذر التحقق من حساب المعلم. حاول مرة أخرى.') };
  if (profile?.role !== 'teacher' || profile.status !== 'active') return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };

  const { error } = await db.rpc('save_teacher_profile_account', {
    p_full_name: parsed.data.full_name,
    p_headline: parsed.data.headline,
    p_offering_ids: parsed.data.offering_ids,
    p_phone_number: parsed.data.phone_number,
    p_whatsapp_number: parsed.data.whatsapp_number,
    p_contact_email: parsed.data.contact_email,
    p_visibility: parsed.data.visibility,
  });
  if (error) return { error: message(locale, 'Your profile could not be saved. Your changes are still in the form; please try again.', 'تعذر حفظ الملف الشخصي. ستبقى تغييراتك في النموذج؛ حاول مرة أخرى.') };

  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/profile`);
    revalidatePath(`/${currentLocale}/teacher`);
    revalidatePath(`/${currentLocale}/teachers`);
  }
  revalidatePath('/[locale]/teachers/[id]', 'page');
  return { success: message(locale, 'Profile saved.', 'تم حفظ الملف الشخصي.') };
}
