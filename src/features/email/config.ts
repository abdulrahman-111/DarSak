export type EmailConfig = { origin: string; appPassword: string };

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  if (env.VERCEL_ENV !== 'production') return null;
  const originValue = env.NEXT_PUBLIC_SITE_URL;
  const appPassword = env.GMAIL_APP_PASSWORD;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!originValue || !appPassword || !serviceKey || !supabaseUrl) return null;
  try {
    const origin = new URL(originValue);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    if (origin.hostname === 'localhost' || origin.hostname.endsWith('.localhost') || origin.hostname === '127.0.0.1' || origin.hostname === '[::1]') return null;
    return { origin: origin.origin, appPassword };
  } catch {
    return null;
  }
}

export function isEmailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return emailConfig(env) !== null;
}
