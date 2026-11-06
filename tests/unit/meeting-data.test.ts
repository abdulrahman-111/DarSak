import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { groupMeetingSettings, lessonMeetingSettings, meetingLinks } from '@/features/lessons/data';

const client = (data: unknown, error: unknown = null) => ({
  rpc: vi.fn().mockResolvedValue({ data, error }),
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('private meeting server data', () => {
  it('drops structurally safe but unlisted direct RPC URLs and malformed rows', async () => {
    const db = client([
      { lesson_id: 'lesson-1', meeting_url: 'https://meet.google.com/room' },
      { lesson_id: 'lesson-2', meeting_url: 'https://unlisted.example/room' },
      { lesson_id: 'lesson-3', meeting_url: 'not a URL' },
      { meeting_url: 'https://meet.google.com/missing-id' },
    ]);

    await expect(meetingLinks(db, ['lesson-1', 'lesson-2', 'lesson-3'])).resolves.toEqual({
      'lesson-1': 'https://meet.google.com/room',
    });
  });

  it('accepts only exact server-configured extra hosts', async () => {
    vi.stubEnv('MEETING_HOSTS_EXTRA', 'class.example.test');
    const db = client([
      { lesson_id: 'lesson-1', meeting_url: 'https://class.example.test/room' },
      { lesson_id: 'lesson-2', meeting_url: 'https://sub.class.example.test/room' },
    ]);

    await expect(meetingLinks(db, ['lesson-1', 'lesson-2'])).resolves.toEqual({
      'lesson-1': 'https://class.example.test/room',
    });
  });

  it('fails closed on RPC errors and invalid owner prefill values', async () => {
    await expect(
      meetingLinks(client(null, new Error('RPC failed')), ['lesson-1']),
    ).resolves.toEqual({});
    await expect(groupMeetingSettings(client(null), 'group-1')).resolves.toBeNull();
    await expect(groupMeetingSettings(client({}), 'group-1')).resolves.toBeNull();
    await expect(
      groupMeetingSettings(client({ meeting_url: 'https://unlisted.example/room' }), 'group-1'),
    ).resolves.toBeNull();
    await expect(lessonMeetingSettings(client({ meeting_url: null }), 'lesson-1')).resolves.toEqual(
      { meeting_url: null },
    );
  });
});
