import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRequestViewer, revalidatePath } = vi.hoisted(() => ({
  getRequestViewer: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer }));
vi.mock('next/cache', () => ({ revalidatePath }));

import { dismissFeedbackPrompt } from '@/features/notifications/actions';

const groupId = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';

describe('dismiss feedback prompt action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses only the group ID for an active student and refreshes their views', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    getRequestViewer.mockResolvedValue({
      user: { id: 'student-id' },
      profile: { role: 'student', status: 'active' },
      db: { rpc },
    });
    const result = await dismissFeedbackPrompt('en', groupId, null, new FormData());
    expect(result).toEqual({ success: 'Review request dismissed.' });
    expect(rpc).toHaveBeenCalledWith('dismiss_feedback_prompt', { p_group_id: groupId });
    expect(revalidatePath).toHaveBeenCalledWith('/en/notifications');
    expect(revalidatePath).toHaveBeenCalledWith('/en/student');
  });

  it('fails closed for malformed IDs, nonstudents, and RPC errors', async () => {
    expect(await dismissFeedbackPrompt('en', 'bad', null, new FormData())).toHaveProperty('error');
    expect(getRequestViewer).not.toHaveBeenCalled();
    getRequestViewer.mockResolvedValue({
      user: { id: 'teacher-id' },
      profile: { role: 'teacher', status: 'active' },
      db: { rpc: vi.fn() },
    });
    expect(await dismissFeedbackPrompt('ar', groupId, null, new FormData())).toHaveProperty(
      'error',
    );
    getRequestViewer.mockResolvedValue({
      user: { id: 'student-id' },
      profile: { role: 'student', status: 'active' },
      db: { rpc: vi.fn().mockResolvedValue({ error: { code: 'XX', message: 'secret' } }) },
    });
    expect(await dismissFeedbackPrompt('ar', groupId, null, new FormData())).toEqual({
      error: 'تعذر إخفاء طلب التقييم. حاول مرة أخرى.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
