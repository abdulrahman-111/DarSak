'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { profileFieldErrors, teacherProfileSchema } from './profile-domain';

export type TeacherProfileActionState = { error?: string; success?: string; fieldErrors?: Record<string, string> } | null;
const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

export async function saveTeacherProfile(locale: Locale, _state: TeacherProfileActionState, form: FormData): Promise<TeacherProfileActionState> {
  const parsed = teacherProfileSchema.safeParse({
    full_name: form.get('full_name'),
    headline: form.get('headline'),
    bio: form.get('bio'),
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

  const { error } = await db.rpc('save_teacher_profile', {
    p_full_name: parsed.data.full_name,
    p_headline: parsed.data.headline,
    p_bio: parsed.data.bio,
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
