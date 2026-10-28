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
 * False only when the database says this email or IP has had too many recent failures.
 * If the limiter itself is unavailable (for example the migration is not applied yet)
 * this fails open: the TOTP requirement, not the limiter, is the primary control and
 * the sole administrator must not be locked out by an infrastructure error.
 */
export async function loginAllowed(db: SupabaseClient, email: string, ip: string) {
  try {
    const { data, error } = await db.rpc('admin_login_allowed', { p_email: email, p_ip: ip });
    if (error) {
      console.error('admin login throttle unavailable');
      return true;
    }
    return data !== false;
  } catch {
    return true;
  }
}

export async function recordLoginFailure(db: SupabaseClient, email: string, ip: string) {
  try {
    await db.rpc('admin_login_record_failure', { p_email: email, p_ip: ip });
  } catch {
    // Best effort; the failed login is still rejected.
  }
}
