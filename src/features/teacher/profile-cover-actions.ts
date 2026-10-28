'use server';

import { revalidatePath } from 'next/cache';
import { invalidatePublicDiscovery } from '@/features/platform/discovery-cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import type { TeacherProfileActionState } from './profile-actions';
import { storageRemovalConfirmed } from './profile-domain';

const message = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);

async function activeTeacher() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();
  if (error || profile?.role !== 'teacher' || profile.status !== 'active') return null;
  return { db, id: user.id };
}

function revalidateTeacherProfilePaths(locale: Locale, teacherId: string) {
  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/account/profile`);
    revalidatePath(`/${currentLocale}/teacher`);
    revalidatePath(`/${currentLocale}/teachers`);
    revalidatePath(`/${currentLocale}/teachers/${teacherId}`);
  }
  revalidatePath('/[locale]/teachers/[id]', 'page');
  invalidatePublicDiscovery();
}

async function removeCoverObject(db: Awaited<ReturnType<typeof createClient>>, path: string) {
  const removed = await db.storage.from('teacher-avatars').remove([path]);
  return storageRemovalConfirmed(path, removed.data, removed.error);
}

async function currentCoverPath(db: Awaited<ReturnType<typeof createClient>>, teacherId: string) {
  const current = await db
    .from('teacher_profiles')
    .select('cover_path')
    .eq('id', teacherId)
    .maybeSingle();
  return current.error || !current.data
    ? { error: true as const }
    : { error: false as const, path: current.data.cover_path as string | null };
}

export async function uploadTeacherCover(
  locale: Locale,
  _state: TeacherProfileActionState,
  _form: FormData,
): Promise<TeacherProfileActionState> {
  return {
    error: message(
      locale,
      'Cover uploads are unavailable at launch. Your existing cover remains visible.',
      'رفع صور الغلاف غير متاح عند الإطلاق. ستظل صورة الغلاف الحالية ظاهرة.',
    ),
  };
}

export async function removeTeacherCover(
  locale: Locale,
  _state: TeacherProfileActionState,
  _form: FormData,
): Promise<TeacherProfileActionState> {
  const me = await activeTeacher();
  if (!me)
    return {
      error: message(
        locale,
        'An active teacher account is required to change your cover.',
        'يلزم حساب معلم نشط لتغيير صورة الغلاف.',
      ),
    };
  const current = await currentCoverPath(me.db, me.id);
  if (current.error)
    return {
      error: message(
        locale,
        'Could not load your current cover. Please try again.',
        'تعذر تحميل صورة الغلاف الحالية. حاول مرة أخرى.',
      ),
    };
  if (!current.path)
    return {
      success: message(locale, 'There is no cover to remove.', 'لا توجد صورة غلاف لحذفها.'),
    };

  const cleared = await me.db.rpc('set_teacher_cover_path', {
    p_cover_path: null,
    p_expected_path: current.path,
  });
  let replacedByNewerCover = false;
  if (cleared.error || cleared.data !== true) {
    const verified = await currentCoverPath(me.db, me.id);
    if (verified.error)
      return {
        error: message(
          locale,
          'The removal result could not be confirmed. Please retry or contact support.',
          'تعذر التحقق من نتيجة الإزالة. حاول مرة أخرى أو تواصل مع الدعم.',
        ),
      };
    if (verified.path === current.path)
      return {
        error: message(
          locale,
          'Your cover could not be removed from the profile.',
          'تعذر إزالة صورة الغلاف من الملف الشخصي.',
        ),
      };
    replacedByNewerCover = verified.path !== null;
  }

  const cleaned = await removeCoverObject(me.db, current.path);
  revalidateTeacherProfilePaths(locale, me.id);
  if (replacedByNewerCover)
    return {
      error: cleaned
        ? message(
            locale,
            'Your cover changed during removal. The newer cover was kept.',
            'تغيرت صورة الغلاف أثناء الإزالة. تم الاحتفاظ بالصورة الأحدث.',
          )
        : message(
            locale,
            'Your cover changed during removal. The newer cover was kept, but the previous file could not be cleaned up.',
            'تغيرت صورة الغلاف أثناء الإزالة. تم الاحتفاظ بالصورة الأحدث، لكن تعذر تنظيف الملف السابق.',
          ),
    };
  return cleaned
    ? { success: message(locale, 'Cover removed.', 'تم حذف صورة الغلاف.') }
    : {
        error: message(
          locale,
          'The cover was removed from your profile, but its file could not be cleaned up. Please contact support.',
          'تمت إزالة صورة الغلاف من ملفك، لكن تعذر تنظيف الملف. تواصل مع الدعم.',
        ),
      };
}
