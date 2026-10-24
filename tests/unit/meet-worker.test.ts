import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { kickGoogleMeetSync } from '@/features/meet/worker';
import { encryptToken } from '@/features/meet/crypto';
import { deterministicEventId } from '@/features/meet/domain';
import { GoogleProviderError, type GoogleCalendarEvent } from '@/features/meet/google';

const key = Buffer.alloc(32, 7).toString('base64');
const baseEnv = {
  APP_ENV: 'staging',
  SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
  NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
  GOOGLE_MEET_ENABLED: 'true',
  GOOGLE_MEET_CLIENT_ID: 'client',
  GOOGLE_MEET_CLIENT_SECRET: 'secret',
  GOOGLE_MEET_ENCRYPTION_KEY: key,
  GOOGLE_MEET_REDIRECT_URI: 'https://staging.example/api/integrations/google/callback',
};
const job = {
  job_id: 'job-1',
  lease_token: 'lease-1',
  desired_revision: 2,
  lesson_id: 'lesson-1',
  connection_id: 'connection-1',
  operation: 'upsert',
  event_generation: 1,
  conference_attempt: 1,
  provider_event_id: null,
  conference_request_id: 'request-1',
  title: 'DarSak lesson',
  starts_at: '2026-10-25T10:00:00Z',
  ends_at: '2026-10-25T11:00:00Z',
};
const readyEvent: GoogleCalendarEvent = {
  id: 'dars-event',
  status: 'confirmed',
  conferenceStatus: 'success',
  meetUri: 'https://meet.google.com/abc-defg-hij',
  startAt: job.starts_at,
  endAt: job.ends_at,
  etag: 'etag',
  connectionId: job.connection_id,
  lessonId: job.lesson_id,
  generation: job.event_generation,
};
const credentials = {
  connection_id: job.connection_id,
  google_subject: 'google-1',
  ciphertext: encryptToken('refresh-secret', key, 'teacher-1', 'google-1', 1),
  key_version: 1,
  state: 'connected',
};

afterEach(() => {
  for (const name of Object.keys(process.env)) delete process.env[name];
});

function makeDb(jobRow: unknown = job) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_google_meeting_jobs') return { data: jobRow ? [jobRow] : [], error: null };
    if (name === 'google_meet_credentials') return { data: credentials, error: null };
    return { data: true, error: null };
  });
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'teacher-1', session_id: 'session-1' } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null }),
    },
    rpc,
  };
}

function provider(overrides: Record<string, unknown> = {}) {
  return {
    obtainToken: vi.fn().mockResolvedValue({
      tokens: { accessToken: 'access', refreshToken: 'refresh', expiresAt: null, scope: null },
    }),
    insertEvent: vi.fn().mockResolvedValue(readyEvent),
    getEvent: vi.fn().mockResolvedValue(readyEvent),
    patchEvent: vi.fn().mockResolvedValue(readyEvent),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('Google Meet worker', () => {
  it('does no database work when the staging gate is disabled', async () => {
    const db = makeDb();
    const result = await kickGoogleMeetSync(db as never, { provider: provider() as never });
    expect(result).toEqual({ claimed: 0, settled: 0 });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('settles a claimed event with only its owned generated join URL', async () => {
    process.env = { ...process.env, ...baseEnv };
    const db = makeDb();
    const google = provider();
    const result = await kickGoogleMeetSync(db as never, { provider: google as never, maxJobs: 1 });
    expect(result).toEqual({ claimed: 1, settled: 1 });
    expect(google.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: job.connection_id, lessonId: job.lesson_id }),
    );
    expect(db.rpc).toHaveBeenCalledWith(
      'settle_google_meeting_job',
      expect.objectContaining({
        p_outcome: 'ready',
        p_event_id: readyEvent.id,
        p_join_url: readyEvent.meetUri,
      }),
    );
  });

  it('keeps conference-pending work pending against the same event', async () => {
    process.env = { ...process.env, ...baseEnv };
    const db = makeDb();
    const pending = { ...readyEvent, conferenceStatus: 'pending' as const };
    const google = provider({ insertEvent: vi.fn().mockResolvedValue(pending) });
    await kickGoogleMeetSync(db as never, { provider: google as never, maxJobs: 1 });
    expect(db.rpc).toHaveBeenCalledWith(
      'settle_google_meeting_job',
      expect.objectContaining({ p_outcome: 'pending', p_event_id: pending.id, p_join_url: null }),
    );
  });

  it('validates stored event ownership before rescheduling the same event', async () => {
    process.env = { ...process.env, ...baseEnv };
    const existingJob = { ...job, provider_event_id: readyEvent.id };
    const db = makeDb(existingJob);
    const google = provider({ getEvent: vi.fn().mockResolvedValue(readyEvent) });
    await kickGoogleMeetSync(db as never, { provider: google as never, maxJobs: 1 });
    expect(google.getEvent).toHaveBeenCalledWith('access', readyEvent.id);
    expect(google.patchEvent).toHaveBeenCalledWith(
      'access',
      readyEvent.id,
      expect.objectContaining({ title: job.title, startAt: job.starts_at, endAt: job.ends_at }),
    );
  });

  it('reconciles an insert conflict only after checking immutable event identity', async () => {
    process.env = { ...process.env, ...baseEnv };
    const db = makeDb();
    const google = provider({
      insertEvent: vi.fn().mockRejectedValue(new GoogleProviderError('conflict', false)),
      getEvent: vi.fn().mockResolvedValue({
        ...readyEvent,
        startAt: '2026-10-24T10:00:00Z',
        endAt: '2026-10-24T11:00:00Z',
      }),
    });
    await kickGoogleMeetSync(db as never, { provider: google as never, maxJobs: 1 });
    expect(google.getEvent).toHaveBeenCalledWith(
      'access',
      expect.stringMatching(/^dars[a-f0-9]{64}$/),
    );
    expect(google.patchEvent).toHaveBeenCalledWith(
      'access',
      expect.any(String),
      expect.objectContaining({ title: job.title, startAt: job.starts_at, endAt: job.ends_at }),
    );
    expect(db.rpc).toHaveBeenCalledWith(
      'settle_google_meeting_job',
      expect.objectContaining({ p_outcome: 'ready' }),
    );
  });

  it('recovers an ambiguous create by reading the same deterministic event on retry', async () => {
    process.env = { ...process.env, ...baseEnv };
    const firstDb = makeDb();
    const firstProvider = provider({
      insertEvent: vi
        .fn()
        .mockRejectedValue(new GoogleProviderError('temporarily_unavailable', true)),
    });
    await kickGoogleMeetSync(firstDb as never, { provider: firstProvider as never, maxJobs: 1 });
    const eventId = deterministicEventId('darsak-staging', job.connection_id, job.lesson_id, 1);
    expect(firstDb.rpc).toHaveBeenCalledWith(
      'settle_google_meeting_job',
      expect.objectContaining({ p_outcome: 'retry', p_event_id: eventId }),
    );

    const retryDb = makeDb({ ...job, provider_event_id: eventId });
    const existing = { ...readyEvent, id: eventId };
    const retryProvider = provider({
      getEvent: vi.fn().mockResolvedValue(existing),
      patchEvent: vi.fn().mockResolvedValue(existing),
    });
    await kickGoogleMeetSync(retryDb as never, { provider: retryProvider as never, maxJobs: 1 });
    expect(retryProvider.getEvent).toHaveBeenCalledWith('access', eventId);
    expect(retryProvider.insertEvent).not.toHaveBeenCalled();
  });

  it('checks private markers before deleting an owned event', async () => {
    process.env = { ...process.env, ...baseEnv };
    const cancelJob = { ...job, operation: 'cancel' as const, provider_event_id: readyEvent.id };
    const db = makeDb(cancelJob);
    const google = provider({ getEvent: vi.fn().mockResolvedValue(readyEvent) });
    await kickGoogleMeetSync(db as never, { provider: google as never, maxJobs: 1 });
    expect(google.getEvent).toHaveBeenCalledWith('access', readyEvent.id);
    expect(google.deleteEvent).toHaveBeenCalledWith('access', readyEvent.id);
    expect(db.rpc).toHaveBeenCalledWith(
      'settle_google_meeting_job',
      expect.objectContaining({ p_outcome: 'cancelled' }),
    );
  });

  it('sends the leased revision to settlement after a cancellation or manual override races the provider call', async () => {
    process.env = { ...process.env, ...baseEnv };
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'claim_google_meeting_jobs') return { data: [job], error: null };
      if (name === 'google_meet_credentials') return { data: credentials, error: null };
      if (name === 'settle_google_meeting_job') return { data: false, error: null };
      return { data: true, error: null };
    });
    const db = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'teacher-1', session_id: 'session-1' } },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null }),
      },
      rpc,
    };
    const result = await kickGoogleMeetSync(db as never, {
      provider: provider() as never,
      maxJobs: 1,
    });
    const settlement = rpc.mock.calls.find(([name]) => name === 'settle_google_meeting_job')?.[1];
    expect(settlement).toMatchObject({ p_revision: job.desired_revision, p_outcome: 'ready' });
    expect(result).toMatchObject({ claimed: 1, settled: 0 });
  });

  it('retries an ambiguous create with the same deterministic event ID after a not-found check', async () => {
    process.env = { ...process.env, ...baseEnv };
    const db = makeDb({ ...job, provider_event_id: 'dars' + 'a'.repeat(64) });
    const google = provider({
      getEvent: vi.fn().mockRejectedValue(new GoogleProviderError('not_found', false)),
      insertEvent: vi.fn().mockResolvedValue(readyEvent),
    });
    await kickGoogleMeetSync(db as never, { provider: google as never, maxJobs: 1 });
    expect(google.getEvent).toHaveBeenCalledWith('access', 'dars' + 'a'.repeat(64));
    expect(google.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: job.connection_id, lessonId: job.lesson_id }),
    );
  });

  it('maps 429 and invalid_grant to safe durable settlement outcomes', async () => {
    process.env = { ...process.env, ...baseEnv };
    const limitedDb = makeDb();
    await kickGoogleMeetSync(limitedDb as never, {
      provider: provider({
        obtainToken: vi
          .fn()
          .mockRejectedValue(new GoogleProviderError('temporarily_unavailable', true)),
      }) as never,
      maxJobs: 1,
    });
    expect(limitedDb.rpc).toHaveBeenCalledWith(
      'settle_google_meeting_job',
      expect.objectContaining({ p_outcome: 'retry', p_error_code: 'google_unavailable' }),
    );

    const revokedDb = makeDb();
    await kickGoogleMeetSync(revokedDb as never, {
      provider: provider({
        obtainToken: vi
          .fn()
          .mockRejectedValue(new GoogleProviderError('reconnect_required', false)),
      }) as never,
      maxJobs: 1,
    });
    expect(revokedDb.rpc).toHaveBeenCalledWith(
      'settle_google_meeting_job',
      expect.objectContaining({
        p_outcome: 'reconnect_required',
        p_error_code: 'google_reconnect_required',
      }),
    );
  });
});
