import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const { rpc, viewer, kick } = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    rpc,
    viewer: { db: { rpc }, user: { id: 'teacher-1' }, sessionId: 'session-1' },
    kick: vi.fn().mockResolvedValue({ claimed: 0, settled: 0 }),
  };
});
vi.mock('@/features/meet/oauth', () => ({
  getVerifiedGoogleViewer: vi.fn(async () => viewer),
  revokeGoogleConnection: vi.fn(),
}));
vi.mock('@/features/meet/worker', () => ({ kickGoogleMeetSync: kick }));
import { disconnectGoogleMeet, manageLessonMeeting, syncGoogleMeet } from '@/features/meet/actions';
import * as meetOAuth from '@/features/meet/oauth';

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

afterEach(() => {
  for (const name of Object.keys(process.env)) delete process.env[name];
  rpc.mockReset();
  kick.mockClear();
  vi.mocked(meetOAuth.revokeGoogleConnection).mockReset();
});

describe('Google Meet management actions', () => {
  it('rejects unsafe manual URLs before calling the owner-bound RPC', async () => {
    process.env = { ...process.env, ...baseEnv };
    const result = await manageLessonMeeting(
      'en',
      'lesson-1',
      'manual',
      'https://name:password@example.com/join',
    );
    expect(result).toEqual({ error: 'meeting_invalid_url' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls only the owner-bound management RPC and kicks durable work after success', async () => {
    process.env = {
      ...process.env,
      APP_ENV: 'staging',
      SUPABASE_EXPECTED_PROJECT_REF: 'dmbepdjwjmuelqcfzjae',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dmbepdjwjmuelqcfzjae.supabase.co',
      GOOGLE_MEET_ENABLED: 'true',
    };
    const meeting = {
      mode: 'manual',
      status: 'ready',
      join_url: 'https://example.com/class',
      error_code: null,
    };
    rpc.mockResolvedValue({ data: meeting, error: null });
    const result = await manageLessonMeeting('en', 'lesson-1', 'manual', meeting.join_url);
    expect(result).toEqual({ data: meeting });
    expect(rpc).toHaveBeenCalledWith('manage_lesson_meeting', {
      p_lesson_id: 'lesson-1',
      p_operation: 'manual',
      p_manual_url: meeting.join_url,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('teacher_id');
    expect(kick).toHaveBeenCalledWith(viewer.db);
  });

  it('provides an explicit authenticated sync and a disconnect path', async () => {
    process.env = { ...process.env, ...baseEnv };
    expect(await syncGoogleMeet()).toEqual({ claimed: 0, settled: 0, error: null });
    expect(await disconnectGoogleMeet()).toEqual({ ok: true });
  });

  it('does not report disconnect success when local credential deletion fails', async () => {
    process.env = { ...process.env, ...baseEnv };
    vi.mocked(meetOAuth.revokeGoogleConnection).mockRejectedValueOnce(
      new Error('sensitive database details'),
    );
    const result = await disconnectGoogleMeet();
    expect(result).toEqual({ error: 'meeting_unavailable' });
    expect(JSON.stringify(result)).not.toContain('sensitive database details');
  });
});
