import 'server-only';

import { parseMeetingUrl } from './meeting-url';

type MeetingRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

const extraHosts = (): readonly string[] =>
  (process.env.MEETING_HOSTS_EXTRA ?? '')
    .split(',')
    .map(host => host.trim())
    .filter(Boolean);

function safeSetting(data: unknown): { meeting_url: string | null } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>).meeting_url;
  if (value === null) return { meeting_url: null };
  if (typeof value !== 'string') return null;
  const url = parseMeetingUrl(value, extraHosts());
  return url ? { meeting_url: url } : null;
}

/** Loads only authorized effective links and drops every URL outside the configured host set. */
export async function meetingLinks(
  db: MeetingRpcClient,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0 || ids.length > 100) return {};
  try {
    const { data, error } = await db.rpc('meeting_links', { p_lesson_ids: [...new Set(ids)] });
    if (error || !Array.isArray(data)) return {};
    const links: Record<string, string> = {};
    for (const item of data) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.lesson_id !== 'string' || typeof row.meeting_url !== 'string') continue;
      if (!ids.includes(row.lesson_id)) continue;
      const url = parseMeetingUrl(row.meeting_url, extraHosts());
      if (url) links[row.lesson_id] = url;
    }
    return links;
  } catch {
    return {};
  }
}

/** Returns the owner's explicit group default, never a student's effective link. */
export async function groupMeetingSettings(
  db: MeetingRpcClient,
  groupId: string,
): Promise<{ meeting_url: string | null } | null> {
  try {
    const { data, error } = await db.rpc('group_meeting_settings', { p_group_id: groupId });
    return error ? null : safeSetting(data);
  } catch {
    return null;
  }
}

/** Returns only the owner's explicit lesson override, never inherited/generated URLs. */
export async function lessonMeetingSettings(
  db: MeetingRpcClient,
  lessonId: string,
): Promise<{ meeting_url: string | null } | null> {
  try {
    const { data, error } = await db.rpc('lesson_meeting_settings', { p_lesson_id: lessonId });
    return error ? null : safeSetting(data);
  } catch {
    return null;
  }
}
