import 'server-only';

import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Client address as reported by the hosting proxy (Vercel sets both headers). */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
    return (h.get('x-real-ip') ?? forwarded ?? '').trim().slice(0, 45);
  } catch {
    return '';
  }
}

/**
 * Returns false when the database says this email or IP has had too many recent
 * failures, and null when the limiter is unavailable or returns an invalid result.
 */
export async function loginAllowed(
  db: SupabaseClient,
  email: string,
  ip: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await db.rpc('admin_login_allowed', { p_email: email, p_ip: ip });
    if (error) {
      console.error('admin login throttle unavailable');
      return null;
    }
    return typeof data === 'boolean' ? data : null;
  } catch {
    return null;
  }
}

export async function recordLoginFailure(db: SupabaseClient, email: string, ip: string) {
  try {
    await db.rpc('admin_login_record_failure', { p_email: email, p_ip: ip });
  } catch {
    // Best effort; the failed login is still rejected.
  }
}
