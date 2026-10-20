import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { adminAction, decideTeacherReview } from '@/features/admin/actions';
import { teacherReviewDecisionSchema, teacherReviewListSchema } from '@/features/admin/domain';
import {
  adminTeacherReviews,
  canonicalTeacherReviewStatus,
  normalizeReviewPage,
  peopleTeacherMetadata,
} from '@/features/admin/review-data';

const teacherId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
function form(value: Record<string, string>) {
  const data = new FormData();
  for (const [key, item] of Object.entries(value)) data.set(key, item);
  return data;
}
function setup({ rpcError }: { rpcError?: { message: string } | null } = {}) {
  const rpc = vi.fn(async () => ({ data: eventId, error: rpcError ?? null }));
  createClientMock.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: '44444444-4444-4444-8444-444444444444' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'admin', status: 'active' }, error: null }),
        }),
      }),
    }),
    rpc,
  });
  return { rpc };
}
beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe('explicit teacher review decisions', () => {
  it('does not treat the old checkbox value as an approval decision', async () => {
    const { rpc } = setup();
    const result = await decideTeacherReview(
      'en',
      null,
      form({
        teacher_id: teacherId,
        expected_request_id: requestId,
        decision: 'yes',
        approved: 'yes',
      }),
    );
    expect(result?.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sends the pending request token with an explicit approval and clears no account status', async () => {
    const { rpc } = setup();
    const result = await decideTeacherReview(
      'en',
      null,
      form({ teacher_id: teacherId, expected_request_id: requestId, decision: 'approved' }),
    );
    expect(rpc).toHaveBeenCalledWith('admin_decide_teacher_review', {
      p_teacher_id: teacherId,
      p_expected_request_id: requestId,
      p_decision: 'approved',
      p_reason: null,
    });
    expect(result).toMatchObject({ success: expect.stringMatching(/approved/i), eventId });
  });
  it('keeps account suspension independent even if the old approval checkbox is submitted', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: '44444444-4444-4444-8444-444444444444' } } }),
      },
      from: () => ({
        select: () => ({
          eq: (_field: string, id: string) => ({
            single: async () => ({
              data:
                id === '11111111-1111-4111-8111-111111111111'
                  ? { id, role: 'teacher' }
                  : { role: 'admin', status: 'active' },
              error: null,
            }),
          }),
        }),
      }),
      rpc,
    });
    await adminAction(
      'en',
      'user',
      null,
      form({ id: teacherId, status: 'suspended', approved: 'yes' }),
    );
    expect(rpc).toHaveBeenCalledWith('admin_update_user', {
      p_user_id: teacherId,
      p_status: 'suspended',
      p_approved: null,
    });
  });
  it('requires and trims a bounded decline reason', async () => {
    const { rpc } = setup();
    const empty = await decideTeacherReview(
      'en',
      null,
      form({
        teacher_id: teacherId,
        expected_request_id: requestId,
        decision: 'declined',
        reason: '  ',
      }),
    );
    expect(empty?.fieldError).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    const long = teacherReviewDecisionSchema.safeParse({
      teacher_id: teacherId,
      expected_request_id: requestId,
      decision: 'declined',
      reason: 'r'.repeat(1001),
    });
    expect(long.success).toBe(false);
  });
  it('returns localized stale feedback for a competing decision', async () => {
    setup({ rpcError: { message: '40001 serialization failure: request is no longer pending' } });
    const result = await decideTeacherReview(
      'ar',
      null,
      form({ teacher_id: teacherId, expected_request_id: requestId, decision: 'approved' }),
    );
    expect(result?.error).toMatch(/تغيرت حالة الطلب/);
  });
});

describe('teacher review list contracts', () => {
  it('normalizes bounded list arguments and rejects out of range input', () => {
    expect(
      teacherReviewListSchema.parse({
        status: 'pending',
        query: ' Ada ',
        offset: '30',
        limit: '30',
      }),
    ).toEqual({ status: 'pending', query: 'Ada', offset: 30, limit: 30 });
    expect(
      teacherReviewListSchema.safeParse({ status: 'invalid', query: '', offset: -1, limit: 101 })
        .success,
    ).toBe(false);
  });
  it('uses the RPC count independently of the returned page and reports query errors', async () => {
    const page = {
      rows: [
        {
          teacher_id: teacherId,
          full_name: 'Ada',
          headline: null,
          account_status: 'active',
          status: 'pending',
          request_id: requestId,
          requested_at: '2026-10-12T00:00:00Z',
          reviewed_at: null,
        },
      ],
      total: 47,
    };
    expect(normalizeReviewPage(page)?.total).toBe(47);
    const db = { rpc: vi.fn(async () => ({ data: page, error: null })) };
    await expect(
      adminTeacherReviews(db, { status: 'pending', query: 'Ada', offset: 30, limit: 30 }),
    ).resolves.toMatchObject({ total: 47, error: null });
    expect(db.rpc).toHaveBeenCalledWith('admin_teacher_reviews', {
      p_status: 'pending',
      p_query: 'Ada',
      p_offset: 30,
      p_limit: 30,
    });
    const failed = await adminTeacherReviews(
      { rpc: async () => ({ data: null, error: { message: 'offline' } }) },
      { status: 'pending', query: '', offset: 0, limit: 30 },
    );
    expect(failed).toMatchObject({ rows: [], total: 0, error: 'offline' });
  });
});

describe('People teacher review metadata', () => {
  it('uses canonical declined status instead of inferring pending from approved=false', () => {
    expect(canonicalTeacherReviewStatus('declined')).toBe('declined');
    expect(canonicalTeacherReviewStatus('pending')).toBe('pending');
    expect(canonicalTeacherReviewStatus('approved')).toBe('approved');
    expect(canonicalTeacherReviewStatus(undefined)).toBeNull();
  });
  it('loads teacher metadata only for the current page IDs', async () => {
    const currentPageIds = [teacherId, '55555555-5555-4555-8555-555555555555'];
    const inCalls: Array<{ table: string; column: string; ids: string[] }> = [];
    const db = {
      from: (table: string) => ({
        select: () => ({
          in: async (column: string, ids: string[]) => {
            inCalls.push({ table, column, ids });
            return table === 'teacher_profiles'
              ? { data: [{ id: teacherId, headline: 'Tutor' }], error: null }
              : { data: [{ teacher_id: teacherId, status: 'declined' }], error: null };
          },
        }),
      }),
    };
    const result = await peopleTeacherMetadata(db, currentPageIds);
    expect(inCalls).toEqual([
      { table: 'teacher_profiles', column: 'id', ids: currentPageIds },
      { table: 'teacher_review_state', column: 'teacher_id', ids: currentPageIds },
    ]);
    expect(canonicalTeacherReviewStatus(result.reviews[0]?.status)).toBe('declined');
  });
});
