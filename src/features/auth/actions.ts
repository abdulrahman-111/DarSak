'use server';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { flushEmailOutbox } from '@/features/email/worker';
import { createClient, getVerifiedUser, isConfigured } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/config';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from '@/lib/domain';
import { isLocale, type Locale } from '@/i18n/config';
import { authErrorMessage } from './errors';
import { loginRedirectPath, safeAuthNext } from './return-path';
import { authCopy } from '@/components/auth/copy';
import { googleOnboardingDestination } from './google-onboarding';

/** Non-secret fields echoed back on error so the reset form can repopulate them. Passwords are never included. */
export type AuthState = {
  error?: string;
  notice?: string;
  resendHref?: string;
  email?: string;
  fullName?: string;
  role?: 'student' | 'teacher';
} | null;

function textField(formData: FormData, name: string, max: number) {
  const value = formData.get(name);
  return typeof value === 'string' && value.length <= max ? value.trim() : undefined;
}
/** Submitted email only (login, forgot, resend). */
function emailEcho(formData: FormData): Pick<NonNullable<AuthState>, 'email'> {
  const email = textField(formData, 'email', 254);
  return email ? { email } : {};
}
/** Submitted email, name and role (signup). */
function signupEcho(formData: FormData): Pick<NonNullable<AuthState>, 'email' | 'fullName' | 'role'> {
  const fullName = textField(formData, 'fullName', 100);
  const role = formData.get('role');
  return {
    ...emailEcho(formData),
    ...(fullName && { fullName }),
    ...((role === 'student' || role === 'teacher') && { role }),
  };
}

function configurationError(locale: string) {
  if (!isLocale(locale)) return 'Invalid language';
  if (!isConfigured()) return locale === 'ar' ? 'الخدمة غير متاحة حاليًا. يرجى المحاولة لاحقًا.' : 'The service is not available. Please try again later.';
  return null;
}
/** Turnstile token posted by the widget; absent when captcha is not configured. */
function captchaOptions(formData: FormData) {
  const token = formData.get('cf-turnstile-response');
  return typeof token === 'string' && token ? { captchaToken: token } : {};
}
function callbackUrl(path: string) {
  return `${siteUrl()}/api/auth/callback?next=${path}`;
}
const NEUTRAL_ERRORS = new Set(['over_email_send_rate_limit', 'over_request_rate_limit', 'captcha_failed']);
// Safe to show: says nothing about whether an account exists.
const SURFACED_EMAIL_ERRORS = new Set([...NEUTRAL_ERRORS, 'email_address_invalid']);
const IDENTITY_DEPENDENT_EMAIL_ERRORS = new Set(['user_not_found', 'email_not_confirmed', 'user_already_exists', 'email_exists']);

export async function loginAction(locale: string, _previous: unknown, formData: FormData): Promise<AuthState> {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: locale === 'ar' ? 'أدخل بريدًا إلكترونيًا وكلمة مرور صالحين.' : 'Enter a valid email and password.', ...emailEcho(formData) };
  const db = await createClient();
  const { data, error } = await db.auth.signInWithPassword({ ...parsed.data, options: captchaOptions(formData) });
  if (error || !data.user) {
    const unconfirmed = error?.code === 'email_not_confirmed';
    return {
      error: authErrorMessage(locale, error?.code, 'login'),
      ...emailEcho(formData),
      ...(unconfirmed && { resendHref: `/${locale}/check-email?email=${encodeURIComponent(parsed.data.email)}` }),
    };
  }
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', data.user.id).maybeSingle();
  redirect(loginRedirectPath(locale as Locale, formData.get('next'), profile));
}
export async function signupAction(locale: string, _previous: unknown, formData: FormData): Promise<AuthState> {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: locale === 'ar' ? 'تحقق من الاسم والبريد الإلكتروني وكلمة المرور (٨ أحرف على الأقل).' : 'Check your name, email and password (at least 8 characters).', ...signupEcho(formData) };
  const db = await createClient();
  const { data, error } = await db.auth.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, requested_role: parsed.data.role },
      emailRedirectTo: callbackUrl(`/${locale}/dashboard`),
      ...captchaOptions(formData),
    },
  });
  if (error) return { error: authErrorMessage(locale, error.code, 'signup'), ...signupEcho(formData) };
  if (parsed.data.role === 'teacher' && data.user) after(async()=>{try{await flushEmailOutbox(1);}catch{/* Transactional outbox recovery handles delivery. */}});
  // Email confirmation is on: no session until the link is opened.
  if (!data.session) redirect(`/${locale}/check-email?email=${encodeURIComponent(parsed.data.email)}`);
  redirect(`/${locale}/dashboard`);
}
export async function googleSignInAction(locale: string, _previous: unknown, formData: FormData): Promise<AuthState> {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== 'true') return { error: authErrorMessage(locale, undefined, 'login') };
  const requestedRole = formData.get('google_role');
  if (requestedRole !== null && requestedRole !== 'student' && requestedRole !== 'teacher') {
    return { error: authCopy[locale as Locale].googleRoleInvalid };
  }
  const next = safeAuthNext(formData.get('next'), locale as Locale);
  const db = await createClient();
  const redirectTo = callbackUrl(next);
  const { data, error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: requestedRole ? `${redirectTo}&google_role=${requestedRole}` : redirectTo } });
  if (error || !data.url) return { error: authErrorMessage(locale, error?.code, 'login') };
  redirect(data.url);
}
export async function chooseGoogleRoleAction(locale: string, formData: FormData): Promise<never> {
  if (!isLocale(locale)) redirect('/en/login');
  const requestedRole = formData.get('google_role');
  if (requestedRole !== 'student' && requestedRole !== 'teacher') redirect(`/${locale}/login?error=setup`);
  const db = await createClient();
  const { data: authData, error: authError } = await db.auth.getUser();
  const user = authData.user;
  if (authError || !user || !user.identities?.some(identity => identity.provider === 'google')) redirect(`/${locale}/login`);
  const { data: profile, error: profileError } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profileError) redirect(`/${locale}/login?error=setup`);
  if (profile) {
    if (profile.status === 'active' && (profile.role === 'student' || profile.role === 'teacher')) {
      const target = await googleOnboardingDestination(db, user.id, profile.role, locale, loginRedirectPath(locale, null, profile));
      redirect(target);
    }
    redirect(loginRedirectPath(locale, null, profile));
  }
  const { data: completedRole, error: completionError } = await db.rpc('complete_google_signup', { p_role: requestedRole });
  if (completionError || !['student', 'teacher', 'admin'].includes(completedRole)) redirect(`/${locale}/login?error=setup&google_role=${requestedRole}`);
  if (completedRole === 'teacher') after(async()=>{try{await flushEmailOutbox(1);}catch{/* Transactional outbox recovery handles delivery. */}});
  if (completedRole !== requestedRole) redirect(`/${locale}/login?error=role-mismatch&requested=${requestedRole}&actual=${completedRole}`);
  if (completedRole !== 'student' && completedRole !== 'teacher') redirect(`/${locale}/login?error=setup&google_role=${requestedRole}`);
  const target = await googleOnboardingDestination(db, user.id, completedRole, locale, `/${locale}/${completedRole}`);
  redirect(target);
}
export async function forgotPasswordAction(locale: string, _previous: unknown, formData: FormData): Promise<AuthState> {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: locale === 'ar' ? 'أدخل بريدًا إلكترونيًا صالحًا.' : 'Enter a valid email address.', ...emailEcho(formData) };
  const db = await createClient();
  const { error } = await db.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl(`/${locale}/reset-password`),
    ...captchaOptions(formData),
  });
  if (error?.code && SURFACED_EMAIL_ERRORS.has(error.code)) return { error: authErrorMessage(locale, error.code, 'reset'), ...emailEcho(formData) };
  if (error && !IDENTITY_DEPENDENT_EMAIL_ERRORS.has(error.code ?? '')) return { error: authCopy[locale as Locale].emailDeliveryFailure, ...emailEcho(formData) };
  // Always neutral so the response never reveals whether an account exists.
  return { notice: locale === 'ar' ? 'إذا كان هناك حساب بهذا البريد، فقد قُبل طلب رابط إعادة التعيين. تحقق من بريدك، بما في ذلك مجلد الرسائل غير المرغوب فيها.' : 'If an account exists for this email, the reset-link request was accepted. Check your inbox, including spam.' };
}
export async function resetPasswordAction(locale: string, _previous: unknown, formData: FormData): Promise<AuthState> {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const user = await getVerifiedUser();
  if (!user) redirect(`/${locale}/forgot-password`);
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some(issue => issue.path[0] === 'confirmPassword');
    return { error: mismatch
      ? (locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'The passwords do not match.')
      : (locale === 'ar' ? 'يجب أن تتراوح كلمة المرور بين ٨ و٧٢ حرفًا.' : 'Use a password of 8 to 72 characters.') };
  }
  const db = await createClient();
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authErrorMessage(locale, error.code, 'update') };
  redirect(`/${locale}/dashboard`);
}
export async function resendConfirmationAction(locale: string, _previous: unknown, formData: FormData): Promise<AuthState> {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: locale === 'ar' ? 'أدخل بريدًا إلكترونيًا صالحًا.' : 'Enter a valid email address.', ...emailEcho(formData) };
  const db = await createClient();
  const { error } = await db.auth.resend({
    type: 'signup', email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(`/${locale}/dashboard`), ...captchaOptions(formData) },
  });
  if (error?.code && SURFACED_EMAIL_ERRORS.has(error.code)) return { error: authErrorMessage(locale, error.code, 'signup'), ...emailEcho(formData) };
  if (error && !IDENTITY_DEPENDENT_EMAIL_ERRORS.has(error.code ?? '')) return { error: authCopy[locale as Locale].emailDeliveryFailure, ...emailEcho(formData) };
  return { notice: locale === 'ar' ? 'إذا كان هناك حساب بهذا البريد بانتظار التأكيد، فقد قُبل طلب رسالة جديدة.' : 'If an account is waiting for confirmation, the request for a new email was accepted.' };
}
/** Verify a signup OTP specifically; the generic email type can also accept recovery codes. */
export async function verifySignupCodeAction(locale: string, _previous: unknown, formData: FormData): Promise<AuthState> {
  const unavailable = configurationError(locale);
  if (unavailable) return { error: unavailable };
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  const token = textField(formData, 'token', 6);
  if (!parsed.success || !token || !/^\d{6}$/.test(token)) {
    return { error: authCopy[locale as Locale].codeInvalid, ...emailEcho(formData) };
  }
  const db = await createClient();
  const { data, error } = await db.auth.verifyOtp({ email: parsed.data.email, token, type: 'signup' });
  // Keep invalid, expired, and mismatched codes indistinguishable.
  if (error?.code && SURFACED_EMAIL_ERRORS.has(error.code)) return { error: authErrorMessage(locale, error.code, 'signup'), ...emailEcho(formData) };
  if (error || !data.session || !data.user) return { error: authCopy[locale as Locale].codeInvalid, ...emailEcho(formData) };
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', data.user.id).maybeSingle();
  redirect(loginRedirectPath(locale as Locale, null, profile));
}
export async function logoutAction() {
  if (isConfigured()) {
    const db = await createClient();
    const { error } = await db.auth.signOut();
    if (error) throw new Error('Unable to sign out. Please try again.');
  }
  redirect('/');
}
