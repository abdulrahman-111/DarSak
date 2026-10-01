import 'server-only';
import { redirect } from 'next/navigation';
import { createClient, isConfigured } from '@/lib/supabase/server';

export type PlatformRole = 'student' | 'teacher' | 'admin';
export type PlatformViewer = {
  db: Awaited<ReturnType<typeof createClient>>;
  id: string;
  fullName: string;
  role: PlatformRole;
  status: 'active' | 'suspended';
};

export async function requireViewer(locale: string, role?: PlatformRole): Promise<PlatformViewer> {
  if (!isConfigured()) redirect(`/${locale}`);
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { data: profile } = await db.from('profiles').select('id,full_name,role,status').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'active') redirect(`/${locale}/login`);
  if (role && profile.role !== role) redirect(`/${locale}/dashboard`);
  return { db, id: profile.id, fullName: profile.full_name, role: profile.role as PlatformRole, status: profile.status };
}

export function roleHome(locale: string, role: PlatformRole) {
  return `/${locale}/${role}`;
}
