import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleMeetConfig } from './config';
import { decryptToken } from './crypto';
import { deterministicEventId } from './domain';
import { GoogleMeetProvider, GoogleProviderError, type GoogleCalendarEvent } from './google';

type MeetingJob = {
  job_id: string;
  lease_token: string;
  desired_revision: number;
  lesson_id: string;
  connection_id: string;
  operation: 'upsert' | 'cancel';
  event_generation: number;
  conference_attempt: number;
  provider_event_id: string | null;
  conference_request_id: string | null;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
};
type Credentials = {
  connection_id: string;
  google_subject: string;
  ciphertext: string;
  key_version: number;
  state: 'connected' | 'reconnect_required';
};

export type MeetSyncOptions = {
  provider?: GoogleMeetProvider;
  now?: () => number;
  maxJobs?: number;
  timeBudgetMs?: number;
};

function isJob(value: unknown): value is MeetingJob {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MeetingJob>;
  return (
    typeof row.job_id === 'string' &&
    typeof row.lease_token === 'string' &&
    typeof row.lesson_id === 'string' &&
    typeof row.connection_id === 'string' &&
    (row.operation === 'upsert' || row.operation === 'cancel') &&
    Number.isSafeInteger(row.desired_revision) &&
    Number.isSafeInteger(row.event_generation) &&
    Number.isSafeInteger(row.conference_attempt)
  );
}

function isCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Credentials>;
  return (
    typeof row.connection_id === 'string' &&
    typeof row.google_subject === 'string' &&
    typeof row.ciphertext === 'string' &&
    typeof row.key_version === 'number' &&
    (row.state === 'connected' || row.state === 'reconnect_required')
  );
}

function toOutcome(error: unknown): {
  outcome: 'retry' | 'failed' | 'reconnect_required';
  code: string;
} {
  if (error instanceof GoogleProviderError) {
    if (error.code === 'reconnect_required')
      return { outcome: 'reconnect_required', code: 'google_reconnect_required' };
    if (error.code === 'unsupported') return { outcome: 'failed', code: 'meeting_unsupported' };
    if (error.retryable) return { outcome: 'retry', code: 'google_unavailable' };
    return { outcome: 'failed', code: 'google_unavailable' };
  }
  return { outcome: 'retry', code: 'google_unavailable' };
}

async function settle(
  db: SupabaseClient,
  job: MeetingJob,
  input: {
    outcome: string;
    eventId?: string | null;
    requestId?: string | null;
    joinUrl?: string | null;
    errorCode?: string | null;
  },
): Promise<boolean> {
  const result = await db.rpc('settle_google_meeting_job', {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_revision: job.desired_revision,
    p_outcome: input.outcome,
    p_event_id: input.eventId ?? null,
    p_conference_request_id: input.requestId ?? null,
    p_join_url: input.joinUrl ?? null,
    p_error_code: input.errorCode ?? null,
  });
  return !result.error && result.data === true;
}

function eventIsOwned(event: GoogleCalendarEvent, job: MeetingJob): boolean {
  return (
    event.connectionId === job.connection_id &&
    event.lessonId === job.lesson_id &&
    event.generation === job.event_generation
  );
}

function mapEventResult(event: GoogleCalendarEvent, requestId: string) {
  if (event.status === 'cancelled') return { outcome: 'cancelled', eventId: event.id, requestId };
  if (event.conferenceStatus === 'failure')
    return {
      outcome: 'failed',
      eventId: event.id,
      requestId,
      errorCode: 'google_conference_failed',
    };
  if (event.conferenceStatus === 'pending')
    return { outcome: 'pending', eventId: event.id, requestId };
  if (event.meetUri)
    return { outcome: 'ready', eventId: event.id, requestId, joinUrl: event.meetUri };
  return { outcome: 'pending', eventId: event.id, requestId };
}

async function processJob(
  db: SupabaseClient,
  job: MeetingJob,
  config: NonNullable<ReturnType<typeof getGoogleMeetConfig>>,
  provider: GoogleMeetProvider,
): Promise<boolean> {
  let eventId =
    job.provider_event_id ??
    deterministicEventId(config.namespace, job.connection_id, job.lesson_id, job.event_generation);
  let requestId = job.conference_request_id ?? '';
  try {
    const credentialsResult = await db.rpc('google_meet_credentials');
    const credentials = credentialsResult.error ? null : credentialsResult.data;
    if (
      !isCredentials(credentials) ||
      credentials.state !== 'connected' ||
      credentials.connection_id !== job.connection_id
    ) {
      return settle(db, job, {
        outcome: 'reconnect_required',
        eventId: job.provider_event_id,
        requestId: job.conference_request_id,
        errorCode: 'google_reconnect_required',
      });
    }
    const viewer = await db.auth.getUser();
    if (viewer.error || !viewer.data.user) {
      return settle(db, job, {
        outcome: 'retry',
        eventId: job.provider_event_id,
        requestId: job.conference_request_id,
        errorCode: 'google_unavailable',
      });
    }
    const refreshToken = decryptToken(
      credentials.ciphertext,
      config.encryptionKey,
      viewer.data.user.id,
      credentials.google_subject,
      credentials.key_version,
    );
    const tokenResult = await provider.obtainToken({ grant: 'refresh_token', refreshToken });
    if (job.operation === 'cancel') {
      if (job.provider_event_id) {
        let existing: GoogleCalendarEvent;
        try {
          existing = await provider.getEvent(tokenResult.tokens.accessToken, job.provider_event_id);
        } catch (error) {
          if (error instanceof GoogleProviderError && error.code === 'not_found') {
            return settle(db, job, {
              outcome: 'cancelled',
              eventId: job.provider_event_id,
              requestId: job.conference_request_id,
            });
          }
          throw error;
        }
        if (!eventIsOwned(existing, job)) throw new GoogleProviderError('unsupported', false);
        await provider.deleteEvent(tokenResult.tokens.accessToken, job.provider_event_id);
      }
      return settle(db, job, {
        outcome: 'cancelled',
        eventId: job.provider_event_id,
        requestId: job.conference_request_id,
      });
    }
    if (!job.title || !job.starts_at || !job.ends_at || !job.conference_request_id) {
      return settle(db, job, {
        outcome: 'failed',
        eventId: job.provider_event_id,
        requestId: job.conference_request_id,
        errorCode: 'google_unavailable',
      });
    }
    requestId = job.conference_request_id;
    let event: GoogleCalendarEvent;
    let existing: GoogleCalendarEvent | null = null;
    if (job.provider_event_id) {
      try {
        existing = await provider.getEvent(tokenResult.tokens.accessToken, eventId);
      } catch (error) {
        if (!(error instanceof GoogleProviderError) || error.code !== 'not_found') throw error;
      }
      if (existing && !eventIsOwned(existing, job))
        throw new GoogleProviderError('unsupported', false);
    }
    if (existing) {
      event = await provider.patchEvent(tokenResult.tokens.accessToken, eventId, {
        title: job.title,
        startAt: job.starts_at,
        endAt: job.ends_at,
        ...(existing.conferenceStatus === 'failure' ? { conferenceRequestId: requestId } : {}),
      });
    } else {
      try {
        event = await provider.insertEvent({
          accessToken: tokenResult.tokens.accessToken,
          namespace: config.namespace,
          connectionId: job.connection_id,
          lessonId: job.lesson_id,
          generation: job.event_generation,
          conferenceRequestId: job.conference_request_id,
          title: job.title,
          startAt: job.starts_at,
          endAt: job.ends_at,
        });
      } catch (error) {
        if (!(error instanceof GoogleProviderError) || error.code !== 'conflict') throw error;
        const reconciled = await provider.getEvent(tokenResult.tokens.accessToken, eventId);
        if (!eventIsOwned(reconciled, job)) throw new GoogleProviderError('unsupported', false);
        event = await provider.patchEvent(tokenResult.tokens.accessToken, eventId, {
          title: job.title,
          startAt: job.starts_at,
          endAt: job.ends_at,
          ...(reconciled.conferenceStatus === 'failure'
            ? { conferenceRequestId: job.conference_request_id }
            : {}),
        });
      }
    }
    if (!eventIsOwned(event, job)) throw new GoogleProviderError('unsupported', false);
    return settle(db, job, mapEventResult(event, requestId));
  } catch (error) {
    const mapped = toOutcome(error);
    return settle(db, job, { outcome: mapped.outcome, eventId, requestId, errorCode: mapped.code });
  }
}

/** Claim and process only the caller's own durable jobs; never stores the JWT. */
export async function kickGoogleMeetSync(
  db: SupabaseClient,
  options: MeetSyncOptions = {},
): Promise<{ claimed: number; settled: number }> {
  const config = getGoogleMeetConfig();
  if (!config) return { claimed: 0, settled: 0 };
  const [claims, verified] = await Promise.all([db.auth.getClaims(), db.auth.getUser()]);
  const subject = claims.data?.claims?.sub;
  if (
    claims.error ||
    verified.error ||
    !verified.data.user ||
    subject !== verified.data.user.id ||
    typeof claims.data?.claims?.session_id !== 'string'
  )
    return { claimed: 0, settled: 0 };
  const maxJobs = Math.max(1, Math.min(options.maxJobs ?? 1, 10));
  const timeBudgetMs = Math.max(1000, Math.min(options.timeBudgetMs ?? 20_000, 20_000));
  const start = (options.now ?? Date.now)();
  const provider = options.provider ?? new GoogleMeetProvider({ ...config, timeoutMs: 7_000 });
  let claimed = 0;
  let settled = 0;
  for (let i = 0; i < maxJobs && (options.now ?? Date.now)() - start < timeBudgetMs; i++) {
    const result = await db.rpc('claim_google_meeting_jobs', { p_limit: 1 });
    if (result.error || !Array.isArray(result.data) || result.data.length === 0) break;
    const value = result.data[0];
    if (!isJob(value)) break;
    claimed++;
    if (await processJob(db, value, config, provider)) settled++;
  }
  return { claimed, settled };
}

export type { MeetingJob };
