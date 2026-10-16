import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { flushEmailOutbox } from '@/features/email/worker';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import { safeAuthNext } from '@/features/auth/return-path';
import { googleOnboardingDestination } from '@/features/auth/google-onboarding';

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
    if (!error && destination !== `/${locale}/reset-password`) {
      const googleRole = params.get('google_role');
      if (params.has('google_role') && googleRole !== 'student' && googleRole !== 'teacher') setupError = true;
      else if (googleRole === 'student' || googleRole === 'teacher') {
        const { data: verified, error: verifyError } = await db.auth.getUser();
        if (verifyError || !verified.user?.identities?.some(identity => identity.provider === 'google')) setupError = true;
        else {
          const completion = await db.rpc('complete_google_signup', { p_role: googleRole });
          const completedRole = completion.data;
          setupError = !!completion.error || !['student', 'teacher', 'admin'].includes(completedRole);
          if (!setupError && completedRole === 'teacher') after(async()=>{try{await flushEmailOutbox(1);}catch{/* Transactional outbox recovery handles delivery. */}});
          if (!setupError && completedRole !== googleRole) {
            const mismatch = new URL(`/${locale}/login?error=role-mismatch`, request.nextUrl.origin);
            if (completedRole === 'student' || completedRole === 'teacher' || completedRole === 'admin') mismatch.searchParams.set('actual', completedRole);
            mismatch.searchParams.set('requested', googleRole);
            const response = NextResponse.redirect(mismatch);
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          }
          if (!setupError && (completedRole === 'student' || completedRole === 'teacher')) {
            const target = await googleOnboardingDestination(db, verified.user.id, completedRole, locale, destination);
            const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          }
        }
      } else {
        const { data: authData, error: authError } = await db.auth.getUser();
        const user = authData.user;
        if (!authError && user?.identities?.some(identity => identity.provider === 'google')) {
          const { data: profile, error: profileError } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
          if (profileError) setupError = true;
          else if (!profile) {
            const response = NextResponse.redirect(new URL(`/${locale}/choose-role`, request.nextUrl.origin));
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          } else if (profile.status === 'active' && (profile.role === 'student' || profile.role === 'teacher')) {
            const target = await googleOnboardingDestination(db, user.id, profile.role, locale, destination);
            const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          }
        }
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
