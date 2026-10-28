import type { AssistantAccess } from '@/features/assistant/domain';

/**
 * The small, display-only snapshot of the signed-in visitor that the global
 * header and the SanDak companion need. It is fetched from /api/viewer after the
 * page shell is delivered so public pages can be prerendered and CDN-cached.
 * Authorization never relies on it: every page and action still verifies the
 * viewer on the server.
 */
export type ViewerState = {
  signedIn: boolean;
  /** Auth user id, used only to scope the live notification subscription. */
  userId: string | null;
  /** Set only for an active student or teacher; drives the workspace navigation. */
  activeRole: 'student' | 'teacher' | null;
  fullName: string;
  unreadCount: number | null;
  assistant: { access: AssistantAccess | null; key: string; aiEnabled: boolean };
};

export const ANONYMOUS_VIEWER: ViewerState = {
  signedIn: false,
  userId: null,
  activeRole: null,
  fullName: '',
  unreadCount: null,
  assistant: { access: null, key: 'guest', aiEnabled: false },
};
