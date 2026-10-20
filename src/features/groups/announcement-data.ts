import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type GroupAnnouncement = { body: string; edited_at: string };

/** The caller's RLS context decides whether this announcement exists for them. */
export async function groupAnnouncement(
  db: SupabaseClient,
  groupId: string,
): Promise<GroupAnnouncement | null> {
  const { data, error } = await db
    .from('group_pinned_announcements')
    .select('body,edited_at')
    .eq('group_id', groupId)
    .maybeSingle();
  return error ? null : (data as GroupAnnouncement | null);
}
