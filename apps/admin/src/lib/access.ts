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

async function activeAdmin(db: SupabaseClient, user: User): Promise<AdminActor | null> {
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

export async function getAdminActor(): Promise<AdminActor | null> {
  if (process.env.ADMIN_APP !== 'true' || !isConfigured()) return null;
  try {
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) return null;
    return await activeAdmin(db, data.user);
  } catch {
    return null;
  }
}

export async function requireAdminActor(locale: string): Promise<AdminActor> {
  if (!isLocale(locale)) redirect('/ar/login');
  const actor = await getAdminActor();
  if (!actor) redirect(`/${locale}/login`);
  return actor;
}

/** Compatibility with admin pages being moved; this app can only authorize admins. */
export async function requireViewer(locale: string, role?: 'admin'): Promise<AdminActor> {
  void role;
  return requireAdminActor(locale);
}

export { activeAdmin };
