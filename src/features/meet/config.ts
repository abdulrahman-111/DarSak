import 'server-only';

import { assertGoogleIntegrationEnvironment } from '@/lib/deployment-environment';

export const GOOGLE_MEET_CALLBACK_PATH = '/api/integrations/google/callback';
export const GOOGLE_MEET_FLOW_COOKIE = 'darsak_google_meet_flow';
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

export type GoogleMeetConfig = {
  enabled: true;
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
  redirectUri: string;
  namespace: string;
};
export type GoogleMeetPilotConfig = { enabled: true; namespace: string };
type MeetEnvironment = Record<string, string | undefined>;

function isBase64Aes256Key(value: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64') === value;
}

/** Enables authenticated manual-link and status flows in isolated staging. */
export function getGoogleMeetPilotConfig(
  env: MeetEnvironment = process.env,
): GoogleMeetPilotConfig | null {
  if (env.GOOGLE_MEET_ENABLED !== 'true' || env.APP_ENV !== 'staging') return null;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    assertGoogleIntegrationEnvironment(supabaseUrl, env);
  } catch {
    return null;
  }
  return { enabled: true, namespace: env.VERCEL_PROJECT_ID || 'darsak-staging' };
}

/** OAuth and provider work require every server-only secret. */
export function getGoogleMeetConfig(env: MeetEnvironment = process.env): GoogleMeetConfig | null {
  const pilot = getGoogleMeetPilotConfig(env);
  if (!pilot) return null;
  const clientId = env.GOOGLE_MEET_CLIENT_ID;
  const clientSecret = env.GOOGLE_MEET_CLIENT_SECRET;
  const encryptionKey = env.GOOGLE_MEET_ENCRYPTION_KEY;
  const redirectUri = env.GOOGLE_MEET_REDIRECT_URI;
  if (
    !clientId ||
    !clientSecret ||
    !encryptionKey ||
    !redirectUri ||
    !isBase64Aes256Key(encryptionKey)
  )
    return null;
  try {
    const callback = new URL(redirectUri);
    if (
      callback.protocol !== 'https:' ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash ||
      callback.pathname !== GOOGLE_MEET_CALLBACK_PATH
    )
      return null;
  } catch {
    return null;
  }
  return {
    enabled: true,
    clientId,
    clientSecret,
    encryptionKey,
    redirectUri,
    namespace: pilot.namespace,
  };
}

export function isGoogleMeetEnabled(env: MeetEnvironment = process.env): boolean {
  return getGoogleMeetConfig(env) !== null;
}

export function isGoogleMeetPilotEnabled(env: MeetEnvironment = process.env): boolean {
  return getGoogleMeetPilotConfig(env) !== null;
}

export { GOOGLE_CALENDAR_SCOPE };
