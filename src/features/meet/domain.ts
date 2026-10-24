import { createHash, randomUUID } from 'node:crypto';
import { createPkceChallenge, createOAuthState } from './crypto';

export const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events.owned',
] as const;

export function googleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeVerifier: string;
}): string {
  const state = input.state ?? createOAuthState();
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('Invalid Google OAuth state.');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', createPkceChallenge(input.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function deterministicEventId(
  namespace: string,
  connectionId: string,
  lessonId: string,
  generation: number,
): string {
  if (
    !namespace ||
    !connectionId ||
    !lessonId ||
    !Number.isSafeInteger(generation) ||
    generation < 1
  ) {
    throw new Error('Invalid Google event identity.');
  }
  return createHash('sha256')
    .update(`${namespace}\0${connectionId}\0${lessonId}\0${generation}`)
    .digest('hex')
    .replace(/^/, 'dars');
}

export function createConferenceRequestId(): string {
  return randomUUID();
}

export function validateGoogleMeetUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Unsupported Google Meet URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'meet.google.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)
  ) {
    throw new Error('Unsupported Google Meet URL.');
  }
  return url.toString();
}
