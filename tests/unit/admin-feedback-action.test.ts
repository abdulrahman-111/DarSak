import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminActor, revalidatePath } = vi.hoisted(() => ({
  getAdminActor: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@admin/lib/access', () => ({ getAdminActor }));
vi.mock('next/cache', () => ({ revalidatePath }));

import { moderateFeedback } from '@admin/features/admin/feedback-actions';

const id = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';

function form(decision: string, reason = '', note = 'private note') {
  const value = new FormData();
  value.set('version', '2');
  value.set('decision', decision);
  value.set('student_reason', reason);
  value.set('admin_note', note);
  return value;
}

describe('admin feedback moderation action', () => {
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    getAdminActor.mockResolvedValue({ id: 'admin-id', db: { rpc } });
  });

  it.each(['approve', 'hide', 'approve_reply', 'hide_reply'])(
    'calls the canonical wrapper for %s',
    async decision => {
      const reason = decision === 'hide' ? 'Publication guidelines' : '';
      const result = await moderateFeedback('en', id, null, form(decision, reason));
      expect(result).toMatchObject({ success: expect.any(String), version: 3 });
      expect(rpc).toHaveBeenCalledWith('moderate_group_feedback_with_reason', {
        p_id: id,
        p_decision: decision,
        p_note: 'private note',
        p_expected_version: 2,
        p_student_reason: reason,
      });
      expect(revalidatePath).toHaveBeenCalledWith('/en/admin/feedback');
    },
  );

  it('requires a trimmed 1..500 character public hide reason and keeps it separate from the note', async () => {
    expect(await moderateFeedback('en', id, null, form('hide', '   '))).toHaveProperty('error');
    expect(rpc).not.toHaveBeenCalled();
    expect(await moderateFeedback('en', id, null, form('hide', 'x'.repeat(501)))).toHaveProperty(
      'error',
    );
    expect(rpc).not.toHaveBeenCalled();
    await moderateFeedback(
      'en',
      id,
      null,
      form('hide', '  A public reason  ', 'PRIVATE ADMIN NOTE'),
    );
    expect(rpc).toHaveBeenCalledWith(
      'moderate_group_feedback_with_reason',
      expect.objectContaining({
        p_student_reason: 'A public reason',
        p_note: 'PRIVATE ADMIN NOTE',
      }),
    );
  });

  it('does not call the RPC without an admin actor and never revalidates a failed moderation', async () => {
    getAdminActor.mockResolvedValueOnce(null);
    expect(await moderateFeedback('ar', id, null, form('approve'))).toHaveProperty('error');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'private error' } });
    expect(await moderateFeedback('en', id, null, form('approve'))).toHaveProperty('error');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
