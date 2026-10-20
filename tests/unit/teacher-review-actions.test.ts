import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { requestTeacherReview } from '@/features/teacher/review-actions';
import { parseTeacherReviewStatus, reviewStatusCopy } from '@/features/teacher/review-data';

const teacherId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const base = {
  teacher_id: teacherId,
  request_id: requestId,
  requested_at: '2026-10-11T12:00:00Z',
  reviewed_at: null,
  decline_reason: null,
  events: [],
};
function setup({
  status = 'declined',
  account = { role: 'teacher', status: 'active' },
  requestError = null,
}: {
  status?: string;
  account?: { role: string; status: string };
  requestError?: { message: string } | null;
} = {}) {
  const rpc = vi.fn(async (name: string) =>
    name === 'teacher_review_status'
      ? { data: { ...base, status }, error: null }
      : { data: requestId, error: requestError },
  );
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: account, error: null }) }) }),
    }),
    rpc,
  });
  return { rpc };
}
beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe('teacher review resubmission', () => {
  it('returns the existing pending state without creating another request event', async () => {
    const { rpc } = setup({ status: 'pending' });
    const result = await requestTeacherReview('en', null, new FormData());
    expect(result?.success).toMatch(/already awaiting review/i);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('teacher_review_status', { p_teacher_id: teacherId });
  });
  it('resubmits only after decline and sends no owner or address fields', async () => {
    const { rpc } = setup({ status: 'declined' });
    const result = await requestTeacherReview('en', null, new FormData());
    expect(rpc).toHaveBeenNthCalledWith(2, 'request_teacher_review');
    expect(result?.success).toMatch(/request was submitted/i);
  });
  it('requires a live active teacher and does not call the review RPC for suspended actors', async () => {
    const { rpc } = setup({ account: { role: 'teacher', status: 'suspended' } });
    const result = await requestTeacherReview('ar', null, new FormData());
    expect(result?.error).toMatch(/النشط فقط/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('teacher review status display data', () => {
  it('accepts the safe owner projection and localizes its review state', () => {
    const status = parseTeacherReviewStatus({
      ...base,
      status: 'declined',
      decline_reason: 'Add your teaching experience.',
      events: [
        {
          id: requestId,
          request_id: requestId,
          kind: 'requested',
          reason: null,
          created_at: base.requested_at,
        },
      ],
    });
    expect(status?.status).toBe('declined');
    expect(reviewStatusCopy('en', status!).copy.declinedTitle).toMatch(/declined/i);
    expect(parseTeacherReviewStatus({ status: 'pending' })).toBeNull();
  });
});
