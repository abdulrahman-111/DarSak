import 'server-only';
import type { ReactNode } from 'react';
import { isConfigured } from '@/lib/supabase/server';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { unreadNotificationCount } from '@/features/notifications/data';
import { PlatformShell } from './shell';

export async function OptionalWorkspaceLayout({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  if (!isConfigured()) return <>{children}</>;

  const { db, user, profile } = await getRequestViewer();
  if (
    !user ||
    profile?.status !== 'active' ||
    (profile.role !== 'student' && profile.role !== 'teacher')
  ) {
    return <>{children}</>;
  }

  const unreadCount = await unreadNotificationCount(db);
  return (
    <PlatformShell
      locale={locale}
      role={profile.role}
      name={profile.full_name}
      unreadCount={unreadCount}
    >
      {children}
    </PlatformShell>
  );
}
