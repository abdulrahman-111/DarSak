import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { flushEmailOutbox } from '@/features/email/worker';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import { safeAuthNext } from '@/features/auth/return-path';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];
export const maxDuration = 40;

/** Finish PKCE / email-link auth, then send the user to a sanitized `next` path. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = params.get('next');
  // `next` is already locale-prefixed; its prefix also picks the failure locale.
  const nextLocale = next?.split('/')[1];
  const locale: Locale = nextLocale && isLocale(nextLocale) ? nextLocale : defaultLocale;
  const destination = safeAuthNext(next, locale);
  const failure = new URL(`/${locale}/login?error=link`, request.nextUrl.origin);

  if (!isConfigured()) return NextResponse.redirect(failure);
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const db = await createClient();

  let error: unknown = new Error('Missing auth parameters');
  let setupError = false;
  if (code) {
    ({ error } = await db.auth.exchangeCodeForSession(code));
    if (!error && params.has('google_role')) {
      const googleRole = params.get('google_role');
      if (googleRole !== 'student' && googleRole !== 'teacher') {
        setupError = true;
      } else {
        const completion = await db.rpc('complete_google_signup', { p_role: googleRole });
        setupError = !!completion.error;
        if (!setupError && completion.data === 'teacher') after(async()=>{try{await flushEmailOutbox(1);}catch{/* Transactional outbox recovery handles delivery. */}});
      }
    }
  }
  else if (tokenHash && type && OTP_TYPES.includes(type)) ({ error } = await db.auth.verifyOtp({ type, token_hash: tokenHash }));

  const setupFailure = new URL(`/${locale}/login?error=setup`, request.nextUrl.origin);
  if (setupError) {
    const googleRole = params.get('google_role');
    if (googleRole === 'student' || googleRole === 'teacher') setupFailure.searchParams.set('google_role', googleRole);
  }
  const response = NextResponse.redirect(error ? failure : setupError ? setupFailure : new URL(destination, request.nextUrl.origin));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
