import 'server-only';
import { getRequestViewer } from './request-viewer';
import { unreadNotificationCount } from '@/features/notifications/data';
import { resolveAssistant } from '@/features/assistant/launcher';
import { isConfigured } from '@/lib/supabase/server';
import { ANONYMOUS_VIEWER, type ViewerState } from './viewer-state-types';

/** Per-user header and companion state. Never cache the result across users. */
export async function loadViewerState(): Promise<ViewerState> {
  if (!isConfigured()) return ANONYMOUS_VIEWER;
  const viewer = await getRequestViewer();
  if (!viewer.user) return ANONYMOUS_VIEWER;
  const { profile } = viewer;
  const activeRole =
    profile?.status === 'active' && (profile.role === 'teacher' || profile.role === 'student')
      ? profile.role
      : null;
  const [unreadCount, assistant] = await Promise.all([
    activeRole ? unreadNotificationCount(viewer.db) : Promise.resolve(null),
    resolveAssistant(),
  ]);
  return {
    signedIn: true,
    userId: viewer.user.id,
    activeRole,
    fullName: profile?.full_name ?? '',
    unreadCount,
    assistant,
  };
}
