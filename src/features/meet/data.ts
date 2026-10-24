import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getGoogleMeetPilotConfig } from './config';

export type GoogleMeetStatus = {
  state: 'disconnected' | 'connected' | 'reconnect_required';
  email: string | null;
  pending_count: number;
  failed_count: number;
  unprepared_count: number;
};

export type LessonMeeting = {
  mode: 'automatic' | 'manual';
  status:
    | 'unprepared'
    | 'pending'
    | 'ready'
    | 'failed'
    | 'reconnect_required'
    | 'cancelled'
    | 'disconnected';
  join_url: string | null;
  error_code: string | null;
};

function parseStatus(value: unknown): GoogleMeetStatus | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    !['disconnected', 'connected', 'reconnect_required'].includes(String(row.state)) ||
    !(row.email === null || typeof row.email === 'string') ||
    !Number.isInteger(row.pending_count) ||
    !Number.isInteger(row.failed_count) ||
    !Number.isInteger(row.unprepared_count)
  )
    return null;
  return row as GoogleMeetStatus;
}

function parseMeeting(value: unknown): LessonMeeting | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    ![
      'unprepared',
      'pending',
      'ready',
      'failed',
      'reconnect_required',
      'cancelled',
      'disconnected',
    ].includes(String(row.status)) ||
    !(row.join_url === null || typeof row.join_url === 'string')
  )
    return null;
  // Accepted students intentionally receive only status and join_url from SQL.
  if (row.mode === undefined && row.error_code === undefined) {
    return {
      mode: 'automatic',
      status: row.status as LessonMeeting['status'],
      join_url: row.join_url,
      error_code: null,
    };
  }
  if (
    !['automatic', 'manual'].includes(String(row.mode)) ||
    !(row.error_code === null || typeof row.error_code === 'string')
  )
    return null;
  return row as LessonMeeting;
}

/** Owner-only account status. The SQL projection never includes ciphertext. */
export async function getGoogleMeetStatus() {
  if (!getGoogleMeetPilotConfig()) return { data: null, error: null };
  const db = await createClient();
  const result = await db.rpc('google_meet_status');
  return { data: result.error ? null : parseStatus(result.data), error: result.error };
}

/** SQL rechecks owner/enrollment, active teacher, schedule, archive, and cancellation on every read. */
export async function readLessonMeeting(lessonId: string) {
  if (!getGoogleMeetPilotConfig()) return { data: null, error: null };
  const db = await createClient();
  const result = await db.rpc('lesson_meeting', { p_lesson_id: lessonId });
  return { data: result.error ? null : parseMeeting(result.data), error: result.error };
}
