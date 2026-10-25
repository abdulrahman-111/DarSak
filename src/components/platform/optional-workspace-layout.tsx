import 'server-only';
import type { ReactNode } from 'react';
import { isConfigured } from '@/lib/supabase/server';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { unreadNotificationCount } from '@/features/notifications/data';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { PlatformShell } from './shell';
import type { PlatformRole } from './access';

const platformRoles = new Set<PlatformRole>(['student', 'teacher', 'admin']);

export async function OptionalWorkspaceLayout({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  if (!isConfigured()) return <>{children}</>;

  const { db, user, profile } = await getRequestViewer();
  if (!user || profile?.status !== 'active' || !platformRoles.has(profile.role as PlatformRole)) {
    return <>{children}</>;
  }

  const role = profile.role as PlatformRole;
  const [unreadCount, teachingAccess] = await Promise.all([
    unreadNotificationCount(db),
    role === 'teacher' ? readTeacherAccessStatus(db).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <PlatformShell
      locale={locale}
      role={role}
      name={profile.full_name}
      unreadCount={unreadCount}
      canTeach={!!teachingAccess?.status?.has_access && !teachingAccess.error}
    >
      {children}
    </PlatformShell>
  );
}
