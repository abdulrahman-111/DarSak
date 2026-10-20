export type AuthErrorContext = 'login' | 'signup' | 'reset' | 'update';

const en = {
  invalid_credentials: 'Unable to sign in. Check your credentials and try again.',
  email_not_confirmed:
    'Your email is not verified yet. Check your inbox for the verification code, or request a new one.',
  user_already_exists: 'This email is already registered. Sign in or reset your password.',
  weak_password: 'This password is too weak. Use at least 8 characters that are hard to guess.',
  rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  captcha_failed: 'Security check failed. Please try again.',
  same_password: 'Choose a password different from your current one.',
  signup_disabled: 'New sign-ups are currently disabled.',
  email_address_invalid: "This email address can't be used. Please use a different email.",
  login: 'Unable to sign in. Check your credentials and try again.',
  signup: 'Unable to create an account. Please try again.',
  reset: 'Unable to send the reset link. Please try again.',
  update: 'Unable to update your password. Please try again.',
};
const ar: typeof en = {
  invalid_credentials: 'تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.',
  email_not_confirmed:
    'لم يتم التحقق من بريدك الإلكتروني بعد. أدخل رمز التحقق من رسالتك، أو اطلب رمزًا جديدًا.',
  user_already_exists: 'هذا البريد الإلكتروني مسجّل بالفعل. سجّل الدخول أو أعد تعيين كلمة المرور.',
  weak_password: 'كلمة المرور ضعيفة. استخدم ٨ أحرف على الأقل يصعب تخمينها.',
  rate_limit: 'محاولات كثيرة. يرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى.',
  captcha_failed: 'فشل التحقق الأمني. يرجى المحاولة مرة أخرى.',
  same_password: 'اختر كلمة مرور مختلفة عن كلمة المرور الحالية.',
  signup_disabled: 'التسجيل الجديد متوقف حاليًا.',
  email_address_invalid:
    'لا يمكن استخدام عنوان البريد الإلكتروني هذا. يرجى استخدام بريد إلكتروني آخر.',
  login: 'تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.',
  signup: 'تعذر إنشاء الحساب. يرجى المحاولة مرة أخرى.',
  reset: 'تعذر إرسال رابط إعادة التعيين. يرجى المحاولة مرة أخرى.',
  update: 'تعذر تحديث كلمة المرور. يرجى المحاولة مرة أخرى.',
};
const copy = { en, ar };

const codeKey: Record<string, keyof typeof en> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'user_already_exists',
  email_exists: 'user_already_exists',
  weak_password: 'weak_password',
  over_email_send_rate_limit: 'rate_limit',
  over_request_rate_limit: 'rate_limit',
  captcha_failed: 'captcha_failed',
  same_password: 'same_password',
  signup_disabled: 'signup_disabled',
  email_address_invalid: 'email_address_invalid',
};

/** Map a Supabase AuthError.code to bilingual copy; unknown codes get the context's generic message. */
export function authErrorMessage(
  locale: string,
  code: string | undefined,
  context: AuthErrorContext,
): string {
  const strings = locale === 'ar' ? copy.ar : copy.en;
  const key = code ? codeKey[code] : undefined;
  return strings[key ?? context];
}
