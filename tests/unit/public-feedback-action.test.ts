import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { feedbackAction } from '@/features/feedback/actions';

describe('public feedback action boundary', () => {
  beforeEach(() => createClientMock.mockReset());

  it('rejects a forged moderation kind before creating a client or calling an RPC', async () => {
    const rpc = vi.fn();
    createClientMock.mockResolvedValue({ rpc });
    const result = await feedbackAction(
      'en',
      'moderate' as never,
      '11111111-1111-4111-8111-111111111111',
      null,
      new FormData(),
    );
    expect(result?.error).toBe('Invalid feedback action.');
    expect(createClientMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows a verified active teacher to reply and sends only the teacher RPC', async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));
    const maybeSingle = vi.fn(async () => ({
      data: { role: 'teacher', status: 'active' },
      error: null,
    }));
    const db = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'teacher-id' } } })) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
      rpc,
    };
    createClientMock.mockResolvedValue(db);
    const data = new FormData();
    data.set('version', '1');
    data.set('reply', 'A useful reply');
    const result = await feedbackAction(
      'en',
      'reply',
      '11111111-1111-4111-8111-111111111111',
      null,
      data,
    );
    expect(result?.success).toContain('Saved');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('teacher_reply_feedback', {
      p_id: '11111111-1111-4111-8111-111111111111',
      p_reply: 'A useful reply',
      p_expected_version: 1,
    });
  });
});
