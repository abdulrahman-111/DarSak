'use server';
import { redirect } from 'next/navigation';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { loginSchema, signupSchema } from '@/lib/domain';
import { isLocale } from '@/i18n/config';
import { loginRedirectPath } from './return-path';

function configurationError(locale: string) {
  if (!isLocale(locale)) return 'Invalid language';
  if (!isConfigured()) return locale === 'ar' ? 'الخدمة غير متاحة حاليًا. يرجى المحاولة لاحقًا.' : 'The service is not available. Please try again later.';
  return null;
}
export async function loginAction(locale: string, _previous: unknown, formData: FormData) {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: locale === 'ar' ? 'أدخل بريدًا إلكترونيًا وكلمة مرور صالحين.' : 'Enter a valid email and password.' };
  const db = await createClient();
  const { data, error } = await db.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: locale === 'ar' ? 'تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.' : 'Unable to sign in. Check your credentials and try again.' };
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', data.user.id).maybeSingle();
  redirect(loginRedirectPath(locale as 'ar' | 'en', formData.get('next'), profile));
}
export async function signupAction(locale: string, _previous: unknown, formData: FormData) {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: locale === 'ar' ? 'تحقق من الاسم والبريد الإلكتروني وكلمة المرور (٨ أحرف على الأقل).' : 'Check your name, email and password (at least 8 characters).' };
  const db = await createClient();
  const { data, error } = await db.auth.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName, requested_role: parsed.data.role } },
  });
  if (error) return { error: locale === 'ar' ? 'تعذر إنشاء الحساب. يرجى المحاولة مرة أخرى.' : 'Unable to create an account. Please try again.' };
  // Email confirmation is disabled for this pilot; handle provider settings changing safely.
  if (!data.session) return { error: locale === 'ar' ? 'تواصل مع الإدارة لتفعيل حسابك.' : 'Contact the administrator to activate your account.' };
  redirect(`/${locale}/dashboard`);
}
export async function logoutAction() {
  if (isConfigured()) {
    const db = await createClient();
    const { error } = await db.auth.signOut();
    if (error) throw new Error('Unable to sign out. Please try again.');
  }
  redirect('/');
}
