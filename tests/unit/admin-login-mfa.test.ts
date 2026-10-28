import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, redirectMock, headersMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  headersMock: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@admin/lib/supabase/server', () => ({
  createClient: createClientMock,
  isConfigured: () => true,
}));

import { loginAction } from '@admin/app/[locale]/login/actions';

const userId = '44444444-4444-4444-8444-444444444444';
type Options = {
  allowed?: boolean | null;
  throttleError?: boolean;
  signInError?: boolean;
  role?: string;
  current?: 'aal1' | 'aal2';
  next?: 'aal1' | 'aal2';
  aalError?: boolean;
};
function setup(options: Options = {}) {
  const {
    allowed = true,
    throttleError = false,
    signInError = false,
    role = 'admin',
    current = 'aal1',
    next = 'aal1',
    aalError = false,
  } = options;
  const rpc = vi.fn(async (name: string) =>
    name === 'admin_login_allowed'
      ? throttleError
        ? { data: null, error: { message: 'missing function' } }
        : { data: allowed, error: null }
      : { data: null, error: null },
  );
  const signInWithPassword = vi.fn(async () => ({
    data: {},
    error: signInError ? { message: 'Invalid login credentials' } : null,
  }));
  const signOut = vi.fn(async () => ({ error: null }));
  const db = {
    rpc,
    auth: {
      signInWithPassword,
      signOut,
      getUser: async () => ({
        data: { user: { id: userId, email: 'a@example.test' } },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () =>
          aalError
            ? { data: null, error: { message: 'boom' } }
            : { data: { currentLevel: current, nextLevel: next }, error: null },
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role, status: 'active', full_name: 'A' },
            error: null,
          }),
        }),
      }),
    }),
  };
  createClientMock.mockResolvedValue(db);
  return { db, rpc, signInWithPassword, signOut };
}
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  const values = { locale: 'en', email: 'a@example.test', password: 'pw', ...extra };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
async function run(data = form()) {
  try {
    await loginAction(data);
  } catch (error) {
    return (error as Error).message;
  }
  return 'no redirect';
}

beforeEach(() => {
  createClientMock.mockReset();
  redirectMock.mockClear();
  headersMock.mockReset();
  headersMock.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }));
});

describe('admin login flow', () => {
  it('sends an admin without a verified factor to enrolment', async () => {
    setup({ current: 'aal1', next: 'aal1' });
    expect(await run()).toBe('REDIRECT:/en/mfa/enroll');
  });

  it('sends an admin with a factor but an aal1 session to verification', async () => {
    setup({ current: 'aal1', next: 'aal2' });
    expect(await run()).toBe('REDIRECT:/en/mfa/verify');
  });

  it('continues to the portal only at aal2', async () => {
    setup({ current: 'aal2', next: 'aal2' });
    expect(await run()).toBe('REDIRECT:/en/admin');
  });

  it('signs out when the assurance level cannot be determined', async () => {
    const { signOut } = setup({ aalError: true });
    expect(await run()).toBe('REDIRECT:/en/login?error=unavailable');
    expect(signOut).toHaveBeenCalled();
  });

  it('rejects non-admin accounts without offering MFA', async () => {
    const { signOut } = setup({ role: 'student' });
    expect(await run()).toBe('REDIRECT:/en/login?error=admin-only');
    expect(signOut).toHaveBeenCalled();
  });

  it('shows the generic error and never attempts sign-in when throttled', async () => {
    const { signInWithPassword, rpc } = setup({ allowed: false });
    expect(await run()).toBe('REDIRECT:/en/login?error=credentials');
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('admin_login_allowed', {
      p_email: 'a@example.test',
      p_ip: '203.0.113.5',
    });
  });

  it('records a failure and shows the same generic error for a wrong password', async () => {
    const { rpc } = setup({ signInError: true });
    expect(await run()).toBe('REDIRECT:/en/login?error=credentials');
    expect(rpc).toHaveBeenCalledWith('admin_login_record_failure', {
      p_email: 'a@example.test',
      p_ip: '203.0.113.5',
    });
  });

  it('fails open when the limiter is unavailable so the admin is not locked out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setup({ throttleError: true, current: 'aal2', next: 'aal2' });
    expect(await run()).toBe('REDIRECT:/en/admin');
  });

  it('rejects empty credentials before touching Supabase', async () => {
    expect(await run(form({ password: '' }))).toBe('REDIRECT:/en/login?error=credentials');
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
