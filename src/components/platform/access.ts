import 'server-only';
import { redirect } from 'next/navigation';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';

export type PlatformRole = 'student' | 'teacher' | 'admin';
const isPlatformRole = (value: unknown): value is PlatformRole =>
  value === 'student' || value === 'teacher' || value === 'admin';
export type PlatformViewer = {
  db: Awaited<ReturnType<typeof createClient>>;
  id: string;
  fullName: string;
  role: PlatformRole;
  status: 'active' | 'suspended';
  email: string | null;
  signInMethods: string[];
};

export async function requireViewer(locale: string, role?: PlatformRole): Promise<PlatformViewer> {
  if (!isConfigured()) redirect(`/${locale}`);
  const { db, user, profile } = await getRequestViewer();
  if (!user) redirect(`/${locale}/login`);
  if (!profile || profile.status !== 'active' || !isPlatformRole(profile.role))
    redirect(`/${locale}/login`);
  if (role && profile.role !== role) redirect(roleHome(locale, profile.role));
  const signInMethods = [
    ...new Set(
      [
        ...(user.identities ?? []).map(identity => identity.provider),
        ...(typeof user.app_metadata?.provider === 'string' ? [user.app_metadata.provider] : []),
      ].filter(provider => typeof provider === 'string' && provider.length > 0),
    ),
  ];
  return {
    db,
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    status: profile.status,
    email: user.email ?? null,
    signInMethods,
  };
}

export async function requireTeachingAccess(locale: string): Promise<PlatformViewer> {
  const me = await requireViewer(locale, 'teacher');
  const { status, error } = await readTeacherAccessStatus(me.db);
  if (error) redirect(`/${locale}/account/teaching-access?error=unavailable`);
  if (!status?.has_access) redirect(`/${locale}/account/teaching-access`);
  return me;
}

export function roleHome(locale: string, role: PlatformRole) {
  return `/${locale}/${role}`;
}
