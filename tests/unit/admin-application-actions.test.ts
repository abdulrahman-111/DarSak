import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({ createClientMock: vi.fn(), revalidatePathMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { createTeacherApplicationCvLink, requestTeacherApplicationChanges } from '@/features/admin/application-actions';

const teacherId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
function form(values: Record<string, string>) { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }
function setup({ rpcError = null, appStatus = 'submitted' }: { rpcError?: { message: string; code?: string } | null; appStatus?: string } = {}) {
  const rpc = vi.fn(async (name: string) => name === 'read_teacher_application'
    ? { data: { application: { teacher_id: teacherId, status: appStatus, teaching_years: 1, admin_phone: '1234567', cv_path: `${teacherId}/cv.pdf`, supporting_links: [], attested: true, snapshot: { cv_path: `${teacherId}/cv.pdf` }, feedback: null, submitted_at: '2026-10-01', reviewed_at: null, reviewed_by: null, updated_at: '2026-10-01', legacy_approved: false }, missing: [] }, error: null }
    : { data: null, error: rpcError });
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example/signed?expires=60' }, error: null }));
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'admin', status: 'active' }, error: null }) }) }) }),
    rpc,
    storage: { from: () => ({ createSignedUrl }) },
  });
  return { rpc, createSignedUrl };
}

beforeEach(() => { createClientMock.mockReset(); revalidatePathMock.mockReset(); });

describe('admin teacher application actions', () => {
  it('uses the exact changes RPC with the current pending request token and reason', async () => {
    const { rpc } = setup();
    const result = await requestTeacherApplicationChanges('en', null, form({ teacher_id: teacherId, expected_request_id: requestId, reason: 'Please add the qualification year.' }));
    expect(rpc).toHaveBeenCalledWith('request_teacher_application_changes', { p_teacher_id: teacherId, p_expected_request_id: requestId, p_reason: 'Please add the qualification year.' });
    expect(result?.success).toContain('Changes requested');
  });

  it('requires a reason and does not call the RPC when it is empty', async () => {
    const { rpc } = setup();
    const result = await requestTeacherApplicationChanges('en', null, form({ teacher_id: teacherId, expected_request_id: requestId, reason: '  ' }));
    expect(result?.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps the PT409 stale token code to refresh guidance', async () => {
    setup({ rpcError: { code: 'PT409', message: 'request conflict' } });
    const result = await requestTeacherApplicationChanges('en', null, form({ teacher_id: teacherId, expected_request_id: requestId, reason: 'Please update the qualification.' }));
    expect(result?.error).toContain('application changed');
  });

  it('creates only a 60 second attachment link for the submitted private PDF', async () => {
    const { rpc, createSignedUrl } = setup();
    const result = await createTeacherApplicationCvLink('en', null, form({ teacher_id: teacherId }));
    expect(rpc).toHaveBeenCalledWith('read_teacher_application', { p_teacher_id: teacherId });
    expect(createSignedUrl).toHaveBeenCalledWith(`${teacherId}/cv.pdf`, 60, { download: true });
    expect(result?.url).toContain('expires=60');
  });

  it('does not sign draft CV paths', async () => {
    const { createSignedUrl } = setup({ appStatus: 'draft' });
    const result = await createTeacherApplicationCvLink('en', null, form({ teacher_id: teacherId }));
    expect(result?.error).toBeTruthy();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
