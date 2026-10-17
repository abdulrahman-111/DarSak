'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { callDeletionEdge } from './edge';
import { isLocale } from '@/i18n/config';

const COOKIE_INTENT = 'dars-delete-intent';
const COOKIE_NONCE = 'dars-delete-nonce';
const COOKIE_OWNER = 'dars-delete-owner';
const COOKIE_GOOGLE_READY = 'dars-delete-google-ready';
function cookieOptions(expiresAt: string) {
  const maxAge = Math.max(0, Math.min(600, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge };
}
function localeMessage(locale: string, en: string, ar: string) { return locale === 'ar' ? ar : en; }
async function verifiedSession() {
  if (!isConfigured()) return null;
  const db = await createClient();
  const [{ data: verified, error: verifyError }, { data: sessionData }] = await Promise.all([db.auth.getUser(), db.auth.getSession()]);
  if (verifyError || !verified.user || !sessionData.session || sessionData.session.user.id !== verified.user.id) return null;
  return { db, user: verified.user, token: sessionData.session.access_token };
}
export type DeleteActionState = { error?: string; state?: 'pending' | 'completed' } | null;

export async function startGoogleDeletion(locale: string): Promise<never> {
  if (!isLocale(locale)) redirect('/en/login');
  const session = await verifiedSession();
  if (!session) redirect(`/${locale}/login`);
  const jar = await cookies();
  jar.delete(COOKIE_INTENT); jar.delete(COOKIE_NONCE); jar.delete(COOKIE_OWNER); jar.delete(COOKIE_GOOGLE_READY);
  const result = await callDeletionEdge<{ intent_id: string; nonce: string; expires_at: string }>(session.token, { operation: 'start_google_reauth' });
  if (!result.data || !result.data.intent_id || !result.data.nonce || !result.data.expires_at) redirect(`/${locale}/account/delete?error=unavailable`);
  const options = cookieOptions(result.data.expires_at);
  jar.set(COOKIE_INTENT, result.data.intent_id, options);
  jar.set(COOKIE_NONCE, result.data.nonce, options);
  jar.set(COOKIE_OWNER, session.user.id, options);
  const callback = new URL('/api/auth/callback', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
  callback.searchParams.set('next', `/${locale}/account/delete`);
  callback.searchParams.set('delete_intent', result.data.intent_id);
  const { data, error } = await session.db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback.toString(), queryParams: { prompt: 'select_account' } } });
  if (error || !data.url) { jar.delete(COOKIE_INTENT); jar.delete(COOKIE_NONCE); jar.delete(COOKIE_OWNER); jar.delete(COOKIE_GOOGLE_READY); redirect(`/${locale}/account/delete?error=unavailable`); }
  redirect(data.url);
}

export async function deleteAccount(locale: string, _previous: unknown, formData: FormData): Promise<DeleteActionState> {
  if (!isLocale(locale)) return { error: 'Invalid language.' };
  if (formData.get('confirmation') !== 'DELETE' || formData.get('acknowledged') !== 'on') return { error: localeMessage(locale, 'Type DELETE and confirm the warning.', 'اكتب DELETE وأكد قراءة التحذير.') };
  const session = await verifiedSession();
  if (!session) return { error: localeMessage(locale, 'Your session expired. Sign in and try again.', 'انتهت الجلسة. سجّل الدخول وحاول مرة أخرى.') };
  const jar = await cookies();
  const intentId = jar.get(COOKIE_INTENT)?.value;
  const nonce = jar.get(COOKIE_NONCE)?.value;
  const cookieOwner = jar.get(COOKIE_OWNER)?.value;
  const password = formData.get('password');
  const rawCaptcha = formData.get('cf-turnstile-response');
  const captchaToken = typeof rawCaptcha === 'string' && rawCaptcha.length <= 4096 ? rawCaptcha : undefined;
  const method = typeof password === 'string' && password.length ? 'password' : 'google';
  if (method === 'google' && (!intentId || !nonce || cookieOwner !== session.user.id)) return { error: localeMessage(locale, 'Verify with Google before continuing.', 'تحقق باستخدام Google قبل المتابعة.') };
  const result = await callDeletionEdge<{ state: 'pending' | 'completed'; request_id: string }>(session.token, {
    operation: 'delete', method, ...(method === 'password' ? { password, ...(captchaToken ? { captchaToken } : {}) } : { intent_id: intentId, nonce }), confirmation: 'DELETE', acknowledged: true,
  });
  if (result.data?.state === 'pending') {
    jar.delete(COOKIE_INTENT); jar.delete(COOKIE_NONCE); jar.delete(COOKIE_OWNER); jar.delete(COOKIE_GOOGLE_READY);
    return { state: 'pending' };
  }
  if (result.error || !result.data) {
    const code = result.error;
    return { error: (code === 'foreign_materials' || code === 'foreign_group_material')
      ? localeMessage(locale, 'Some materials you uploaded belong to another teacher’s group. Ask an administrator to transfer or remove them before deleting your account.', 'ترتبط بعض المواد التي حمّلتها بمجموعة لمعلم آخر. اطلب من المسؤول نقل هذه المواد أو حذفها قبل حذف حسابك.')
      : (code === 'last_admin' || code === 'last_active_admin') ? localeMessage(locale, 'The last active administrator account cannot be deleted.', 'لا يمكن حذف حساب آخر مسؤول نشط.')
      : (code === 'inactive' || code === 'inactive_owner') ? localeMessage(locale, 'This account is suspended. Contact an administrator for help.', 'هذا الحساب موقوف. تواصل مع المسؤول للمساعدة.')
      : (code === 'reauthentication_failed' || code === 'fresh_google_auth_required' || code === 'invalid_intent' || code === 'expired_intent') ? localeMessage(locale, 'Verification failed. Check your password or verify with Google again.', 'فشل التحقق. راجع كلمة المرور أو أعد التحقق باستخدام Google.')
      : code === 'confirmation_required' ? localeMessage(locale, 'Type DELETE and confirm the warning.', 'اكتب DELETE وأكد قراءة التحذير.')
      : localeMessage(locale, 'Deletion could not be confirmed. Your account may still be active; check the status and retry.', 'تعذر تأكيد الحذف. قد يظل حسابك نشطًا؛ تحقق من الحالة وحاول مجددًا.') };
  }
  jar.delete(COOKIE_INTENT); jar.delete(COOKIE_NONCE); jar.delete(COOKIE_OWNER); jar.delete(COOKIE_GOOGLE_READY);
  if (result.data.state === 'completed') {
    try { await session.db.auth.signOut({ scope: 'local' }); } catch { /* Auth deletion already completed; expire the browser session when possible. */ }
    redirect(`/${locale}/account/goodbye`);
  }
  return { state: 'pending' };
}


export async function retryAccountDeletion(locale: string): Promise<DeleteActionState> {
  if (!isLocale(locale)) return { error: 'Invalid language.' };
  const session = await verifiedSession();
  if (!session) return { error: localeMessage(locale, 'Your session expired. Sign in and try again.', 'انتهت الجلسة. سجّل الدخول وحاول مرة أخرى.') };
  const result = await callDeletionEdge<{ state: 'pending' | 'completed' }>(session.token, { operation: 'retry' });
  if (result.data?.state === 'pending') return { state: 'pending' };
  if (result.error || !result.data) return { error: localeMessage(locale, 'Cleanup is still pending. Please retry shortly.', 'لا تزال عملية التنظيف معلقة. أعد المحاولة بعد قليل.') };
  if (result.data.state === 'completed') {
    try { await session.db.auth.signOut({ scope: 'local' }); } catch { /* Auth deletion already completed; expire the browser session when possible. */ }
    redirect(`/${locale}/account/goodbye`);
  }
  return { state: 'pending' };
}
