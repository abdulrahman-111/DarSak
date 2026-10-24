'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getGoogleMeetConfig, getGoogleMeetPilotConfig } from './config';
import { getVerifiedGoogleViewer, revokeGoogleConnection } from './oauth';
import { kickGoogleMeetSync } from './worker';
import type { LessonMeeting } from './data';

export type MeetingOperation = 'prepare' | 'retry' | 'manual' | 'clear_manual';

function normalizeManualUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash)
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isMeeting(value: unknown): value is LessonMeeting {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<LessonMeeting>;
  return (
    ['automatic', 'manual'].includes(String(row.mode)) &&
    [
      'unprepared',
      'pending',
      'ready',
      'failed',
      'reconnect_required',
      'cancelled',
      'disconnected',
    ].includes(String(row.status)) &&
    (row.join_url === null || typeof row.join_url === 'string') &&
    (row.error_code === null || typeof row.error_code === 'string')
  );
}

/** Teacher lesson-management hook. Database authorization remains authoritative. */
export async function manageLessonMeeting(
  locale: string,
  lessonId: string,
  operation: MeetingOperation,
  manualUrl?: string,
) {
  if (!getGoogleMeetPilotConfig()) return { error: 'disabled' };
  if ((operation === 'prepare' || operation === 'retry') && !getGoogleMeetConfig())
    return { error: 'google_not_configured' };
  const viewer = await getVerifiedGoogleViewer();
  if (!viewer) return { error: 'not_authorized' };
  if (!['prepare', 'retry', 'manual', 'clear_manual'].includes(operation))
    return { error: 'invalid_operation' };
  let url: string | null = null;
  if (operation === 'manual') {
    url = normalizeManualUrl(manualUrl);
    if (!url) return { error: 'meeting_invalid_url' };
  }
  const result = await viewer.db.rpc('manage_lesson_meeting', {
    p_lesson_id: lessonId,
    p_operation: operation,
    p_manual_url: url,
  });
  if (result.error) {
    const message = result.error.message.toLowerCase();
    if (message.includes('queue_full')) return { error: 'meeting_queue_full' };
    if (message.includes('invalid_url')) return { error: 'meeting_invalid_url' };
    if (message.includes('reconnect')) return { error: 'google_reconnect_required' };
    return { error: 'meeting_unavailable' };
  }
  if (!isMeeting(result.data)) return { error: 'meeting_unavailable' };
  try {
    await kickGoogleMeetSync(viewer.db);
  } catch {
    /* SQL keeps the job durable for the next explicit sync. */
  }
  const safeLocale = locale === 'ar' ? 'ar' : 'en';
  revalidatePath(`/${safeLocale}/teacher/lessons/${lessonId}`);
  revalidatePath(`/${safeLocale}/student/lessons/${lessonId}`);
  return { data: result.data };
}

/** Explicit authenticated recovery path for the teacher's own pending work. */
export async function syncGoogleMeet(): Promise<{
  claimed: number;
  settled: number;
  error: string | null;
}> {
  const config = getGoogleMeetConfig();
  if (!config) return { claimed: 0, settled: 0, error: 'disabled' };
  const viewer = await getVerifiedGoogleViewer();
  if (!viewer) return { claimed: 0, settled: 0, error: 'not_authorized' };
  return { ...(await kickGoogleMeetSync(viewer.db)), error: null };
}

/** Best-effort provider revoke followed by unconditional owner credential deletion. */
export async function disconnectGoogleMeet() {
  if (!getGoogleMeetPilotConfig()) return { error: 'disabled' };
  const viewer = await getVerifiedGoogleViewer();
  if (!viewer) return { error: 'not_authorized' };
  try {
    await revokeGoogleConnection(viewer.db);
  } catch {
    return { error: 'meeting_unavailable' };
  }
  return { ok: true };
}

/** Convenient authenticated status query for server-rendered integration UI. */
export async function googleMeetStatusForAction() {
  if (!getGoogleMeetPilotConfig()) return { error: 'disabled' };
  const viewer = await getVerifiedGoogleViewer();
  if (!viewer) return { error: 'not_authorized' };
  const result = await viewer.db.rpc('google_meet_status');
  return result.error ? { error: 'meeting_unavailable' } : { data: result.data };
}

/** Used by callers that already hold the current teacher's cookie-backed client. */
export async function kickGoogleMeetSyncForCurrentRequest() {
  const db = await createClient();
  return kickGoogleMeetSync(db);
}
