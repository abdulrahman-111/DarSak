import 'server-only';

import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient, isConfigured } from '@admin/lib/supabase/server';
import { isLocale } from '@admin/lib/i18n';

export type AdminActor = {
  db: SupabaseClient;
  id: string;
  role: 'admin';
  fullName: string;
  email: string;
};

/** Where the session stands on the second factor. */
export type AssuranceState = 'aal2' | 'enroll' | 'verify';

/**
 * The session must already be authenticated with getUser() before this is called:
 * the assurance level is read from the session token, which getUser() has verified.
 * Any failure counts as "not verified" so access is denied rather than granted.
 */
export async function assuranceState(db: SupabaseClient): Promise<AssuranceState | null> {
  try {
    const { data, error } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    if (data.currentLevel === 'aal2') return 'aal2';
    return data.nextLevel === 'aal2' ? 'verify' : 'enroll';
  } catch {
    return null;
  }
}

/** Role and status check only. Does not look at the second factor. */
export async function adminProfile(db: SupabaseClient, user: User): Promise<AdminActor | null> {
  const { data, error } = await db
    .from('profiles')
    .select('role,status,full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data || data.role !== 'admin' || data.status !== 'active') return null;
  return {
    db,
    id: user.id,
    role: 'admin',
    fullName: typeof data.full_name === 'string' ? data.full_name : '',
    email: user.email ?? '',
  };
}

/** An active administrator whose session has completed TOTP (aal2). */
async function activeAdmin(db: SupabaseClient, user: User): Promise<AdminActor | null> {
  const actor = await adminProfile(db, user);
  if (!actor) return null;
  return (await assuranceState(db)) === 'aal2' ? actor : null;
}

export type AdminAccess =
  | { status: 'ok'; actor: AdminActor }
  | { status: 'mfa-enroll' | 'mfa-verify'; actor: AdminActor }
  | { status: 'anonymous' | 'not-admin' };

/** Full picture of the current session, for pages that must route to enrolment or verification. */
export async function getAdminAccess(): Promise<AdminAccess> {
  if (process.env.ADMIN_APP !== 'true' || !isConfigured()) return { status: 'anonymous' };
  try {
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) return { status: 'anonymous' };
    const actor = await adminProfile(db, data.user);
    if (!actor) return { status: 'not-admin' };
    const state = await assuranceState(db);
    if (state === 'aal2') return { status: 'ok', actor };
    if (state === 'verify') return { status: 'mfa-verify', actor };
    if (state === 'enroll') return { status: 'mfa-enroll', actor };
    return { status: 'not-admin' };
  } catch {
    return { status: 'anonymous' };
  }
}

/** Server actions use this: null unless the caller is an active admin at aal2. */
export async function getAdminActor(): Promise<AdminActor | null> {
  const access = await getAdminAccess();
  return access.status === 'ok' ? access.actor : null;
}

export async function requireAdminActor(locale: string): Promise<AdminActor> {
  if (!isLocale(locale)) redirect('/ar/login');
  const access = await getAdminAccess();
  if (access.status === 'ok') return access.actor;
  if (access.status === 'mfa-enroll') redirect(`/${locale}/mfa/enroll`);
  if (access.status === 'mfa-verify') redirect(`/${locale}/mfa/verify`);
  redirect(`/${locale}/login`);
}

/** Compatibility with admin pages being moved; this app can only authorize admins. */
export async function requireViewer(locale: string, role?: 'admin'): Promise<AdminActor> {
  void role;
  return requireAdminActor(locale);
}

export { activeAdmin };
