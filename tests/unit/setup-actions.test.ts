import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, redirect } = vi.hoisted(() => ({ createClient: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect }));

import { completeSetup, saveSetupStage } from '@/features/setup/actions';

const userId = '11111111-1111-4111-8111-111111111111';

function draft(role: 'teacher' | 'student' = 'teacher', stage = 1, version = 0) {
  return {
    role,
    stage,
    version,
    return_to: `/${role === 'teacher' ? 'en' : 'en'}/${role}`,
    updated_at: '2026-10-17T00:00:00.000Z',
    payload: {},
    baseline: {},
  };
}

function form({
  stage = 1,
  version = 0,
  intent = 'next',
  payload = {},
  returnTo = '/en/teacher',
  file,
}: {
  stage?: number;
  version?: number;
  intent?: string;
  payload?: Record<string, unknown>;
  returnTo?: string;
  file?: File;
} = {}) {
  const data = new FormData();
  data.set('stage', String(stage));
  data.set('version', String(version));
  data.set('intent', intent);
  data.set('return_to', returnTo);
  data.set('payload', JSON.stringify(payload));
  if (file) data.set('cv', file);
  return data;
}

function setup({
  role = 'teacher',
  rpc = vi.fn(),
  upload = vi.fn(async () => ({ error: null })),
}: {
  role?: 'teacher' | 'student';
  rpc?: ReturnType<typeof vi.fn>;
  upload?: ReturnType<typeof vi.fn>;
} = {}) {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role, status: 'active' }, error: null }),
        }),
      }),
    }),
    rpc,
    storage: { from: () => ({ upload }) },
  };
  createClient.mockResolvedValue(client);
  return { client, rpc, upload };
}

beforeEach(() => {
  vi.clearAllMocks();
  redirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

describe('account setup actions', () => {
  it('rejects an unauthenticated identity before any setup RPC', async () => {
    const rpc = vi.fn();
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      rpc,
    });
    const result = await saveSetupStage('en', null, form());
    expect(result).toEqual({ error: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the confirmed version if saving the draft worked but stage movement failed', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: draft('teacher', 1, 8), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'movement failed' } });
    setup({ rpc });
    const result = await saveSetupStage(
      'en',
      null,
      form({ stage: 1, version: 7, payload: { full_name: 'A Name' } }),
    );
    expect(result).toMatchObject({
      error: 'save',
      draft: { role: 'teacher', stage: 1, version: 8 },
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'save_account_setup_stage',
      expect.objectContaining({ p_stage: 1, p_expected_version: 7 }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'save_account_setup_stage',
      expect.objectContaining({ p_stage: 2, p_expected_version: 8, p_payload: {} }),
    );
  });

  it('saves an optional Drive CV URL without uploading files', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: draft('teacher', 4, 12), error: null });
    const upload = vi.fn();
    setup({ rpc, upload });
    const cvUrl = 'https://drive.google.com/file/d/example/view';
    const result = await saveSetupStage(
      'en',
      null,
      form({ stage: 4, version: 11, payload: { cv_url: cvUrl } }),
    );
    expect(result).toMatchObject({ draft: { stage: 4, version: 12 } });
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'save_account_setup_stage',
      expect.objectContaining({ p_payload: { cv_url: cvUrl } }),
    );
  });

  it('returns Save and exit to Account overview while keeping the draft RPC return path intact', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: draft('student', 1, 3), error: null });
    setup({ role: 'student', rpc });
    await expect(
      saveSetupStage(
        'en',
        null,
        form({ stage: 1, version: 2, intent: 'exit', returnTo: '/en/student' }),
      ),
    ).rejects.toThrow('REDIRECT:/en/account');
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      'save_account_setup_stage',
      expect.objectContaining({ p_return_to: '/en/student' }),
    );
  });

  it('chooses the student finalizer from the canonical server role', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { ok: true, destination: '/en/student' }, error: null });
    setup({ role: 'student', rpc });
    await completeSetup('en', 5, '/en/student');
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      'complete_student_account_setup',
      expect.objectContaining({ p_expected_version: 5 }),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      'complete_teacher_account_setup_with_rules',
      expect.anything(),
    );
  });

  it('chooses the teacher finalizer from the canonical server role and returns application status', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, destination: '/en/teacher', application: {} },
      error: null,
    });
    setup({ role: 'teacher', rpc });
    const denied = await completeSetup('en', 9, '/en/teacher');
    expect(denied).toEqual({ error: 'teacher-rules' });
    expect(rpc).not.toHaveBeenCalled();
    const result = await completeSetup('en', 9, '/en/teacher', true);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      'complete_teacher_account_setup_with_rules',
      expect.objectContaining({ p_expected_version: 9, p_rules_version: '2026-10-18' }),
    );
    expect(result).toEqual({ destination: '/en/teacher' });
  });
});
