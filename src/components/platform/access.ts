import 'server-only';
import { redirect } from 'next/navigation';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { getRequestViewer } from '@/features/platform/request-viewer';

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
  const { db, user, profile } = await getRequestViewer();
  if (!user) redirect(`/${locale}/login`);
  if (!profile || profile.status !== 'active') redirect(`/${locale}/login`);
  if (role && profile.role !== role) redirect(`/${locale}/dashboard`);
  return { db, id: profile.id, fullName: profile.full_name, role: profile.role as PlatformRole, status: profile.status };
}

export function roleHome(locale: string, role: PlatformRole) {
  return `/${locale}/${role}`;
}
