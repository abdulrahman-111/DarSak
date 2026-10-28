import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMock, redirectMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@admin/lib/access', () => ({ getAdminAccess: accessMock }));

import { enrollMfaAction, verifyMfaAction } from '@admin/app/[locale]/mfa/actions';

const factorId = '55555555-5555-4555-8555-555555555555';
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ locale: 'en', ...values })) data.set(key, value);
  return data;
}
async function run(action: (data: FormData) => Promise<void>, data: FormData) {
  try {
    await action(data);
  } catch (error) {
    return (error as Error).message;
  }
  return 'no redirect';
}
function pending(status: string, verifyError = false) {
  const challengeAndVerify = vi.fn(async () => ({
    data: {},
    error: verifyError ? { message: 'bad' } : null,
  }));
  const listFactors = vi.fn(async () => ({
    data: { totp: [{ id: factorId, status: 'verified' }] },
    error: null,
  }));
  accessMock.mockResolvedValue({
    status,
    actor: { db: { auth: { mfa: { challengeAndVerify, listFactors } } } },
  });
  return { challengeAndVerify };
}
beforeEach(() => {
  accessMock.mockReset();
  redirectMock.mockClear();
});

describe('MFA actions', () => {
  it('enrolment verifies a 6-digit code and continues to the portal', async () => {
    const { challengeAndVerify } = pending('mfa-enroll');
    expect(await run(enrollMfaAction, form({ factorId, code: '123 456' }))).toBe(
      'REDIRECT:/en/admin',
    );
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId, code: '123456' });
  });

  it('rejects malformed codes without calling Supabase', async () => {
    const { challengeAndVerify } = pending('mfa-enroll');
    expect(await run(enrollMfaAction, form({ factorId, code: '12ab56' }))).toBe(
      'REDIRECT:/en/mfa/enroll?error=code',
    );
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });

  it('a wrong verification code stays on the verify page', async () => {
    pending('mfa-verify', true);
    expect(await run(verifyMfaAction, form({ code: '000000' }))).toBe(
      'REDIRECT:/en/mfa/verify?error=code',
    );
  });

  it('verification succeeds with the verified factor', async () => {
    const { challengeAndVerify } = pending('mfa-verify');
    expect(await run(verifyMfaAction, form({ code: '654321' }))).toBe('REDIRECT:/en/admin');
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId, code: '654321' });
  });

  it('refuses callers who are not pending administrators', async () => {
    pending('anonymous');
    expect(await run(verifyMfaAction, form({ code: '654321' }))).toBe('REDIRECT:/en/login');
    expect(await run(enrollMfaAction, form({ factorId, code: '654321' }))).toBe(
      'REDIRECT:/en/login',
    );
  });

  it('does not let an admin who already has a factor enrol another', async () => {
    pending('mfa-verify');
    expect(await run(enrollMfaAction, form({ factorId, code: '654321' }))).toBe(
      'REDIRECT:/en/mfa/verify',
    );
  });
});
