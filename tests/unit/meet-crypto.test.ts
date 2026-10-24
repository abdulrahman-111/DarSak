import { describe, expect, it } from 'vitest';
import {
  createPkceChallenge,
  createPkceVerifier,
  createOAuthState,
  decryptSecret,
  decryptToken,
  encryptSecret,
  encryptToken,
} from '@/features/meet/crypto';
import { googleAuthorizationUrl, GOOGLE_OAUTH_SCOPES } from '@/features/meet/domain';

const key = Buffer.alloc(32, 7).toString('base64');

describe('Meet credential cryptography', () => {
  it('encrypts and decrypts a token only for the same teacher and connection', () => {
    const encrypted = encryptToken('refresh-secret', key, 'teacher-1', 'google-sub-1', 1);

    expect(decryptToken(encrypted, key, 'teacher-1', 'google-sub-1', 1)).toBe('refresh-secret');
    expect(() => decryptToken(encrypted, key, 'teacher-2', 'google-sub-1', 1)).toThrow();
    expect(() => decryptToken(encrypted, key, 'teacher-1', 'google-sub-2', 1)).toThrow();
    expect(() => decryptToken(encrypted, key, 'teacher-1', 'google-sub-1', 2)).toThrow();
  });

  it('rejects modified ciphertext and malformed keys', () => {
    const encrypted = encryptSecret('refresh-secret', key, 'oauth-flow:teacher-1');
    const parts = encrypted.split('.');
    parts[2] = `${parts[2].slice(0, -2)}AA`;
    const tampered = parts.join('.');

    expect(() => decryptSecret(tampered, key, 'oauth-flow:teacher-1')).toThrow();
    expect(() => decryptSecret(encrypted, key, 'oauth-flow:teacher-2')).toThrow();
    expect(() => encryptToken('secret', 'short', 'teacher-1', 'google-sub-1', 1)).toThrow();
    expect(() => decryptSecret(encrypted, '%%%not-base64%%%', 'oauth-flow:teacher-1')).toThrow();
  });

  it('generates unpredictable OAuth state and PKCE S256 values', () => {
    const state = createOAuthState();
    const verifier = createPkceVerifier();

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(createPkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createPkceChallenge(verifier)).not.toBe(verifier);
  });

  it('requests only owned Calendar events with offline access and PKCE S256', () => {
    const state = createOAuthState();
    const url = new URL(
      googleAuthorizationUrl({
        clientId: 'client-id',
        redirectUri: 'https://staging.example/api/integrations/google/callback',
        state,
        codeVerifier: 'v'.repeat(43),
      }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_OAUTH_SCOPES);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(createPkceChallenge('v'.repeat(43)));
    expect(url.searchParams.get('state')).toBe(state);
    expect(() =>
      googleAuthorizationUrl({
        clientId: 'client-id',
        redirectUri: 'https://staging.example/callback',
        state: 'bad',
        codeVerifier: 'v'.repeat(43),
      }),
    ).toThrow();
  });
});
