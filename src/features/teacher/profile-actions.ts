'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { avatarPathIsCurrent, profileFieldErrors, storageRemovalConfirmed, teacherAvatarExtension, teacherAvatarPath, teacherProfileSchema, teacherSpecializationPairSchema } from './profile-domain';

export type TeacherProfileActionState = { error?: string; success?: string; fieldErrors?: Record<string, string> } | null;
export type TeacherSpecializationActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  row?: { id: string; owner_teacher_id: string | null; archived_at: string | null; node_id: string; subject_id: string };
} | null;
const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

async function activeTeacher() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (error || profile?.role !== 'teacher' || profile.status !== 'active') return null;
  return { db, id: user.id };
}

export async function addTeacherSpecialization(locale: Locale, _state: TeacherSpecializationActionState, form: FormData): Promise<TeacherSpecializationActionState> {
  const parsed = teacherSpecializationPairSchema.safeParse({ subject_id: form.get('subject_id'), category_id: form.get('category_id') });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= 'invalid';
    return { error: message(locale, 'Choose a subject and category.', 'اختر مادة وفئة.'), fieldErrors };
  }

  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  const { data: id, error } = await me.db.rpc('save_teacher_offering', {
    p_subject_id: parsed.data.subject_id,
    p_category_id: parsed.data.category_id,
  });
  if (error || typeof id !== 'string') {
    const detail = error?.message.toLowerCase() ?? '';
    if (detail.includes('restore the archived specialization')) return { error: message(locale,
      'This specialization is archived. Restore it in your catalogue before adding it again.',
      'هذا التخصص مؤرشف. أعده من الدليل التعليمي قبل إضافته مرة أخرى.') };
    if (detail.includes('active shared or owned') || detail.includes('not selectable')) return { error: message(locale,
      'This subject or category is unavailable. Choose an active shared or personal item.',
      'هذه المادة أو الفئة غير متاحة. اختر عنصراً نشطاً مشتركاً أو خاصاً بك.') };
    return { error: message(locale, 'Could not add this specialization. Refresh and try again.', 'تعذرت إضافة هذا التخصص. حدّث الصفحة وحاول مرة أخرى.') };
  }
  const { data: offering, error: offeringError } = await me.db.from('offerings')
    .select('id,owner_teacher_id,archived_at,node_id,subject_id')
    .eq('id', id)
    .maybeSingle();
  if (offeringError || !offering || offering.id !== id || offering.subject_id !== parsed.data.subject_id || offering.node_id !== parsed.data.category_id || offering.archived_at !== null || (offering.owner_teacher_id !== null && offering.owner_teacher_id !== me.id)) {
    return { error: message(locale, 'This specialization is no longer available. Refresh and choose another.', 'لم يعد هذا التخصص متاحاً. حدّث الصفحة واختر غيره.') };
  }
  return {
    id,
    row: offering,
    success: message(locale, 'Specialization added to your profile draft.', 'أُضيف التخصص إلى مسودة ملفك الشخصي.'),
  };
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
