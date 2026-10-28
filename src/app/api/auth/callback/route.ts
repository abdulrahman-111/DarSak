import { observeOperation } from '@/features/monitoring/server';
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { flushEmailOutbox } from '@/features/email/worker';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import { safeAuthNext } from '@/features/auth/return-path';
import { resolveSetupDestination } from '@/features/setup/destination';
import { callDeletionEdge } from '@/features/account/edge';
import { googleReauthHint } from '@/features/account/google-hint';
import {
  issueRecoveryProof,
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_TTL_SECONDS,
} from '@/features/auth/recovery-proof';

export const maxDuration = 40;

/** Finish PKCE auth, then send the user to a sanitized `next` path. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = params.get('next');
  // `next` is already locale-prefixed; its prefix also picks the failure locale.
  const nextLocale = next?.split('/')[1];
  const locale: Locale = nextLocale && isLocale(nextLocale) ? nextLocale : defaultLocale;
  const destination = safeAuthNext(next, locale);
  const failure = new URL(`/${locale}/login?error=link`, request.nextUrl.origin);

  // Legacy `token_hash` links are not bound to the requesting browser (login CSRF),
  // so they never create a session or recovery proof. Only PKCE `code` flows do.
  if (!isConfigured() || params.has('token_hash')) {
    const response = NextResponse.redirect(failure);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const code = params.get('code');
  const db = await createClient();
  let preverifiedUser: User | null = null;

  let error: unknown = new Error('Missing auth parameters');
  let recoveryFlow = false;
  let setupError = false;
  let profileReadFailure = false;
  const setupTargetForUser = async (userId: string): Promise<string | null> => {
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role,status')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      profileReadFailure = true;
      return null;
    }
    if (profile?.status !== 'active' || (profile.role !== 'student' && profile.role !== 'teacher'))
      return null;
    return resolveSetupDestination(db, userId, profile.role, locale, destination);
  };
  if (code) {
    const exchange = await db.auth.exchangeCodeForSession(code);
    error = exchange.error;
    recoveryFlow =
      !error &&
      (exchange.data as (typeof exchange.data & { redirectType?: string }) | null)?.redirectType ===
        'recovery';
    if (!error && params.has('delete_intent')) {
      const { data: identity, error: identityError } = await db.auth.getUser();
      preverifiedUser = identity.user;
      if (identityError || !identity.user) {
        await db.auth.signOut({ scope: 'local' });
        const response = NextResponse.redirect(
          new URL(`/${locale}/login?error=setup`, request.nextUrl.origin),
        );
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
      if (identity.user) {
        const { data: callbackProfile, error: callbackProfileError } = await db
          .from('profiles')
          .select('role,status')
          .eq('id', identity.user.id)
          .maybeSingle();
        if (callbackProfile?.role === 'admin') {
          await db.auth.signOut({ scope: 'local' });
          const jar = await cookies();
          jar.delete(PASSWORD_RECOVERY_COOKIE);
          const response = NextResponse.redirect(
            new URL(`/${locale}/login?error=admin-portal`, request.nextUrl.origin),
          );
          response.headers.set('Cache-Control', 'private, no-store');
          return response;
        }
        const isNewGoogleSetup =
          !callbackProfile && identity.user.identities?.some(item => item.provider === 'google');
        if (
          callbackProfileError ||
          (callbackProfile &&
            (callbackProfile.status !== 'active' ||
              (callbackProfile.role !== 'student' && callbackProfile.role !== 'teacher'))) ||
          (!callbackProfile && !isNewGoogleSetup)
        ) {
          await db.auth.signOut({ scope: 'local' });
          const response = NextResponse.redirect(
            new URL(`/${locale}/login?error=setup`, request.nextUrl.origin),
          );
          response.headers.set('Cache-Control', 'private, no-store');
          return response;
        }
      }
    }
    const deletionIntent = params.get('delete_intent');
    if (deletionIntent && destination !== `/${locale}/reset-password`) {
      const jar = await cookies();
      const cookieIntent = jar.get('dars-delete-intent')?.value;
      const nonce = jar.get('dars-delete-nonce')?.value;
      const cookieOwner = jar.get('dars-delete-owner')?.value;
      const fail = () => {
        jar.delete('dars-delete-intent');
        jar.delete('dars-delete-nonce');
        jar.delete('dars-delete-owner');
        jar.delete('dars-delete-google-ready');
        const response = NextResponse.redirect(
          new URL(`/${locale}/account/delete?error=reauth`, request.nextUrl.origin),
        );
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      };
      if (error || !cookieIntent || cookieIntent !== deletionIntent || !nonce || !cookieOwner)
        return fail();
      const [{ data: identity, error: identityError }, { data: session }] = await Promise.all([
        preverifiedUser
          ? Promise.resolve({ data: { user: preverifiedUser }, error: null })
          : db.auth.getUser(),
        db.auth.getSession(),
      ]);
      if (
        identityError ||
        !identity.user ||
        identity.user.id !== cookieOwner ||
        !identity.user.identities?.some(identity => identity.provider === 'google') ||
        !session.session ||
        session.session.user.id !== identity.user.id
      )
        return fail();
      const proof = await callDeletionEdge(session.session.access_token, {
        operation: 'complete_google_reauth',
        intent_id: deletionIntent,
        nonce,
      });
      if (proof.error || !proof.data) return fail();
      const response = NextResponse.redirect(
        new URL(`/${locale}/account/delete`, request.nextUrl.origin),
      );
      response.cookies.set(
        'dars-delete-google-ready',
        googleReauthHint(deletionIntent, cookieOwner),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 300,
        },
      );
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    if (!error && destination !== `/${locale}/reset-password`) {
      const googleRole = params.get('google_role');
      if (params.has('google_role') && googleRole !== 'student' && googleRole !== 'teacher')
        setupError = true;
      else if (googleRole === 'student' || googleRole === 'teacher') {
        const { data: verified, error: verifyError } = await db.auth.getUser();
        if (
          verifyError ||
          !verified.user?.identities?.some(identity => identity.provider === 'google')
        )
          setupError = true;
        else {
          const completion = await observeOperation('google_setup', locale, () =>
            db.rpc('complete_google_signup', { p_role: googleRole }),
          );
          const completedRole = completion.data;
          if (!completion.error && completedRole === 'admin') {
            await db.auth.signOut({ scope: 'local' });
            const response = NextResponse.redirect(
              new URL(`/${locale}/login?error=admin-portal`, request.nextUrl.origin),
            );
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          }
          setupError = !!completion.error || !['student', 'teacher'].includes(completedRole);
          if (!setupError && completedRole === 'teacher')
            after(async () => {
              try {
                await flushEmailOutbox(1);
              } catch {
                /* Transactional outbox recovery handles delivery. */
              }
            });
          if (!setupError && completedRole !== googleRole) {
            const mismatch = new URL(
              `/${locale}/login?error=role-mismatch`,
              request.nextUrl.origin,
            );
            if (
              completedRole === 'student' ||
              completedRole === 'teacher' ||
              completedRole === 'admin'
            )
              mismatch.searchParams.set('actual', completedRole);
            mismatch.searchParams.set('requested', googleRole);
            const response = NextResponse.redirect(mismatch);
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          }
          if (!setupError && (completedRole === 'student' || completedRole === 'teacher')) {
            const target = await resolveSetupDestination(
              db,
              verified.user.id,
              completedRole,
              locale,
              destination,
            );
            const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          }
        }
      } else {
        const { data: authData, error: authError } = await db.auth.getUser();
        const user = authData.user;
        if (!authError && user?.identities?.some(identity => identity.provider === 'google')) {
          const { data: profile, error: profileError } = await db
            .from('profiles')
            .select('role,status')
            .eq('id', user.id)
            .maybeSingle();
          if (profileError) profileReadFailure = true;
          else if (!profile) {
            const response = NextResponse.redirect(
              new URL(`/${locale}/choose-role`, request.nextUrl.origin),
            );
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          } else if (
            profile.status === 'active' &&
            (profile.role === 'student' || profile.role === 'teacher')
          ) {
            const target = await resolveSetupDestination(
              db,
              user.id,
              profile.role,
              locale,
              destination,
            );
            const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
          }
        }
      }
    }
    // Older email confirmation callbacks still authenticate users successfully.
    // Route active student/teacher accounts through the same setup resolver;
    // password recovery and deletion reauthentication have already exited above.
    if (
      !error &&
      !setupError &&
      params.get('type') !== 'recovery' &&
      destination !== `/${locale}/reset-password` &&
      !params.has('delete_intent')
    ) {
      const { data: authData, error: authError } = await db.auth.getUser();
      const user = authData.user;
      if (!authError && user) {
        const target = await setupTargetForUser(user.id);
        if (target) {
          const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
          response.headers.set('Cache-Control', 'private, no-store');
          return response;
        }
      }
    }
  }

  // Every successful public callback must resolve the verified identity to a
  // fresh profile before sending it into a protected public workspace.
  if (!error) {
    const { data: authData, error: identityError } = await db.auth.getUser();
    const user = authData.user;
    if (!identityError && user) {
      const { data: profile, error: freshProfileError } = await db
        .from('profiles')
        .select('role,status')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.role === 'admin') {
        await db.auth.signOut({ scope: 'local' });
        const jar = await cookies();
        jar.delete(PASSWORD_RECOVERY_COOKIE);
        const response = NextResponse.redirect(
          new URL(`/${locale}/login?error=admin-portal`, request.nextUrl.origin),
        );
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
      // A missing profile is expected only for first-time Google role setup.
      const isGoogleSetup = !profile && user.identities?.some(i => i.provider === 'google');
      if (
        freshProfileError ||
        (profile &&
          (profile.status !== 'active' ||
            (profile.role !== 'student' && profile.role !== 'teacher'))) ||
        (!profile && !isGoogleSetup)
      ) {
        await db.auth.signOut({ scope: 'local' });
        const response = NextResponse.redirect(
          new URL(`/${locale}/login?error=setup`, request.nextUrl.origin),
        );
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    }
  }

  if (!error && recoveryFlow) {
    const [
      {
        data: { user },
        error: userError,
      },
      { data: claimsData, error: claimsError },
    ] = await Promise.all([db.auth.getUser(), db.auth.getClaims()]);
    const claims = claimsData?.claims;
    const sessionId = claims?.session_id;
    const proof =
      recoveryFlow &&
      !userError &&
      !claimsError &&
      user &&
      claims?.sub === user.id &&
      typeof sessionId === 'string'
        ? issueRecoveryProof(user.id, sessionId)
        : null;
    const jar = await cookies();
    if (proof) {
      jar.set(PASSWORD_RECOVERY_COOKIE, proof, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: PASSWORD_RECOVERY_TTL_SECONDS,
      });
    } else jar.delete(PASSWORD_RECOVERY_COOKIE);
  }

  const setupFailure = new URL(`/${locale}/login?error=setup`, request.nextUrl.origin);
  if (setupError) {
    const googleRole = params.get('google_role');
    if (googleRole === 'student' || googleRole === 'teacher')
      setupFailure.searchParams.set('google_role', googleRole);
  }
  const profileFailure = new URL(`/${locale}/account/setup?load=error`, request.nextUrl.origin);
  const response = NextResponse.redirect(
    error
      ? failure
      : profileReadFailure
        ? profileFailure
        : setupError
          ? setupFailure
          : new URL(destination, request.nextUrl.origin),
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
