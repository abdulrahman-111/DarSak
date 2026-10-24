import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createOAuthState, createPkceVerifier, decryptSecret, encryptSecret } from './crypto';
import { googleAuthorizationUrl } from './domain';
import { GOOGLE_MEET_FLOW_COOKIE, getGoogleMeetConfig } from './config';
import { GoogleMeetProvider, type GoogleIdentity } from './google';

const FLOW_AAD = 'darsak-google-meet-oauth-flow:v1';
const FLOW_TTL_MS = 10 * 60 * 1000;
const KEY_VERSION = 1;
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

type FlowCookie = {
  state: string;
  verifier: string;
  user_id: string;
  session_id: string;
  locale: 'en' | 'ar';
  expires_at: number;
  redirect_uri: string;
};

export type VerifiedGoogleViewer = { db: SupabaseClient; user: User; sessionId: string };

export async function getVerifiedGoogleViewer(): Promise<VerifiedGoogleViewer | null> {
  const db = await createClient();
  const [
    {
      data: { user },
      error: userError,
    },
    { data: claimsData, error: claimsError },
  ] = await Promise.all([db.auth.getUser(), db.auth.getClaims()]);
  const claims = claimsData?.claims;
  if (
    userError ||
    claimsError ||
    !user ||
    claims?.sub !== user.id ||
    typeof claims.session_id !== 'string'
  )
    return null;
  const profile = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profile.error || profile.data?.role !== 'teacher' || profile.data?.status !== 'active')
    return null;
  return { db, user, sessionId: claims.session_id };
}

export function startGoogleOAuth(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
  locale: 'en' | 'ar',
) {
  const config = getGoogleMeetConfig();
  if (!config) throw new Error('google_disabled');
  const state = createOAuthState();
  const verifier = createPkceVerifier();
  const expiresAt = Date.now() + FLOW_TTL_MS;
  const flow: FlowCookie = {
    state,
    verifier,
    user_id: userId,
    session_id: sessionId,
    locale,
    expires_at: expiresAt,
    redirect_uri: config.redirectUri,
  };
  const stateHash = createHash('sha256').update(state, 'ascii').digest('hex');
  const cookieValue = encryptSecret(JSON.stringify(flow), config.encryptionKey, FLOW_AAD);
  return db
    .rpc('google_meet_begin_flow', { p_state_hash: stateHash, p_session_id: sessionId })
    .then(({ error }) => {
      if (error) throw new Error('google_flow_unavailable');
      return {
        cookieName: GOOGLE_MEET_FLOW_COOKIE,
        cookieValue,
        authorizationUrl: googleAuthorizationUrl({
          clientId: config.clientId,
          redirectUri: config.redirectUri,
          state,
          codeVerifier: verifier,
        }),
      };
    });
}

function secureStateMatches(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseFlowCookie(value: string, key: string): FlowCookie | null {
  try {
    const raw = JSON.parse(decryptSecret(value, key, FLOW_AAD)) as Partial<FlowCookie>;
    if (
      typeof raw.state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(raw.state) ||
      typeof raw.verifier !== 'string' ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(raw.verifier) ||
      typeof raw.user_id !== 'string' ||
      typeof raw.session_id !== 'string' ||
      (raw.locale !== 'en' && raw.locale !== 'ar') ||
      typeof raw.expires_at !== 'number' ||
      typeof raw.redirect_uri !== 'string'
    )
      return null;
    return raw as FlowCookie;
  } catch {
    return null;
  }
}

function scopesGranted(scope: string | null): string[] | null {
  if (!scope) return null;
  const scopes = [...new Set(scope.split(/\s+/).filter(Boolean))];
  return scopes.includes(CALENDAR_SCOPE) &&
    scopes.includes('openid') &&
    (scopes.includes('email') || scopes.includes('https://www.googleapis.com/auth/userinfo.email'))
    ? scopes
    : null;
}

function safeResultPath(locale: 'en' | 'ar', code: string): string {
  return `/${locale}/account/integrations?google_meet=${encodeURIComponent(code)}`;
}

export async function completeGoogleOAuth(input: {
  db: SupabaseClient;
  userId: string;
  sessionId: string;
  cookieValue?: string;
  returnedState?: string;
  code?: string;
  error?: string;
}): Promise<string> {
  const config = getGoogleMeetConfig();
  if (!config) return safeResultPath('en', 'disabled');
  const flow = input.cookieValue ? parseFlowCookie(input.cookieValue, config.encryptionKey) : null;
  const locale = flow?.locale ?? 'en';
  if (
    !flow ||
    !input.returnedState ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.returnedState) ||
    !secureStateMatches(flow.state, input.returnedState) ||
    flow.expires_at <= Date.now() ||
    flow.user_id !== input.userId ||
    flow.session_id !== input.sessionId ||
    flow.redirect_uri !== config.redirectUri
  ) {
    return safeResultPath(locale, 'invalid_flow');
  }
  if (input.code && input.code.length > 4096) return safeResultPath(locale, 'invalid_flow');
  const stateHash = createHash('sha256').update(flow.state, 'ascii').digest('hex');
  const consumed = await input.db.rpc('google_meet_consume_flow', {
    p_state_hash: stateHash,
    p_session_id: input.sessionId,
  });
  if (consumed.error || consumed.data !== true) return safeResultPath(locale, 'invalid_flow');
  if (input.error || !input.code) return safeResultPath(locale, 'cancelled');

  try {
    const provider = new GoogleMeetProvider(config);
    const grant = await provider.obtainToken({
      grant: 'authorization_code',
      code: input.code,
      codeVerifier: flow.verifier,
    });
    const identity = grant.identity as GoogleIdentity | undefined;
    const scopes = scopesGranted(grant.tokens.scope);
    if (
      !identity ||
      !identity.sub ||
      identity.sub.length > 255 ||
      !identity.email ||
      identity.email.length > 255 ||
      !scopes
    ) {
      return safeResultPath(locale, 'permission_denied');
    }
    let refreshToken = grant.tokens.refreshToken;
    if (!refreshToken) {
      const existing = await input.db.rpc('google_meet_credentials');
      const credentials =
        existing.data && typeof existing.data === 'object'
          ? (existing.data as Record<string, unknown>)
          : null;
      if (
        existing.error ||
        !credentials ||
        credentials.google_subject !== identity.sub ||
        typeof credentials.ciphertext !== 'string' ||
        typeof credentials.key_version !== 'number'
      )
        return safeResultPath(locale, 'reconnect_required');
      refreshToken = decryptSecret(
        credentials.ciphertext,
        config.encryptionKey,
        JSON.stringify([
          'darsak-meet-token',
          1,
          input.userId,
          identity.sub,
          credentials.key_version,
        ]),
      );
    }
    const envelope = encryptSecret(
      refreshToken,
      config.encryptionKey,
      JSON.stringify(['darsak-meet-token', 1, input.userId, identity.sub, KEY_VERSION]),
    );
    const saved = await input.db.rpc('google_meet_save_connection', {
      p_google_subject: identity.sub,
      p_google_email: identity.email,
      p_ciphertext: envelope,
      p_key_version: KEY_VERSION,
      p_scopes: scopes,
    });
    if (saved.error || typeof saved.data !== 'string')
      return safeResultPath(locale, 'connection_failed');
    return safeResultPath(locale, 'connected');
  } catch (error) {
    // Provider exceptions are already reduced to safe error classes. Never forward provider text.
    const code = (error as { code?: string })?.code;
    return safeResultPath(
      locale,
      code === 'reconnect_required' ? 'reconnect_required' : 'connection_failed',
    );
  }
}

export async function revokeGoogleConnection(db: SupabaseClient): Promise<void> {
  const config = getGoogleMeetConfig();
  let refreshToken: string | null = null;
  if (config) {
    const result = await db.rpc('google_meet_credentials');
    const value =
      result.data && typeof result.data === 'object'
        ? (result.data as Record<string, unknown>)
        : null;
    if (
      value &&
      typeof value.google_subject === 'string' &&
      typeof value.ciphertext === 'string' &&
      typeof value.key_version === 'number'
    ) {
      try {
        refreshToken = decryptSecret(
          value.ciphertext,
          config.encryptionKey,
          JSON.stringify([
            'darsak-meet-token',
            1,
            (await db.auth.getUser()).data.user?.id,
            value.google_subject,
            value.key_version,
          ]),
        );
      } catch {
        /* Disconnect still clears stored credentials. */
      }
    }
  }
  if (refreshToken && config) {
    try {
      await new GoogleMeetProvider(config).revokeToken(refreshToken);
    } catch {
      /* best effort */
    }
  }
  const disconnected = await db.rpc('google_meet_disconnect');
  if (disconnected.error) throw new Error('google_disconnect_failed');
}
