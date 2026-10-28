vi.mock('@/features/monitoring/server', () => ({
  observeOperation: (_operation: unknown, _locale: unknown, run: () => unknown) => run(),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  getVerifiedUserMock,
  getVerifiedRecoveryUserMock,
  isConfiguredMock,
  redirectMock,
  afterMock,
  onboardingDestinationMock,
  signupAvailabilityMock,
  recoveryCookieDeleteMock,
  isolatedClientMock,
  requestOriginMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getVerifiedUserMock: vi.fn(),
  getVerifiedRecoveryUserMock: vi.fn(),
  isConfiguredMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  afterMock: vi.fn(),
  onboardingDestinationMock: vi.fn(
    async (_db: unknown, _userId: string, _role: string, _locale: string, fallback: string) =>
      fallback,
  ),
  signupAvailabilityMock: vi.fn(
    async (): Promise<{ data: boolean | null; error: { message: string } | null }> => ({
      data: false,
      error: null,
    }),
  ),
  recoveryCookieDeleteMock: vi.fn(),
  isolatedClientMock: vi.fn(),
  requestOriginMock: { value: 'https://dars.example' as string | null },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: isolatedClientMock }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ delete: recoveryCookieDeleteMock }),
  headers: async () =>
    new Headers(requestOriginMock.value === null ? undefined : { origin: requestOriginMock.value }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  getVerifiedUser: getVerifiedUserMock,
  getVerifiedRecoveryUser: getVerifiedRecoveryUserMock,
  isConfigured: isConfiguredMock,
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: afterMock }));
vi.mock('@/features/setup/destination', () => ({
  resolveSetupDestination: onboardingDestinationMock,
}));

import {
  changePasswordAction,
  chooseGoogleRoleAction,
  forgotPasswordAction,
  googleSignInAction,
  loginAction,
  resendConfirmationAction,
  resetPasswordAction,
  signupAction,
  verifySignupCodeAction,
} from '@/features/auth/actions';

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
function signupClient(auth: Record<string, unknown>) {
  return { auth, rpc: signupAvailabilityMock };
}
const signup = {
  fullName: 'Sara Ali',
  email: 'sara@example.com',
  password: 'password123',
  role: 'student',
};
const redirectTarget = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return (error as Error).message.replace('NEXT_REDIRECT:', '');
  }
  return null;
};

describe('auth actions', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    getVerifiedUserMock.mockReset();
    getVerifiedRecoveryUserMock.mockReset();
    isolatedClientMock.mockReset();
    recoveryCookieDeleteMock.mockReset();
    redirectMock.mockClear();
    afterMock.mockReset();
    signupAvailabilityMock.mockReset().mockResolvedValue({ data: false, error: null });
    onboardingDestinationMock
      .mockReset()
      .mockImplementation(async (_db, _userId, _role, _locale, fallback) => fallback);
    isConfiguredMock.mockReturnValue(true);
    requestOriginMock.value = 'https://dars.example';
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dars.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('loginAction', () => {
    it('clears only the local public session when an administrator uses public sign-in', async () => {
      const signOut = vi.fn(async () => ({ error: null }));
      const maybeSingle = vi.fn(async () => ({
        data: { role: 'admin', status: 'active' },
        error: null,
      }));
      createClientMock.mockResolvedValue({
        auth: {
          signInWithPassword: async () => ({ data: { user: { id: 'admin-id' } }, error: null }),
          signOut,
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
      });
      expect(
        await redirectTarget(() =>
          loginAction('en', null, form({ email: 'admin@example.com', password: 'password123' })),
        ),
      ).toBe('/en/login?error=admin-portal');
      expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('returns a generic message for invalid_credentials', async () => {
      createClientMock.mockResolvedValue({
        auth: {
          signInWithPassword: async () => ({ data: {}, error: { code: 'invalid_credentials' } }),
        },
      });
      const result = await loginAction('en', null, form({ email: 'a@b.co', password: 'x' }));
      expect(result).toEqual({
        error: 'Unable to sign in. Check your credentials and try again.',
        email: 'a@b.co',
      });
      expect(JSON.stringify(result)).not.toContain('"password"');
    });

    it('points unconfirmed accounts to the resend page', async () => {
      createClientMock.mockResolvedValue({
        auth: {
          signInWithPassword: async () => ({ data: {}, error: { code: 'email_not_confirmed' } }),
        },
      });
      const result = await loginAction('ar', null, form({ email: 'a@b.co', password: 'x' }));
      expect(result?.resendHref).toBe('/ar/check-email?email=a%40b.co');
    });

    it('passes the captcha token only when present', async () => {
      const signIn = vi.fn(async () => ({ data: {}, error: { code: 'captcha_failed' } }));
      createClientMock.mockResolvedValue({ auth: { signInWithPassword: signIn } });
      await loginAction(
        'en',
        null,
        form({ email: 'a@b.co', password: 'x', 'cf-turnstile-response': 'tok' }),
      );
      expect(signIn).toHaveBeenLastCalledWith({
        email: 'a@b.co',
        password: 'x',
        options: { captchaToken: 'tok' },
      });
      await loginAction('en', null, form({ email: 'a@b.co', password: 'x' }));
      expect(signIn).toHaveBeenLastCalledWith({ email: 'a@b.co', password: 'x', options: {} });
    });

    it('sends active student sign-ins through the shared setup resolver while preserving safe return paths', async () => {
      const maybeSingle = vi.fn(async () => ({
        data: { role: 'student', status: 'active' },
        error: null,
      }));
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      const db = {
        auth: { signInWithPassword: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
        from: () => ({ select }),
      };
      createClientMock.mockResolvedValue(db);
      onboardingDestinationMock.mockResolvedValue(
        '/en/account/setup?returnTo=%2Fen%2Fclasses%2F00000000-0000-4000-8000-000000000000',
      );
      expect(
        await redirectTarget(() =>
          loginAction(
            'en',
            null,
            form({
              email: 'a@b.co',
              password: 'password123',
              next: '/en/classes/00000000-0000-4000-8000-000000000000',
            }),
          ),
        ),
      ).toBe('/en/account/setup?returnTo=%2Fen%2Fclasses%2F00000000-0000-4000-8000-000000000000');
      expect(onboardingDestinationMock).toHaveBeenCalledWith(
        db,
        'u1',
        'student',
        'en',
        '/en/classes/00000000-0000-4000-8000-000000000000',
      );
    });

    it('rejects unknown locales before touching Supabase', async () => {
      const result = await loginAction('fr', null, form({ email: 'a@b.co', password: 'x' }));
      expect(result?.error).toBe('Invalid language');
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('signupAction', () => {
    it('sends emailRedirectTo and the captcha token, then redirects to check-email without a session', async () => {
      const signUp = vi.fn(async () => ({ data: { session: null }, error: null }));
      createClientMock.mockResolvedValue(signupClient({ signUp }));
      const target = await redirectTarget(() =>
        signupAction('en', null, form({ ...signup, 'cf-turnstile-response': 'tok' })),
      );
      expect(target).toBe('/en/check-email?email=sara%40example.com');
      expect(signUp).toHaveBeenCalledWith({
        email: signup.email,
        password: signup.password,
        options: {
          data: { full_name: 'Sara Ali', requested_role: 'student' },
          emailRedirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard',
          captchaToken: 'tok',
        },
      });
      // No public email lookup: that would let anyone test which emails have accounts.
      expect(signupAvailabilityMock).not.toHaveBeenCalled();
    });

    it('answers an existing email (empty identities) with the same redirect as a new signup', async () => {
      const runWith = async (data: Record<string, unknown>) => {
        createClientMock.mockResolvedValue(
          signupClient({ signUp: async () => ({ data, error: null }) }),
        );
        return redirectTarget(() => signupAction('en', null, form({ ...signup, role: 'teacher' })));
      };
      const newSignup = await runWith({
        user: { id: 'new-id', identities: [{ provider: 'email' }] },
        session: null,
      });
      afterMock.mockReset();
      const existing = await runWith({ user: { identities: [] }, session: null });
      expect(newSignup).toBe('/en/check-email?email=sara%40example.com');
      expect(existing).toBe(newSignup);
      // Nothing is sent for an existing account, so the outbox flush is skipped.
      expect(afterMock).not.toHaveBeenCalled();
      expect(signupAvailabilityMock).not.toHaveBeenCalled();
    });

    it('handles the unique-email race errors as an existing account', async () => {
      const signUp = vi.fn(async () => ({ data: {}, error: { code: 'email_exists' } }));
      createClientMock.mockResolvedValue(signupClient({ signUp }));
      expect((await signupAction('ar', null, form(signup)))?.error).toBe(
        'هذا البريد الإلكتروني مسجّل بالفعل. سجّل الدخول أو أعد تعيين كلمة المرور.',
      );
    });

    it('handles Supabase fake existing-user responses with an empty identities list', async () => {
      const signUp = vi.fn(async () => ({
        data: { user: { identities: [] }, session: null },
        error: null,
      }));
      createClientMock.mockResolvedValue(signupClient({ signUp }));
      expect(
        await redirectTarget(() => signupAction('en', null, form({ ...signup, role: 'teacher' }))),
      ).toBe('/en/check-email?email=sara%40example.com');
      expect(afterMock).not.toHaveBeenCalled();
    });

    it('goes to the dashboard when a session is returned', async () => {
      createClientMock.mockResolvedValue(
        signupClient({ signUp: async () => ({ data: { session: {} }, error: null }) }),
      );
      expect(await redirectTarget(() => signupAction('ar', null, form(signup)))).toBe(
        '/ar/dashboard',
      );
    });

    it('routes immediate-session signups through setup when confirmation is disabled', async () => {
      const maybeSingle = vi.fn(async () => ({
        data: { role: 'teacher', status: 'active' },
        error: null,
      }));
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      const db = {
        auth: { signUp: async () => ({ data: { session: {}, user: { id: 'u1' } }, error: null }) },
        from: () => ({ select }),
        rpc: vi.fn(async () => ({ data: false, error: null })),
      };
      createClientMock.mockResolvedValue(db);
      onboardingDestinationMock.mockResolvedValue('/en/account/setup?returnTo=%2Fen%2Fteacher');
      expect(await redirectTarget(() => signupAction('en', null, form(signup)))).toBe(
        '/en/account/setup?returnTo=%2Fen%2Fteacher',
      );
      expect(onboardingDestinationMock).toHaveBeenCalledWith(
        db,
        'u1',
        'teacher',
        'en',
        '/en/teacher',
      );
    });

    it('schedules a bounded outbox flush after teacher signup succeeds', async () => {
      afterMock.mockReset();
      createClientMock.mockResolvedValue(
        signupClient({
          signUp: async () => ({
            data: { session: null, user: { id: 'teacher-id' } },
            error: null,
          }),
        }),
      );
      expect(
        await redirectTarget(() => signupAction('en', null, form({ ...signup, role: 'teacher' }))),
      ).toBe('/en/check-email?email=sara%40example.com');
      expect(afterMock).toHaveBeenCalledOnce();
    });

    it('maps already-registered and weak-password errors', async () => {
      createClientMock.mockResolvedValue(
        signupClient({
          signUp: async () => ({ data: {}, error: { code: 'user_already_exists' } }),
        }),
      );
      expect((await signupAction('en', null, form(signup)))?.error).toMatch(/already registered/);
      createClientMock.mockResolvedValue(
        signupClient({ signUp: async () => ({ data: {}, error: { code: 'weak_password' } }) }),
      );
      expect((await signupAction('en', null, form(signup)))?.error).toMatch(/too weak/);
    });

    it('echoes email, name and role (never the password) on error', async () => {
      createClientMock.mockResolvedValue(
        signupClient({
          signUp: async () => ({ data: {}, error: { code: 'email_address_invalid' } }),
        }),
      );
      const result = await signupAction('en', null, form({ ...signup, role: 'teacher' }));
      expect(result).toEqual({
        error: "This email address can't be used. Please use a different email.",
        email: 'sara@example.com',
        fullName: 'Sara Ali',
        role: 'teacher',
      });
      expect(JSON.stringify(result)).not.toContain('password123');
    });

    it('validates input before creating a client', async () => {
      const result = await signupAction('en', null, form({ ...signup, password: 'short' }));
      expect(result?.error).toMatch(/at least 8/);
      expect(result).toMatchObject({
        email: 'sara@example.com',
        fullName: 'Sara Ali',
        role: 'student',
      });
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('forgotPasswordAction', () => {
    const run = (email = 'sara@example.com') => forgotPasswordAction('en', null, form({ email }));

    it('returns the same neutral notice whether or not the account exists', async () => {
      createClientMock.mockResolvedValue({
        auth: { resetPasswordForEmail: async () => ({ data: {}, error: null }) },
      });
      const existing = await run();
      createClientMock.mockResolvedValue({
        auth: {
          resetPasswordForEmail: async () => ({ data: {}, error: { code: 'user_not_found' } }),
        },
      });
      const missing = await run('nobody@example.com');
      expect(missing).toEqual(existing);
      expect(existing?.notice).toMatch(/If an account exists/);
      expect(existing?.error).toBeUndefined();
    });

    it('surfaces rate-limit and captcha errors only', async () => {
      createClientMock.mockResolvedValue({
        auth: {
          resetPasswordForEmail: async () => ({
            data: {},
            error: { code: 'over_email_send_rate_limit' },
          }),
        },
      });
      expect((await run())?.error).toMatch(/Too many attempts/);
      createClientMock.mockResolvedValue({
        auth: {
          resetPasswordForEmail: async () => ({ data: {}, error: { code: 'captcha_failed' } }),
        },
      });
      expect((await run())?.error).toMatch(/Security check/);
    });

    it('surfaces email_address_invalid and keeps the typed email', async () => {
      createClientMock.mockResolvedValue({
        auth: {
          resetPasswordForEmail: async () => ({
            data: {},
            error: { code: 'email_address_invalid' },
          }),
        },
      });
      const result = await run('bad@example.com');
      expect(result?.error).toMatch(/can't be used/);
      expect(result?.email).toBe('bad@example.com');
    });

    it('reports unexpected provider errors without claiming the reset email was sent', async () => {
      createClientMock.mockResolvedValue({
        auth: { resetPasswordForEmail: async () => ({ data: {}, error: { code: 'smtp_failed' } }) },
      });
      const result = await run();
      expect(result?.error).toMatch(/could not confirm.*sent/i);
      expect(result?.notice).toBeUndefined();
    });

    it('redirects the link through the callback to the locale reset page', async () => {
      const reset = vi.fn(async () => ({ data: {}, error: null }));
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: reset } });
      await forgotPasswordAction(
        'ar',
        null,
        form({ email: 'sara@example.com', 'cf-turnstile-response': 'tok' }),
      );
      expect(reset).toHaveBeenCalledWith('sara@example.com', {
        redirectTo: 'https://dars.example/api/auth/callback?next=/ar/reset-password',
        captchaToken: 'tok',
      });
    });

    it('rejects malformed emails without calling Supabase', async () => {
      expect((await run('nope'))?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('verifySignupCodeAction', () => {
    it.each(['123456', '12345678', '1234567890'])(
      'verifies a supported %s-length signup OTP without truncating it',
      async token => {
        const verifyOtp = vi.fn(async () => ({
          data: { session: {}, user: { id: 'student-id' } },
          error: null,
        }));
        const maybeSingle = vi.fn(async () => ({
          data: { role: 'student', status: 'active' },
          error: null,
        }));
        const eq = vi.fn(() => ({ maybeSingle }));
        const select = vi.fn(() => ({ eq }));
        createClientMock.mockResolvedValue({
          auth: { verifyOtp },
          from: vi.fn(() => ({ select })),
        });
        expect(
          await redirectTarget(() =>
            verifySignupCodeAction('en', null, form({ email: 'sara@example.com', token })),
          ),
        ).toBe('/en/student');
        expect(verifyOtp).toHaveBeenCalledWith({
          email: 'sara@example.com',
          token,
          type: 'signup',
        });
        expect(onboardingDestinationMock).toHaveBeenCalledWith(
          expect.anything(),
          'student-id',
          'student',
          'en',
          '/en/student',
        );
      },
    );

    it('returns the same neutral error for invalid or expired codes and never echoes the code', async () => {
      const verifyOtp = vi.fn(async () => ({ data: {}, error: { code: 'otp_expired' } }));
      createClientMock.mockResolvedValue({ auth: { verifyOtp } });
      const result = await verifySignupCodeAction(
        'ar',
        null,
        form({ email: 'sara@example.com', token: '123456' }),
      );
      expect(result).toEqual({
        error: 'تعذر التحقق من هذا الرمز. راجعه وحاول مرة أخرى، أو اطلب رمزًا جديدًا.',
        email: 'sara@example.com',
      });
      expect(JSON.stringify(result)).not.toContain('123456');
    });

    it.each(['12345', '12345678901', '12345x'])(
      'rejects unsupported OTP %s without contacting Supabase',
      async token => {
        const result = await verifySignupCodeAction(
          'en',
          null,
          form({ email: 'sara@example.com', token }),
        );
        expect(result?.error).toMatch(/could not be verified/);
        expect(createClientMock).not.toHaveBeenCalled();
      },
    );

    it('surfaces rate limiting without treating the code as invalid', async () => {
      createClientMock.mockResolvedValue({
        auth: { verifyOtp: async () => ({ data: {}, error: { code: 'over_request_rate_limit' } }) },
      });
      expect(
        (
          await verifySignupCodeAction(
            'en',
            null,
            form({ email: 'sara@example.com', token: '123456' }),
          )
        )?.error,
      ).toMatch(/Too many attempts/);
    });

    it('does not route unless OTP verification returned a session', async () => {
      createClientMock.mockResolvedValue({
        auth: { verifyOtp: async () => ({ data: { user: { id: 'student-id' } }, error: null }) },
      });
      expect(
        (
          await verifySignupCodeAction(
            'en',
            null,
            form({ email: 'sara@example.com', token: '123456' }),
          )
        )?.error,
      ).toMatch(/could not be verified/);
    });
  });

  describe('resetPasswordAction', () => {
    const passwords = (password: string, confirmPassword = password) =>
      form({ password, confirmPassword });

    it('sends unverified users back to forgot-password', async () => {
      getVerifiedUserMock.mockResolvedValue({ id: 'ordinary-user' });
      getVerifiedRecoveryUserMock.mockResolvedValue(null);
      expect(
        await redirectTarget(() => resetPasswordAction('en', null, passwords('password123'))),
      ).toBe('/en/forgot-password');
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('rejects mismatched confirmation and out-of-range passwords', async () => {
      getVerifiedRecoveryUserMock.mockResolvedValue({ id: 'u1' });
      expect(
        (await resetPasswordAction('en', null, passwords('password123', 'password124')))?.error,
      ).toMatch(/do not match/);
      expect((await resetPasswordAction('en', null, passwords('short')))?.error).toMatch(/8 to 72/);
      expect((await resetPasswordAction('en', null, passwords('x'.repeat(73))))?.error).toMatch(
        /8 to 72/,
      );
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('maps same_password and redirects to the dashboard on success', async () => {
      getVerifiedRecoveryUserMock.mockResolvedValue({ id: 'u1' });
      createClientMock.mockResolvedValue({
        auth: { updateUser: async () => ({ data: {}, error: { code: 'same_password' } }) },
      });
      expect((await resetPasswordAction('en', null, passwords('password123')))?.error).toMatch(
        /different/,
      );
      const updateUser = vi.fn(async () => ({ data: {}, error: null }));
      createClientMock.mockResolvedValue({ auth: { updateUser } });
      expect(
        await redirectTarget(() => resetPasswordAction('ar', null, passwords('password123'))),
      ).toBe('/ar/dashboard');
      expect(updateUser).toHaveBeenCalledWith({ password: 'password123' });
      expect(recoveryCookieDeleteMock).toHaveBeenCalledWith('dars-password-recovery');
    });
  });

  describe('changePasswordAction', () => {
    const values = (currentPassword?: string) =>
      form({
        ...(currentPassword !== undefined ? { currentPassword } : {}),
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      });
    it('requires a current password and does not create a client when it is missing', async () => {
      getVerifiedUserMock.mockResolvedValue({ id: 'u1', email: 'trusted@example.com' });
      expect((await changePasswordAction('en', null, values()))?.error).toMatch(
        /Enter your current password/,
      );
      expect(createClientMock).not.toHaveBeenCalled();
      expect(isolatedClientMock).not.toHaveBeenCalled();
    });
    it.each([
      ['current_password_invalid', /current password is incorrect/i],
      ['current_password_required', /Enter your current password/],
      ['reauthentication_needed', /Unable to update your password/],
    ])('maps updateUser error %s without any extra sign-in', async (code, message) => {
      getVerifiedUserMock.mockResolvedValue({ id: 'u1', email: 'trusted@example.com' });
      const signInWithPassword = vi.fn();
      isolatedClientMock.mockReturnValue({ auth: { signInWithPassword, signOut: vi.fn() } });
      const updateUser = vi.fn(async () => ({ data: {}, error: { code } }));
      createClientMock.mockResolvedValue({ auth: { updateUser, signInWithPassword } });
      expect((await changePasswordAction('en', null, values('wrong')))?.error).toMatch(message);
      expect(updateUser).toHaveBeenCalledWith({
        password: 'newpassword123',
        current_password: 'wrong',
      });
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(isolatedClientMock).not.toHaveBeenCalled();
    });
    it('keeps other update errors on their existing mapping', async () => {
      getVerifiedUserMock.mockResolvedValue({ id: 'u1', email: 'trusted@example.com' });
      createClientMock.mockResolvedValue({
        auth: { updateUser: vi.fn(async () => ({ data: {}, error: { code: 'same_password' } })) },
      });
      expect((await changePasswordAction('en', null, values('oldpassword')))?.error).toMatch(
        /different from your current one/i,
      );
    });
    it('verifies through updateUser on the session client and preserves recovery without current password', async () => {
      getVerifiedUserMock.mockResolvedValue({ id: 'u1', email: 'trusted@example.com' });
      const signInWithPassword = vi.fn();
      const updateUser = vi.fn(async () => ({ data: {}, error: null }));
      createClientMock.mockResolvedValue({ auth: { updateUser, signInWithPassword } });
      expect(
        await redirectTarget(() => changePasswordAction('en', null, values('oldpassword'))),
      ).toBe('/en/dashboard');
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(isolatedClientMock).not.toHaveBeenCalled();
      expect(updateUser).toHaveBeenCalledWith({
        password: 'newpassword123',
        current_password: 'oldpassword',
      });
      getVerifiedRecoveryUserMock.mockResolvedValue({ id: 'u1' });
      expect(
        await redirectTarget(() =>
          resetPasswordAction(
            'en',
            null,
            form({ password: 'newpassword123', confirmPassword: 'newpassword123' }),
          ),
        ),
      ).toBe('/en/dashboard');
    });
  });

  describe('resendConfirmationAction', () => {
    it('is neutral for unknown or already-confirmed emails and sends the callback URL', async () => {
      const resend = vi.fn(async () => ({ data: {}, error: { code: 'user_not_found' } }));
      createClientMock.mockResolvedValue({ auth: { resend } });
      const result = await resendConfirmationAction(
        'en',
        null,
        form({ email: 'sara@example.com' }),
      );
      expect(result?.notice).toMatch(/If an account is waiting/);
      expect(result?.error).toBeUndefined();
      expect(resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'sara@example.com',
        options: { emailRedirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard' },
      });
    });

    it('surfaces rate limiting', async () => {
      createClientMock.mockResolvedValue({
        auth: { resend: async () => ({ data: {}, error: { code: 'over_email_send_rate_limit' } }) },
      });
      expect(
        (await resendConfirmationAction('en', null, form({ email: 'sara@example.com' })))?.error,
      ).toMatch(/Too many attempts/);
    });

    it('keeps identity-dependent errors neutral and reports unexpected delivery failures', async () => {
      createClientMock.mockResolvedValue({
        auth: { resend: async () => ({ data: {}, error: { code: 'user_not_found' } }) },
      });
      expect(
        (await resendConfirmationAction('en', null, form({ email: 'sara@example.com' })))?.notice,
      ).toMatch(/If an account is waiting/);
      createClientMock.mockResolvedValue({
        auth: { resend: async () => ({ data: {}, error: { code: 'smtp_failed' } }) },
      });
      expect(
        (await resendConfirmationAction('en', null, form({ email: 'sara@example.com' })))?.error,
      ).toMatch(/could not confirm.*sent/i);
    });
  });

  describe('googleSignInAction', () => {
    it('is inert when Google is not enabled', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', '');
      const result = await googleSignInAction('en', null, form({}));
      expect(result?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('starts OAuth without assigning a role when no role was selected', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      const signInWithOAuth = vi.fn(async () => ({
        data: { url: 'https://accounts.google.com/o/oauth2' },
        error: null,
      }));
      createClientMock.mockResolvedValue({ auth: { signInWithOAuth } });
      expect(
        await redirectTarget(() => googleSignInAction('en', null, form({ next: '//evil.com' }))),
      ).toBe('https://accounts.google.com/o/oauth2');
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard' },
      });
    });

    it('moves alternate-host login attempts to the canonical login before creating a client', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      requestOriginMock.value = 'https://www.dars.example';
      const result = await redirectTarget(() =>
        googleSignInAction(
          'en',
          null,
          form({ next: '/en/classes/00000000-0000-4000-8000-000000000000' }),
        ),
      );
      expect(result).toBe(
        'https://dars.example/en/login?next=%2Fen%2Fclasses%2F00000000-0000-4000-8000-000000000000',
      );
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('passes an allowlisted signup role to the callback without provider authorization parameters', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      const signInWithOAuth = vi.fn(async () => ({
        data: { url: 'https://accounts.google.com/o/oauth2' },
        error: null,
      }));
      createClientMock.mockResolvedValue({ auth: { signInWithOAuth } });
      await redirectTarget(() => googleSignInAction('en', null, form({ google_role: 'teacher' })));
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo:
            'https://dars.example/api/auth/callback?next=/en/dashboard&google_role=teacher',
        },
      });
    });

    it('preserves the signup role and safe next path on the canonical signup entry', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      requestOriginMock.value = 'http://dars.example';
      const result = await redirectTarget(() =>
        googleSignInAction(
          'ar',
          null,
          form({ google_role: 'teacher', next: '/ar/groups/00000000-0000-4000-8000-000000000000' }),
        ),
      );
      expect(result).toBe(
        'https://dars.example/ar/register?role=teacher&next=%2Far%2Fgroups%2F00000000-0000-4000-8000-000000000000',
      );
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('fails closed on a malformed Origin without creating a client', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      requestOriginMock.value = 'null';
      const result = await googleSignInAction('en', null, form({}));
      expect(result?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('rejects a malformed signup role before starting OAuth', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      const result = await googleSignInAction('en', null, form({ google_role: 'admin' }));
      expect(result?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('chooseGoogleRoleAction', () => {
    const profileQuery = vi.fn();
    const rpc = vi.fn();
    const signOut = vi.fn(async () => ({ error: null }));
    beforeEach(() => {
      profileQuery.mockReset();
      rpc.mockReset();
    });
    const client = (user: unknown) => ({
      auth: { getUser: async () => ({ data: { user }, error: null }), signOut },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profileQuery }) }) }),
      rpc,
    });

    it('requires an authenticated Google identity and a valid student or teacher role', async () => {
      createClientMock.mockResolvedValue(
        client({ id: 'u1', identities: [{ provider: 'password' }] }),
      );
      expect(
        await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'teacher' }))),
      ).toBe('/en/login');
      createClientMock.mockResolvedValue(
        client({ id: 'u1', identities: [{ provider: 'google' }] }),
      );
      expect(
        await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'admin' }))),
      ).toBe('/en/login?error=setup');
      expect(rpc).not.toHaveBeenCalled();
    });

    it('completes only a new profile with an allowlisted role', async () => {
      profileQuery
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { role: 'teacher', status: 'active' }, error: null });
      rpc.mockReset().mockResolvedValue({ data: 'teacher', error: null });
      createClientMock.mockResolvedValue(
        client({ id: 'u1', identities: [{ provider: 'google' }] }),
      );
      expect(
        await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'teacher' }))),
      ).toBe('/en/teacher');
      expect(rpc).toHaveBeenCalledWith('complete_google_signup', { p_role: 'teacher' });
      expect(onboardingDestinationMock).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        'teacher',
        'en',
        '/en/teacher',
      );
    });

    it('does not complete an existing student profile from the teacher choice page', async () => {
      profileQuery.mockResolvedValue({ data: { role: 'student', status: 'active' }, error: null });
      createClientMock.mockResolvedValue(
        client({ id: 'u1', identities: [{ provider: 'google' }] }),
      );
      expect(
        await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'teacher' }))),
      ).toBe('/en/student');
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
