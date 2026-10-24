import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: 'encrypted-flow' }) })),
}));
import { getGoogleMeetConfig, getGoogleMeetPilotConfig } from '@/features/meet/config';
import {
  encryptSecret,
  decryptSecret,
  createOAuthState,
  createPkceVerifier,
} from '@/features/meet/crypto';
import {
  completeGoogleOAuth,
  revokeGoogleConnection,
  startGoogleOAuth,
} from '@/features/meet/oauth';
import * as oauth from '@/features/meet/oauth';
import { NextRequest } from 'next/server';
import { POST as connectPost } from '@/app/api/integrations/google/connect/route';
import { GET as callbackGet } from '@/app/api/integrations/google/callback/route';
import { createClient } from '@/lib/supabase/server';

const originalEnv = { ...process.env };
const key = Buffer.alloc(32, 7).toString('base64');
const baseEnv = {
  APP_ENV: 'staging',
  SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
  NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
  GOOGLE_MEET_ENABLED: 'true',
  GOOGLE_MEET_CLIENT_ID: 'client',
  GOOGLE_MEET_CLIENT_SECRET: 'secret',
  GOOGLE_MEET_ENCRYPTION_KEY: key,
  GOOGLE_MEET_REDIRECT_URI: 'https://staging.example/api/integrations/google/callback',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

describe('Google Meet staging configuration', () => {
  it('fails closed unless the exact staging project and all server secrets are configured', () => {
    expect(getGoogleMeetConfig({})).toBeNull();
    expect(
      getGoogleMeetPilotConfig({
        APP_ENV: 'staging',
        SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
        NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
        GOOGLE_MEET_ENABLED: 'true',
      }),
    ).toEqual({ enabled: true, namespace: 'darsak-staging' });
    expect(getGoogleMeetConfig(baseEnv)).toMatchObject({ enabled: true, clientId: 'client' });
  });

  it('refuses production, a non-staging app, a different Supabase ref, and malformed AES keys', () => {
    expect(getGoogleMeetConfig({ ...baseEnv, APP_ENV: 'production' })).toBeNull();
    expect(
      getGoogleMeetConfig({
        ...baseEnv,
        NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co',
      }),
    ).toBeNull();
    expect(getGoogleMeetConfig({ ...baseEnv, GOOGLE_MEET_ENCRYPTION_KEY: 'bad' })).toBeNull();
  });

  it('persists only a state hash and returns an encrypted PKCE cookie for the configured redirect', async () => {
    process.env = { ...process.env, ...baseEnv };
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const started = await startGoogleOAuth({ rpc } as never, 'teacher-1', 'session-1', 'ar');
    const args = rpc.mock.calls[0][1];
    expect(args.p_state_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(args.p_session_id).toBe('session-1');
    expect(started.cookieValue).not.toContain(args.p_state_hash);
    const authorize = new URL(started.authorizationUrl);
    expect(authorize.origin).toBe('https://accounts.google.com');
    expect(authorize.searchParams.get('redirect_uri')).toBe(baseEnv.GOOGLE_MEET_REDIRECT_URI);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('rejects a cross-session callback without consuming the flow or contacting Google', async () => {
    process.env = { ...process.env, ...baseEnv };
    const state = createOAuthState();
    const verifier = createPkceVerifier();
    const payload = {
      state,
      verifier,
      user_id: 'teacher-1',
      session_id: 'session-1',
      locale: 'en',
      expires_at: Date.now() + 60_000,
      redirect_uri: baseEnv.GOOGLE_MEET_REDIRECT_URI,
    };
    const cookieValue = encryptSecret(
      JSON.stringify(payload),
      key,
      'darsak-google-meet-oauth-flow:v1',
    );
    const rpc = vi.fn();
    const path = await completeGoogleOAuth({
      db: { rpc } as never,
      userId: 'teacher-1',
      sessionId: 'other-session',
      cookieValue,
      returnedState: state,
      code: 'private-code',
    });
    expect(path).toContain('google_meet=invalid_flow');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('consumes matching state before exchange and stops on atomic replay rejection', async () => {
    process.env = { ...process.env, ...baseEnv };
    const state = createOAuthState();
    const payload = {
      state,
      verifier: createPkceVerifier(),
      user_id: 'teacher-1',
      session_id: 'session-1',
      locale: 'ar',
      expires_at: Date.now() + 60_000,
      redirect_uri: baseEnv.GOOGLE_MEET_REDIRECT_URI,
    };
    const cookieValue = encryptSecret(
      JSON.stringify(payload),
      key,
      'darsak-google-meet-oauth-flow:v1',
    );
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const path = await completeGoogleOAuth({
      db: { rpc } as never,
      userId: 'teacher-1',
      sessionId: 'session-1',
      cookieValue,
      returnedState: state,
      code: 'private-code',
    });
    expect(rpc).toHaveBeenCalledWith(
      'google_meet_consume_flow',
      expect.objectContaining({ p_session_id: 'session-1' }),
    );
    expect(path).toBe('/ar/account/integrations?google_meet=invalid_flow');
  });

  it('preserves an omitted refresh token only for the same Google subject and stores ciphertext', async () => {
    process.env = { ...process.env, ...baseEnv };
    const state = createOAuthState();
    const subject = 'google-subject';
    const payload = {
      state,
      verifier: createPkceVerifier(),
      user_id: 'teacher-1',
      session_id: 'session-1',
      locale: 'en',
      expires_at: Date.now() + 60_000,
      redirect_uri: baseEnv.GOOGLE_MEET_REDIRECT_URI,
    };
    const cookieValue = encryptSecret(
      JSON.stringify(payload),
      key,
      'darsak-google-meet-oauth-flow:v1',
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'access',
              token_type: 'Bearer',
              scope:
                'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.owned',
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ sub: subject, email: 'teacher@example.com', email_verified: true }),
            { status: 200 },
          ),
        ),
    );
    const oldEnvelope = encryptSecret(
      'old-refresh-secret',
      key,
      JSON.stringify(['darsak-meet-token', 1, 'teacher-1', subject, 1]),
    );
    const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) =>
      name === 'google_meet_consume_flow'
        ? { data: true, error: null }
        : name === 'google_meet_credentials'
          ? {
              data: { google_subject: subject, ciphertext: oldEnvelope, key_version: 1 },
              error: null,
            }
          : { data: 'connection-1', error: null },
    );
    const path = await completeGoogleOAuth({
      db: { rpc } as never,
      userId: 'teacher-1',
      sessionId: 'session-1',
      cookieValue,
      returnedState: state,
      code: 'private-code',
    });
    const save = rpc.mock.calls.find(
      ([name]) => name === 'google_meet_save_connection',
    )?.[1] as Record<string, unknown>;
    expect(path).toContain('google_meet=connected');
    expect(save.p_ciphertext).not.toBe('old-refresh-secret');
    expect(
      decryptSecret(
        String(save.p_ciphertext),
        key,
        JSON.stringify(['darsak-meet-token', 1, 'teacher-1', subject, 1]),
      ),
    ).toBe('old-refresh-secret');
  });

  it('keeps OAuth endpoints disabled without creating a Supabase client or making network calls', async () => {
    const connect = await connectPost(
      new NextRequest('https://staging.example/api/integrations/google/connect', {
        method: 'POST',
        headers: { origin: 'https://staging.example', 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    const callback = await callbackGet(
      new NextRequest(
        'https://staging.example/api/integrations/google/callback?code=secret&state=state',
      ),
    );
    expect(connect.status).toBe(404);
    expect(callback.status).toBe(404);
    expect(callback.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('redirects callback results to the configured origin and always expires the flow cookie', async () => {
    process.env = { ...process.env, ...baseEnv };
    vi.spyOn(oauth, 'getVerifiedGoogleViewer').mockResolvedValue({
      db: { rpc: vi.fn() } as never,
      user: { id: 'teacher-1' } as never,
      sessionId: 'session-1',
    });
    vi.spyOn(oauth, 'completeGoogleOAuth').mockResolvedValue(
      '/ar/account/integrations?google_meet=connected',
    );
    const response = await callbackGet(
      new NextRequest(
        'https://attacker.invalid/api/integrations/google/callback?code=ignored&state=ignored',
      ),
    );
    expect(response.headers.get('location')).toBe(
      'https://staging.example/ar/account/integrations?google_meet=connected',
    );
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    vi.restoreAllMocks();
  });

  it('clears the local connection even when OAuth secrets are not configured for revocation', async () => {
    process.env = {
      ...process.env,
      APP_ENV: 'staging',
      SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      GOOGLE_MEET_ENABLED: 'true',
    };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await revokeGoogleConnection({ rpc } as never);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('google_meet_disconnect');
  });

  it('reports local disconnect failure with a safe error and never forwards database text', async () => {
    process.env = {
      ...process.env,
      APP_ENV: 'staging',
      SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      GOOGLE_MEET_ENABLED: 'true',
    };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL detail' } });
    await expect(revokeGoogleConnection({ rpc } as never)).rejects.toThrow(
      'google_disconnect_failed',
    );
  });
});
